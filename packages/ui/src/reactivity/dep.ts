// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/src/dep.ts (MIT)
import { isIntegerKey, isObject } from '../shared.ts';
import {
  activeSub,
  batchDepth,
  cycle,
  endBatch,
  flush,
  runDepth,
  startBatch,
  system,
  type Dependency,
} from './core.ts';
import type { Ref } from './ref.ts';
import { ReactiveFlags, type Link } from './system.ts';

const { link, propagate, shallowPropagate } = system;

/**
 * The flags a proxy answers. `isReactive()` and friends only read them, so an object that is not
 * a proxy can claim them too (the component props proxy does).
 */
export interface Target {
  __v_skip?: boolean;
  __v_isReactive?: boolean;
  __v_isReadonly?: boolean;
  __v_isShallow?: boolean;
  __v_raw?: unknown;
}

/** The kind of change passed to `trigger()`. */
export type TriggerType = 'set' | 'add' | 'delete' | 'clear';

/** Tracked by `in`, `Object.keys()` and collection iteration; triggered when keys are added or removed. */
export const ITERATE_KEY: unique symbol = Symbol('iterate');
/** Tracked by `Map.prototype.keys()`; not triggered when an existing key gets a new value. */
export const MAP_KEY_ITERATE_KEY: unique symbol = Symbol('Map keys iterate');
/** Tracked by the array methods that read every item; triggered by any index or length change. */
export const ARRAY_ITERATE_KEY: unique symbol = Symbol('Array iterate');

/** One reactive key of one target: a node of the graph with subscribers and no value. */
export class Dep implements Dependency {
  subs: Link | undefined = undefined;
  subsTail: Link | undefined = undefined;
  flags: number = ReactiveFlags.Mutable;
  readonly target: object;
  readonly key: unknown;

  constructor(target: object, key: unknown) {
    this.target = target;
    this.key = key;
  }

  /** Marks the key changed and notifies its subscribers, as a ref write does. */
  trigger(): void {
    this.flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty;
    propagate(this.subs!, runDepth > 0);
    if (!batchDepth) flush();
  }

  /** The proxy handler compared the values before triggering, so a dirty key always changed. */
  update(): boolean {
    this.flags = ReactiveFlags.Mutable;
    return true;
  }

  /** The last subscriber left: forget the key, and the target once it has no keys left. */
  unwatched(): void {
    const keys = targetMap.get(this.target)!;
    keys.delete(this.key);
    if (!keys.size) targetMap.delete(this.target);
  }
}

/** The tracked keys of each raw target. Entries exist only while a key has subscribers. */
export const targetMap: WeakMap<object, Map<unknown, Dep>> = new WeakMap();

/** Links the `Dep` of `target[key]` to the running effect or computed; a no-op without one. */
export function track(target: object, key: unknown): void {
  if (activeSub === undefined) return;
  let keys = targetMap.get(target);
  if (keys === undefined) targetMap.set(target, (keys = new Map()));
  let dep = keys.get(key);
  if (dep === undefined) {
    keys.set(key, (dep = new Dep(target, key)));
  } else if (dep.flags & ReactiveFlags.Dirty) {
    // Read again after a change that no subscriber checked yet: settle it now, as a ref read does,
    // so that a later check does not count the same change twice.
    dep.update();
    shallowPropagate(dep.subs!);
  }
  link(dep, activeSub, cycle);
}

const run = (dep: Dep | undefined): void => dep?.trigger();

/**
 * Notifies the keys that a change of `target` affects, in one batch, so that an effect that reads
 * several of them runs once.
 */
export function trigger(
  target: object,
  type: TriggerType,
  key?: unknown,
  newValue?: unknown,
): void {
  const keys = targetMap.get(target);
  if (keys === undefined) return;
  startBatch();
  if (type === 'clear') {
    keys.forEach(run);
  } else if (Array.isArray(target) && key === 'length') {
    const length = Number(newValue);
    keys.forEach((dep, k) => {
      if (
        k === 'length' ||
        k === ARRAY_ITERATE_KEY ||
        (typeof k === 'string' && Number(k) >= length)
      ) {
        dep.trigger();
      }
    });
  } else {
    run(keys.get(key));
    if (Array.isArray(target)) {
      if (isIntegerKey(key)) {
        run(keys.get(ARRAY_ITERATE_KEY));
        if (type === 'add') run(keys.get('length'));
      }
    } else if (type !== 'set') {
      run(keys.get(ITERATE_KEY));
      if (target instanceof Map) run(keys.get(MAP_KEY_ITERATE_KEY));
    } else if (target instanceof Map) {
      run(keys.get(ITERATE_KEY));
    }
  }
  endBatch();
}

/** The `Dep` of `target[key]` while the key has subscribers. */
export function getDepFromReactive(target: object, key: unknown): Dep | undefined {
  return targetMap.get(target)?.get(key);
}

// oxlint-disable-next-line typescript/no-redundant-type-constituents -- `Ref<T>` infers `T`
export function isRef<T>(r: Ref<T> | unknown): r is Ref<T>;
export function isRef(r: unknown): boolean {
  return isObject(r) && r.__v_isRef === true;
}

/** Reads a flag that a proxy answers (and that any object may claim). */
export const flag = (value: unknown, key: keyof Target): unknown =>
  isObject(value) ? value[key] : undefined;

/** Whether `value` is a reactive proxy, or a readonly proxy over one. */
export function isReactive(value: unknown): boolean {
  if (isReadonly(value)) return isReactive(flag(value, '__v_raw'));
  return !!flag(value, '__v_isReactive');
}

/** Whether `value` is a readonly proxy (or a getter-only computed). */
export function isReadonly(value: unknown): boolean {
  return !!flag(value, '__v_isReadonly');
}

/** Whether `value` is a shallow proxy or a `shallowRef`. */
export function isShallow(value: unknown): boolean {
  return !!flag(value, '__v_isShallow');
}

/** The raw object under every proxy layer of `observed`, or `observed` itself. */
export function toRaw<T>(observed: T): T {
  const raw = flag(observed, '__v_raw');
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a proxy has the type of its target
  return raw ? toRaw(raw as T) : observed;
}
