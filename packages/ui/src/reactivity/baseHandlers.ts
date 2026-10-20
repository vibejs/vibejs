// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/src/baseHandlers.ts (MIT)
import { vibeError } from '../errors.gen.ts';
import { hasChanged, isIntegerKey } from '../shared.ts';
import { warn } from '../warn.ts';
import type { Wrap } from './arrayInstrumentations.ts';
import {
  ITERATE_KEY,
  isReadonly,
  isRef,
  isShallow,
  toRaw,
  track,
  trigger,
  type Target,
} from './dep.ts';

type Raw = Target & Record<PropertyKey, unknown>;

/** The well-known symbols (`Symbol.iterator`, …): reading them never tracks. */
const builtInSymbols = /* @__PURE__ */ new Set(
  Object.getOwnPropertyNames(Symbol)
    .map((key): unknown => Reflect.get(Symbol, key))
    .filter((value) => typeof value === 'symbol'),
);

const isTrackable = (key: PropertyKey): boolean =>
  typeof key === 'symbol' ? !builtInSymbols.has(key) : key !== '__proto__' && key !== '__v_isRef';

function hasOwnProperty(this: object, key: unknown): boolean {
  // The key may be any value: `hasOwnProperty` converts it, so its Dep is the converted key.
  const name = typeof key === 'symbol' ? key : String(key);
  const raw = toRaw(this);
  track(raw, name);
  return Object.hasOwn(raw, name);
}

const ignored = (operation: string, key: PropertyKey): void => {
  if (__DEV__) warn(vibeError('VIBE5002', { operation, key: `"${String(key)}"` }));
};

/** The wrap that the array methods of a proxy apply to its items: see `wrapperFor` in `reactive.ts`. */
export const ARRAY_WRAP: unique symbol = Symbol('array wrap');

/**
 * The `get` trap of plain objects and arrays in one mode. `wrap` converts nested objects on read
 * (`toReactive`, `toReadonly`, or identity in the shallow modes) and `proxies` is the cache of the
 * mode, which tells the proxy's own receiver apart from other objects. Only the mutable modes
 * pass `arrayMethods`. `reactiveWrap` is what the array methods apply when the target is a
 * reactive proxy (deep readonly: `readonly(reactive(item))`, also over a shallow reactive array).
 */
function createGetter(
  readonly: boolean,
  shallow: boolean,
  wrap: Wrap,
  proxies: WeakMap<object, object>,
  arrayMethods?: Record<PropertyKey, unknown>,
  reactiveWrap = wrap,
): ProxyHandler<Raw>['get'] {
  return (target, key, receiver: object) => {
    switch (key) {
      case '__v_skip':
        return target.__v_skip;
      case '__v_isReactive':
        return !readonly;
      case '__v_isReadonly':
        return readonly;
      case '__v_isShallow':
        return shallow;
      case '__v_raw':
        // Only for this proxy or a user proxy around it (same prototype), not for an object
        // that inherits from it.
        return receiver === proxies.get(target) ||
          Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)
          ? target
          : undefined;
      case ARRAY_WRAP:
        // Only a readonly proxy has a reactive proxy as its target.
        return target.__v_isReactive ? reactiveWrap : wrap;
    }
    const isArray = Array.isArray(target);
    if (arrayMethods) {
      const method = isArray ? arrayMethods[key] : undefined;
      if (method) return method;
      if (key === 'hasOwnProperty') return hasOwnProperty;
    }
    // A proxied ref runs its accessors on the raw ref.
    const value = Reflect.get(target, key, isRef(target) ? target : receiver);
    if (!isTrackable(key)) return value;
    if (!readonly) track(target, key);
    if (shallow) return value;
    if (isRef(value)) {
      // Array items stay refs; other keys unwrap.
      const unwrapped = isArray && isIntegerKey(key) ? value : value.value;
      return readonly ? wrap(unwrapped) : unwrapped;
    }
    return wrap(value);
  };
}

/** The proxy handler of plain objects and arrays in a readonly mode: writes warn VIBE5002. */
export function createReadonlyHandler(
  shallow: boolean,
  wrap: Wrap,
  proxies: WeakMap<object, object>,
  reactiveWrap?: Wrap,
): ProxyHandler<Raw> {
  return {
    get: createGetter(true, shallow, wrap, proxies, undefined, reactiveWrap),
    set: (_, key) => {
      ignored('set', key);
      return true;
    },
    deleteProperty: (_, key) => {
      ignored('delete', key);
      return true;
    },
  };
}

/** The proxy handler of plain objects and arrays in a mutable mode: writes trigger. */
export function createMutableHandler(
  shallow: boolean,
  wrap: Wrap,
  proxies: WeakMap<object, object>,
  arrayMethods: Record<PropertyKey, unknown>,
): ProxyHandler<Raw> {
  return {
    get: createGetter(false, shallow, wrap, proxies, arrayMethods),
    set: (target, key, value: unknown, receiver: object) => {
      let oldValue = target[key];
      const isArrayIndex = Array.isArray(target) && isIntegerKey(key);
      if (!shallow) {
        const isOldValueReadonly = isReadonly(oldValue);
        // A shallow or readonly value is stored as-is; anything else is stored raw.
        if (!isShallow(value) && !isReadonly(value)) {
          oldValue = toRaw(oldValue);
          value = toRaw(value);
        }
        if (!isArrayIndex && isRef(oldValue) && !isRef(value)) {
          if (isOldValueReadonly) {
            ignored('set', key);
          } else {
            oldValue.value = value;
          }
          return true;
        }
      }
      const hadKey = isArrayIndex ? Number(key) < target.length : Object.hasOwn(target, key);
      const result = Reflect.set(target, key, value, isRef(target) ? target : receiver);
      // A write through an object that inherits from this proxy changes that object, not this one.
      if (result && target === toRaw(receiver)) {
        if (!hadKey) trigger(target, 'add', key, value);
        else if (hasChanged(value, oldValue)) trigger(target, 'set', key, value);
      }
      return result;
    },
    deleteProperty: (target, key) => {
      const hadKey = Object.hasOwn(target, key);
      const result = Reflect.deleteProperty(target, key);
      if (result && hadKey) trigger(target, 'delete', key);
      return result;
    },
    has: (target, key) => {
      const result = Reflect.has(target, key);
      if (isTrackable(key)) track(target, key);
      return result;
    },
    ownKeys: (target) => {
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
      return Reflect.ownKeys(target);
    },
  };
}
