// oxlint-disable typescript/no-explicit-any -- the public signatures default to `any` on purpose
import { vibeError } from '../errors.gen.ts';
import { hasChanged, isFunction, isIntegerKey, isObject } from '../shared.ts';
import { warn } from '../warn.ts';
import { ComputedRefImpl, type ComputedRef, type WritableComputedRef } from './computed.ts';
import {
  activeSub,
  batchDepth,
  cycle,
  DIRTY,
  flush,
  MUTABLE,
  runDepth,
  system,
  type Dependency,
} from './core.ts';
import {
  flag,
  getDepFromReactive,
  isReactive,
  isReadonly,
  isRef,
  isShallow,
  toRaw,
} from './dep.ts';
import { isProxy, toReactive } from './reactive.ts';
import type { Link } from './system.ts';

const { link, propagate, shallowPropagate } = system;

declare const RefSymbol: unique symbol;
declare const ShallowRefMarker: unique symbol;
/** The type-only brand of `markRaw()` values, which are never unwrapped. */
export declare const RawSymbol: unique symbol;
/**
 * The type-only brand of `shallowReactive()` values, which are never unwrapped. A private class
 * member keeps it out of `keyof`, indexed access and plain object assignments.
 */
declare class ShallowReactiveBrandClass {
  private __shallowReactiveBrand?: never;
}
export type ShallowReactiveBrand = ShallowReactiveBrandClass;

export interface Ref<T = any, S = T> {
  get value(): T;
  set value(_: S);
  /** A type-only brand. */
  [RefSymbol]: true;
}

export interface ShallowRef<T = any, S = T> extends Ref<T, S> {
  /** A type-only brand: the value is not unwrapped. */
  [ShallowRefMarker]?: true;
}

export type MaybeRef<T = any> = T | Ref<T> | ShallowRef<T> | WritableComputedRef<T>;
export type MaybeRefOrGetter<T = any> = MaybeRef<T> | ComputedRef<T> | (() => T);

type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;
export type Builtin =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | undefined
  | null
  | Date
  | Error
  | RegExp
  | (abstract new (...args: any[]) => unknown);

export type UnwrapRef<T> =
  T extends ShallowRef<infer V, unknown>
    ? V
    : T extends Ref<infer V, unknown>
      ? UnwrapRefSimple<V>
      : UnwrapRefSimple<T>;

// DOM nodes and windows are not unwrapped (upstream adds them through `RefUnwrapBailTypes`).
export type UnwrapRefSimple<T> = T extends
  | Builtin
  | Node
  | Window
  | Ref
  | ((...args: any[]) => unknown)
  | { [RawSymbol]?: true }
  ? T
  : T extends ShallowReactiveBrand
    ? T
    : T extends Map<infer K, infer V>
      ? Map<K, UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof Map<any, any>>>
      : T extends WeakMap<infer K, infer V>
        ? WeakMap<K, UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof WeakMap<any, any>>>
        : T extends Set<infer V>
          ? Set<UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof Set<any>>>
          : T extends WeakSet<infer V>
            ? WeakSet<UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof WeakSet<any>>>
            : T extends readonly any[]
              ? { [K in keyof T]: UnwrapRefSimple<T[K]> }
              : T extends object
                ? { [P in keyof T]: P extends symbol ? T[P] : UnwrapRef<T[P]> }
                : T;

type DistributeRef<T> = T extends Ref<infer V, unknown> ? V : T;
export type ShallowUnwrapRef<T> = { [K in keyof T]: DistributeRef<T[K]> };
export type ToRef<T> = IfAny<T, Ref<T>, [T] extends [Ref] ? T : Ref<T>>;
export type ToRefs<T = any> = { [K in keyof T]: ToRef<T[K]> };

/**
 * A mutable value that its readers track. It keeps the written value apart from the current one
 * until a reader pulls it, so writing A, B, then A again in a batch changes nothing. Unless it is
 * shallow, it holds an object as its reactive proxy and compares writes by their raw value.
 */
export class RefImpl<T = unknown> implements Dependency {
  subs: Link | undefined = undefined;
  subsTail: Link | undefined = undefined;
  flags: number = MUTABLE;
  /** The last written value, unwrapped from its proxy unless stored as-is. */
  rawValue: T;
  currentValue: T;
  pendingValue: T;
  readonly __v_isRef = true;
  readonly __v_isShallow: boolean;

  constructor(value: T, shallow = false) {
    this.__v_isShallow = shallow;
    this.rawValue = shallow ? value : toRaw(value);
    this.currentValue = this.pendingValue = shallow ? value : toReactive(value);
  }

  get value(): T {
    if (this.flags & DIRTY && this.update() && this.subs !== undefined) {
      shallowPropagate(this.subs);
    }
    if (activeSub !== undefined) link(this, activeSub, cycle);
    return this.currentValue;
  }

  set value(value: T) {
    // A shallow or readonly proxy is stored as-is, so that it keeps its mode.
    const asIs = this.__v_isShallow || isShallow(value) || isReadonly(value);
    const raw = asIs ? value : toRaw(value);
    if (!hasChanged(raw, this.rawValue)) return;
    this.rawValue = raw;
    this.pendingValue = asIs ? raw : toReactive(raw);
    this.flags = MUTABLE | DIRTY;
    if (this.subs === undefined) return;
    propagate(this.subs, runDepth > 0);
    if (!batchDepth) flush();
  }

  update(): boolean {
    this.flags = MUTABLE;
    return hasChanged(this.currentValue, (this.currentValue = this.pendingValue));
  }

  unwatched(): void {}
}

