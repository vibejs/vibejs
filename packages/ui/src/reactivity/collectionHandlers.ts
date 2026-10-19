// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/src/collectionHandlers.ts (MIT)
// oxlint-disable typescript/no-explicit-any, typescript/no-unsafe-type-assertion -- collection methods
// forward keys and values of any type, and reach their target through untyped proxies
import { vibeError } from '../errors.gen.ts';
import { hasChanged } from '../shared.ts';
import { warn } from '../warn.ts';
import type { Wrap } from './arrayInstrumentations.ts';
import {
  ITERATE_KEY,
  MAP_KEY_ITERATE_KEY,
  isReadonly,
  isShallow,
  toRaw,
  track,
  trigger,
  type Target,
} from './dep.ts';

type Collection = Target & Map<any, any> & Set<any>;

// The prototype methods, so that an own method on the target runs only for the operation itself.
const proto = (target: object): Collection => Reflect.getPrototypeOf(target) as Collection;
const has = (target: Collection, key: unknown): boolean => proto(target).has.call(target, key);
const get = (target: Collection, key: unknown): unknown => proto(target).get.call(target, key);

const ignored = (operation: string, key: string): void =>
  warn(vibeError('VIBE5002', { operation, key }));
const quote = (key: unknown): string => {
  try {
    return `"${String(key)}"`;
  } catch {
    // An object without a usable `toString` (`Object.create(null)`): a readonly no-op never throws.
    return 'an object';
  }
};

/**
 * The proxy handler of `Map`, `Set`, `WeakMap` and `WeakSet` in one mode: it answers the flags and
 * returns instrumented methods. A method that the target does not have (iteration on a weak
 * collection) is not instrumented. Keys and values are wrapped with `wrap`, never ref-unwrapped.
 */
export function createCollectionHandler(
  readonly: boolean,
  shallow: boolean,
  wrap: Wrap,
): ProxyHandler<Collection> {
  /** Iterators yield wrapped values; `keys()` of a Map does not track value changes. */
  function iterate(
    self: Collection,
    method: 'keys' | 'values' | 'entries' | typeof Symbol.iterator,
  ) {
    const target = self.__v_raw as Collection;
    const raw = toRaw(target);
    const isMap = raw instanceof Map;
    const isPair = method === 'entries' || (method === Symbol.iterator && isMap);
    const inner = target[method]() as Iterator<any>;
    if (!readonly) track(raw, method === 'keys' && isMap ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
    const wrapped = Object.create(inner) as Iterator<unknown>;
    wrapped.next = () => {
      const { value, done } = inner.next();
      return done
        ? { value, done }
        : { value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value), done };
    };
    return wrapped;
  }

  const methods: Record<PropertyKey, unknown> = {
    get(this: Collection, key: unknown) {
      // In readonly(reactive(map)), `target` is the reactive proxy.
      const target = this.__v_raw as Collection;
      const raw = toRaw(target);
      const rawKey = toRaw(key);
      if (!readonly) {
        if (key !== rawKey) track(raw, key);
        track(raw, rawKey);
      }
      if (has(raw, key)) return wrap(target.get(key));
      if (has(raw, rawKey)) return wrap(target.get(rawKey));
      // Missing: still let the inner reactive proxy track the key.
      if (target !== raw) target.get(key);
      return undefined;
    },
    get size() {
      const target = (this as unknown as Collection).__v_raw as Collection;
      if (!readonly) track(toRaw(target), ITERATE_KEY);
      return target.size;
    },
    has(this: Collection, key: unknown) {
      const target = this.__v_raw as Collection;
      const raw = toRaw(target);
      const rawKey = toRaw(key);
      if (!readonly) {
        if (key !== rawKey) track(raw, key);
        track(raw, rawKey);
      }
      return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
    },
    forEach(this: Collection, callback: (...args: unknown[]) => unknown, thisArg?: unknown) {
      const target = this.__v_raw as Collection;
      if (!readonly) track(toRaw(target), ITERATE_KEY);
      return target.forEach((value: unknown, key: unknown) =>
        callback.call(thisArg, wrap(value), wrap(key), this),
      );
    },
    keys(this: Collection) {
      return iterate(this, 'keys');
    },
    values(this: Collection) {
      return iterate(this, 'values');
    },
    entries(this: Collection) {
      return iterate(this, 'entries');
    },
    [Symbol.iterator](this: Collection) {
      return iterate(this, Symbol.iterator);
    },
  };

  if (readonly) {
    Object.assign(methods, {
      add(this: Collection, value: unknown) {
        ignored('add', quote(value));
        return this;
      },
      set(this: Collection, key: unknown) {
        ignored('set', quote(key));
        return this;
      },
      delete(key: unknown) {
        ignored('delete', quote(key));
        return false;
      },
      clear() {
        ignored('clear', 'all entries');
      },
    });
  } else {
    Object.assign(methods, {
      add(this: Collection, value: unknown) {
        const target = toRaw(this);
        const rawValue = toRaw(value);
        const hadValue = has(target, value) || (rawValue !== value && has(target, rawValue));
        if (!hadValue) {
          const added = shallow || isShallow(value) || isReadonly(value) ? value : rawValue;
          target.add(added);
          trigger(target, 'add', added);
        }
        return this;
      },
      set(this: Collection, key: unknown, value: unknown) {
        if (!shallow && !isShallow(value) && !isReadonly(value)) value = toRaw(value);
        const target = toRaw(this);
        let hadKey = has(target, key);
        if (!hadKey) {
          key = toRaw(key);
          hadKey = has(target, key);
        }
        const oldValue = get(target, key);
        target.set(key, value);
        if (!hadKey) trigger(target, 'add', key);
        else if (hasChanged(value, oldValue)) trigger(target, 'set', key);
        return this;
      },
      delete(this: Collection, key: unknown) {
        const target = toRaw(this);
        let hadKey = has(target, key);
        if (!hadKey) {
          key = toRaw(key);
          hadKey = has(target, key);
        }
        const result = target.delete(key);
        if (hadKey) trigger(target, 'delete', key);
        return result;
      },
      clear(this: Collection) {
        const target = toRaw(this);
        const hadItems = target.size !== 0;
        const result = target.clear();
        if (hadItems) trigger(target, 'clear');
        return result;
      },
    });
  }

  return {
    get(target, key, receiver: object) {
      switch (key) {
        case '__v_isReactive':
          return !readonly;
        case '__v_isReadonly':
          return readonly;
        case '__v_isShallow':
          return shallow;
        case '__v_raw':
          return target;
      }
      return Reflect.get(
        Object.hasOwn(methods, key) && key in target ? methods : target,
        key,
        receiver,
      );
    },
  };
}
