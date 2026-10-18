// oxlint-disable typescript/no-explicit-any -- the public signatures default to `any` on purpose
import { hasChanged, isFunction, isObject } from '../shared.ts';
import type { ComputedRef, WritableComputedRef } from './computed.ts';
import { activeSub, batchDepth, cycle, flush, runDepth, system, type Dependency } from './core.ts';
import { ReactiveFlags, type Link } from './system.ts';

const { link, propagate, shallowPropagate } = system;

declare const RefSymbol: unique symbol;
declare const ShallowRefMarker: unique symbol;

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
type Builtin =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | undefined
  | null
  | Date
  | Error
  | RegExp;

export type UnwrapRef<T> =
  T extends ShallowRef<infer V, unknown>
    ? V
    : T extends Ref<infer V, unknown>
      ? UnwrapRefSimple<V>
      : UnwrapRefSimple<T>;

type UnwrapRefSimple<T> = T extends Builtin | Ref | ((...args: any[]) => unknown)
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
 * until a reader pulls it, so writing A, B, then A again in a batch changes nothing.
 */
export class RefImpl<T = unknown> implements Dependency {
  subs: Link | undefined = undefined;
  subsTail: Link | undefined = undefined;
  flags: number = ReactiveFlags.Mutable;
  currentValue: T;
  pendingValue: T;
  readonly __v_isRef = true;

  constructor(value: T) {
    this.currentValue = this.pendingValue = value;
  }

  get value(): T {
    if (this.flags & ReactiveFlags.Dirty && this.update() && this.subs !== undefined) {
      shallowPropagate(this.subs);
    }
    if (activeSub !== undefined) link(this, activeSub, cycle);
    return this.currentValue;
  }

  set value(value: T) {
    if (!hasChanged(value, this.pendingValue)) return;
    this.pendingValue = value;
    this.flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty;
    if (this.subs === undefined) return;
    propagate(this.subs, runDepth > 0);
    if (!batchDepth) flush();
  }

  update(): boolean {
    this.flags = ReactiveFlags.Mutable;
    return hasChanged(this.currentValue, (this.currentValue = this.pendingValue));
  }

  unwatched(): void {}
}

/** The ref of `toRef(object, key)`: reads and writes `object[key]`, through a ref stored there. */
class PropertyRef {
  readonly __v_isRef = true;
  readonly object: Record<PropertyKey, unknown>;
  readonly key: PropertyKey;
  readonly defaultValue: unknown;

  constructor(object: Record<PropertyKey, unknown>, key: PropertyKey, defaultValue?: unknown) {
    this.object = object;
    this.key = key;
    this.defaultValue = defaultValue;
  }

  get value(): unknown {
    const value = unref(this.object[this.key]);
    return value === undefined ? this.defaultValue : value;
  }

  set value(value: unknown) {
    const current = this.object[this.key];
    if (isRef(current)) current.value = value;
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
  return ref(value);
}

// oxlint-disable-next-line typescript/no-redundant-type-constituents -- `Ref<T>` infers `T`
export function isRef<T>(r: Ref<T> | unknown): r is Ref<T>;
export function isRef(r: unknown): boolean {
  return isObject(r) && r.__v_isRef === true;
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
  if (Array.isArray(object)) return object.map((_, index) => new PropertyRef(object, index));
  const refs: Record<string, PropertyRef> = {};
  for (const key in object) refs[key] = new PropertyRef(object, key);
  return refs;
}

/** Notifies the readers of a ref as if its value changed, e.g. after mutating a `shallowRef`. */
export function triggerRef(target: Ref): void {
  if (!(target instanceof RefImpl) || target.subs === undefined) return;
  propagate(target.subs, runDepth > 0);
  shallowPropagate(target.subs);
  if (!batchDepth) flush();
}