/**
 * The ref of `toRef(object, key)`: reads and writes `object[key]` through the object, so a proxy
 * tracks and guards each access. Where the proxy layers would not unwrap a ref stored at the key
 * (a plain or shallow object), this ref unwraps it itself.
 */
class PropertyRef {
  readonly __v_isRef = true;
  readonly object: Record<PropertyKey, unknown>;
  readonly key: PropertyKey;
  readonly defaultValue: unknown;
  /** The raw object, whose key `triggerRef()` notifies. */
  readonly raw: Record<PropertyKey, unknown>;
  /** Whether no proxy layer unwraps a ref at the key. */
  readonly shallow: boolean;

  constructor(object: Record<PropertyKey, unknown>, key: PropertyKey, defaultValue?: unknown) {
    this.object = object;
    // The proxy tracks the key as JS converts it, e.g. `0` and `[0]` as '0'.
    this.key = typeof key === 'symbol' ? key : String(key);
    this.defaultValue = defaultValue;
    this.raw = toRaw(object);
    let shallow = true;
    // Array items are never unwrapped; other keys are by the first deep layer.
    if (!Array.isArray(object) || !isIntegerKey(this.key)) {
      let layer: unknown = object;
      do shallow = !isProxy(layer) || isShallow(layer);
      while (shallow && (layer = flag(layer, '__v_raw')));
    }
    this.shallow = shallow;
  }

  get value(): unknown {
    let value = this.object[this.key];
    if (this.shallow) value = unref(value);
    return value === undefined ? this.defaultValue : value;
  }

  set value(value: unknown) {
    // Read through the object, so that a proxy tracks the key, only when a ref is stored there.
    const nested = this.shallow && isRef(this.raw[this.key]) ? this.object[this.key] : undefined;
    if (isRef(nested)) nested.value = value;
    else this.object[this.key] = value;
  }
}

/** The readonly ref of `toRef(getter)`. */
class GetterRef {
  readonly __v_isRef = true;
  readonly getter: () => unknown;

  constructor(getter: () => unknown) {
    this.getter = getter;
  }

  get value(): unknown {
    return this.getter();
  }
}

export function ref<T>(
  value: T,
): [T] extends [Ref] ? IfAny<T, Ref<T>, T> : Ref<UnwrapRef<T>, UnwrapRef<T> | T>;
export function ref<T = any>(): Ref<T | undefined>;
export function ref(value?: unknown): any {
  return isRef(value) ? value : new RefImpl(value);
}

export function shallowRef<T>(
  value: T,
): Ref extends T ? (T extends Ref ? IfAny<T, ShallowRef<T>, T> : ShallowRef<T>) : ShallowRef<T>;
export function shallowRef<T = any>(): ShallowRef<T | undefined>;
export function shallowRef(value?: unknown): any {
  return isRef(value) ? value : new RefImpl(value, true);
}

export function unref<T>(maybeRef: MaybeRef<T> | ComputedRef<T>): T {
  return isRef(maybeRef) ? maybeRef.value : maybeRef;
}

export function toValue<T>(source: MaybeRefOrGetter<T>): T;
export function toValue(source: unknown): unknown {
  return isFunction(source) ? source() : unref(source);
}

export function toRef<T>(
  value: T,
): T extends () => infer R ? Readonly<Ref<R>> : T extends Ref ? T : Ref<UnwrapRef<T>>;
export function toRef<T extends object, K extends keyof T>(object: T, key: K): ToRef<T[K]>;
export function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K,
  defaultValue: T[K],
): ToRef<Exclude<T[K], undefined>>;
export function toRef(source: unknown, key?: PropertyKey, defaultValue?: unknown): any {
  if (isRef(source)) return source;
  if (isFunction(source)) return new GetterRef(source);
  return isObject(source) && key !== undefined
    ? new PropertyRef(source, key, defaultValue)
    : ref(source);
}

export function toRefs<T extends object>(object: T): ToRefs<T>;
export function toRefs(object: Record<PropertyKey, unknown>): any {
  if (__DEV__ && !isReactive(object) && !isReadonly(object)) warn(vibeError('VIBE5004'));
  const refs: any = Array.isArray(object) ? Array.from({ length: object.length }) : {};
  for (const key in object) refs[key] = new PropertyRef(object, key);
  return refs;
}

/**
 * A view of `object` that reads refs as their values and writes plain values into the refs it
 * holds; accessors pass through. A reactive object already unwraps, so it is returned as is.
 */
export function proxyRefs<T extends object>(object: T): ShallowUnwrapRef<T>;
export function proxyRefs(object: object): unknown {
  if (isReactive(object)) return object;
  return new Proxy(object, {
    get: (target, key, receiver) =>
      key === '__v_raw' ? target : unref(Reflect.get(target, key, receiver)),
    set: (target, key, value, receiver) => {
      const old: unknown = Reflect.get(target, key, receiver);
      if (isRef(old) && !isRef(value)) {
        old.value = value;
        return true;
      }
      return Reflect.set(target, key, value, receiver);
    },
  });
}

/** Notifies the readers of a ref as if its value changed, e.g. after mutating a `shallowRef`. */
export function triggerRef(source: Ref): void {
  // A readonly proxy of a ref triggers the ref itself.
  const target = toRaw(source);
  // A property ref notifies the readers of its key; a getter ref has no readers of its own.
  if (target instanceof PropertyRef) return getDepFromReactive(target.raw, target.key)?.trigger();
  if (!(target instanceof RefImpl || target instanceof ComputedRefImpl)) return;
  const subs = target.subs;
  if (subs === undefined) return;
  propagate(subs, runDepth > 0);
  shallowPropagate(subs);
  if (!batchDepth) flush();
}
