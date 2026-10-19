// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/src/reactive.ts (MIT)
// oxlint-disable typescript/no-explicit-any -- the public types follow the upstream declarations
import { vibeError } from '../errors.gen.ts';
import { isObject } from '../shared.ts';
import { warn } from '../warn.ts';
import { createArrayInstrumentations, type Wrap } from './arrayInstrumentations.ts';
import { createBaseHandler } from './baseHandlers.ts';
import { createCollectionHandler } from './collectionHandlers.ts';
import { flag, isReactive, isReadonly, isShallow } from './dep.ts';
import type { Builtin, RawSymbol, Ref, ShallowReactiveMarker, UnwrapRefSimple } from './ref.ts';

declare const ReactiveMarkerSymbol: unique symbol;

interface ReactiveMarker {
  /** A type-only brand of reactive arrays. */
  [ReactiveMarkerSymbol]?: void;
}

/** Unwraps the refs nested in `T`, but not `T` itself. */
export type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRefSimple<T>;
export type Reactive<T> = UnwrapNestedRefs<T> & (T extends readonly any[] ? ReactiveMarker : {});
export type ShallowReactive<T> = T & { [ShallowReactiveMarker]?: true };
export type Raw<T> = T & { [RawSymbol]?: true };
export type DeepReadonly<T> = T extends Builtin | ((...args: any[]) => unknown)
  ? T
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
      : T extends WeakMap<infer K, infer V>
        ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends Set<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : T extends ReadonlySet<infer U>
            ? ReadonlySet<DeepReadonly<U>>
            : T extends WeakSet<infer U>
              ? WeakSet<DeepReadonly<U>>
              : T extends Promise<infer U>
                ? Promise<DeepReadonly<U>>
                : T extends Ref<infer U, unknown>
                  ? Readonly<Ref<DeepReadonly<U>>>
                  : T extends {}
                    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
                    : Readonly<T>;

// One cache per mode, so that each target has at most one proxy of each mode.
const reactiveMap = new WeakMap<object, object>();
const shallowReactiveMap = new WeakMap<object, object>();
const readonlyMap = new WeakMap<object, object>();
const shallowReadonlyMap = new WeakMap<object, object>();

const identity: Wrap = (value) => value;

/** The proxy of a nested value of a reactive target. */
export function toReactive<T>(value: T): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a proxy has the type of its target
  return isObject(value) ? (reactive(value) as T) : value;
}

/** The proxy of a nested value of a readonly target. */
function toReadonly<T>(value: T): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a proxy has the type of its target
  return isObject(value) ? (readonly(value) as T) : value;
}

const toReadonlyReactive: Wrap = (value) => toReadonly(toReactive(value));

/** How the items of `array` are wrapped when read through it (it may be readonly(reactive(x))). */
function wrapperFor(array: unknown[]): Wrap {
  if (isShallow(array)) return identity;
  if (!isReadonly(array)) return toReactive;
  return isReactive(array) ? toReadonlyReactive : toReadonly;
}

const arrayMethods = createArrayInstrumentations(wrapperFor);

const handlers = (
  readonly: boolean,
  shallow: boolean,
  wrap: Wrap,
  proxies: WeakMap<object, object>,
): [ProxyHandler<any>, ProxyHandler<any>] => [
  createBaseHandler(readonly, shallow, wrap, proxies, arrayMethods),
  createCollectionHandler(readonly, shallow, wrap),
];

const mutableHandlers = handlers(false, false, toReactive, reactiveMap);
const shallowReactiveHandlers = handlers(false, true, identity, shallowReactiveMap);
const readonlyHandlers = handlers(true, false, toReadonly, readonlyMap);
const shallowReadonlyHandlers = handlers(true, true, identity, shallowReadonlyMap);

const targetTypes: Partial<Record<string, 1 | 2>> = {
  Object: 1,
  Array: 1,
  Map: 2,
  Set: 2,
  WeakMap: 2,
  WeakSet: 2,
};

function createReactiveObject(
  target: unknown,
  api: string,
  readonly: boolean,
  [baseHandler, collectionHandler]: [ProxyHandler<any>, ProxyHandler<any>],
  proxies: WeakMap<object, object>,
): unknown {
  if (!isObject(target)) {
    warn(vibeError('VIBE5001', { api, value: String(target) }));
    return target;
  }
  // Already a proxy; only readonly() wraps a reactive proxy again.
  if (target.__v_raw && !(readonly && target.__v_isReactive)) return target;
  if (target.__v_skip || !Object.isExtensible(target)) return target;
  const existing = proxies.get(target);
  if (existing) return existing;
  const type = targetTypes[Object.prototype.toString.call(target).slice(8, -1)];
  if (!type) return target;
  const proxy = new Proxy(target, type === 2 ? collectionHandler : baseHandler);
  proxies.set(target, proxy);
  return proxy;
}

/**
 * A deep reactive proxy of `target`: reads track, writes trigger, nested objects are wrapped
 * when read and nested refs are unwrapped (except array items).
 */
export function reactive<T extends object>(target: T): Reactive<T>;
export function reactive(target: object): unknown {
  if (isReadonly(target)) return target;
  return createReactiveObject(target, 'reactive', false, mutableHandlers, reactiveMap);
}

/** A reactive proxy of the own keys of `target` only: values are stored and returned as-is. */
export function shallowReactive<T extends object>(target: T): ShallowReactive<T>;
export function shallowReactive(target: object): unknown {
  return createReactiveObject(
    target,
    'shallowReactive',
    false,
    shallowReactiveHandlers,
    shallowReactiveMap,
  );
}

/** A deep readonly proxy of `target`: writes warn VIBE5002 and reads do not track. */
export function readonly<T extends object>(target: T): DeepReadonly<UnwrapNestedRefs<T>>;
export function readonly(target: object): unknown {
  return createReactiveObject(target, 'readonly', true, readonlyHandlers, readonlyMap);
}

/** A readonly proxy of the own keys of `target` only: values are returned as-is. */
export function shallowReadonly<T extends object>(target: T): Readonly<T>;
export function shallowReadonly(target: object): unknown {
  return createReactiveObject(
    target,
    'shallowReadonly',
    true,
    shallowReadonlyHandlers,
    shallowReadonlyMap,
  );
}

/** Whether `value` is a proxy created by `reactive()`, `readonly()` or a shallow variant. */
export function isProxy(value: unknown): boolean {
  return !!flag(value, '__v_raw');
}

/** Marks `value` so that it is never proxied, also when nested in a reactive object. */
export function markRaw<T extends object>(value: T): Raw<T> {
  if (!Object.hasOwn(value, '__v_skip') && Object.isExtensible(value)) {
    Object.defineProperty(value, '__v_skip', { configurable: true, writable: true, value: true });
  }
  return value;
}
