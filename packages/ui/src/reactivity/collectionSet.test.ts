// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/__tests__/collections/Set.spec.ts (MIT)
// oxlint-disable eslint/no-unused-expressions, typescript/no-explicit-any, typescript/no-unnecessary-type-assertion, typescript/no-unsafe-type-assertion, unicorn/consistent-function-scoping, vitest/require-mock-type-parameters -- ported as upstream wrote it
//
// Left out: the dev warning for a collection that holds both a raw object and its proxy, which
// this API does not have.
import { describe, expect, it, vi } from 'vitest';
import { ReactiveEffect } from './core.ts';
import { isReactive, toRaw } from './dep.ts';
import { reactive, readonly, shallowReactive } from './reactive.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

describe('reactivity/collections', () => {
  function coverCollectionFn(collection: Set<any>, fnName: string) {
    const spy = vi.fn();
    let proxy = reactive(collection);
    (collection as any)[fnName] = spy;
    return [proxy as any, spy];
  }

  describe('Set', () => {
    it('instanceof', () => {
      const original = new Set();
      const observed = reactive(original);
      expect(isReactive(observed)).toBe(true);
      expect(original).toBeInstanceOf(Set);
      expect(observed).toBeInstanceOf(Set);
    });

    it('should observe mutations', () => {
      let dummy;
      const set = reactive(new Set());
      effect(() => (dummy = set.has('value')));

      expect(dummy).toBe(false);
      set.add('value');
      expect(dummy).toBe(true);
      set.delete('value');
      expect(dummy).toBe(false);
    });

    it('should observe mutations with observed value', () => {
      let dummy;
      const value = reactive({});
      const set = reactive(new Set());
      effect(() => (dummy = set.has(value)));

      expect(dummy).toBe(false);
      set.add(value);
      expect(dummy).toBe(true);
      set.delete(value);
      expect(dummy).toBe(false);
    });

    it('should observe for of iteration', () => {
      let dummy;
      const set = reactive(new Set() as Set<number>);
      effect(() => {
        dummy = 0;
        for (let num of set) {
          dummy += num;
        }
      });

      expect(dummy).toBe(0);
      set.add(2);
      set.add(1);
      expect(dummy).toBe(3);
      set.delete(2);
      expect(dummy).toBe(1);
      set.clear();
      expect(dummy).toBe(0);
    });

    it('should observe forEach iteration', () => {
      let dummy: any;
      const set = reactive(new Set());
      effect(() => {
        dummy = 0;
        set.forEach((num) => (dummy += num));
      });

      expect(dummy).toBe(0);
      set.add(2);
      set.add(1);
      expect(dummy).toBe(3);
      set.delete(2);
      expect(dummy).toBe(1);
      set.clear();
      expect(dummy).toBe(0);
    });

    it('should observe values iteration', () => {
      let dummy;
      const set = reactive(new Set() as Set<number>);
      effect(() => {
        dummy = 0;
        for (let num of set.values()) {
          dummy += num;
        }
      });

      expect(dummy).toBe(0);
      set.add(2);
      set.add(1);
      expect(dummy).toBe(3);
      set.delete(2);
      expect(dummy).toBe(1);
      set.clear();
      expect(dummy).toBe(0);
    });

    it('should observe keys iteration', () => {
      let dummy;
      const set = reactive(new Set() as Set<number>);
      effect(() => {
        dummy = 0;
        for (let num of set.keys()) {
          dummy += num;
        }
      });

      expect(dummy).toBe(0);
      set.add(2);
      set.add(1);
      expect(dummy).toBe(3);
      set.delete(2);
      expect(dummy).toBe(1);
      set.clear();
      expect(dummy).toBe(0);
    });

    it('should observe entries iteration', () => {
      let dummy;
      const set = reactive(new Set<number>());
      effect(() => {
        dummy = 0;
        for (let [key, num] of set.entries()) {
          key;
          dummy += num;
        }
      });

      expect(dummy).toBe(0);
      set.add(2);
      set.add(1);
      expect(dummy).toBe(3);
      set.delete(2);
      expect(dummy).toBe(1);
      set.clear();
      expect(dummy).toBe(0);
    });

    it('should be triggered by clearing', () => {
      let dummy;
      const set = reactive(new Set());
      effect(() => (dummy = set.has('key')));

      expect(dummy).toBe(false);
      set.add('key');
      expect(dummy).toBe(true);
      set.clear();
      expect(dummy).toBe(false);
    });

    it('should not observe custom property mutations', () => {
      let dummy;
      const set: any = reactive(new Set());
      effect(() => (dummy = set.customProp));

      expect(dummy).toBe(undefined);
      set.customProp = 'Hello World';
      expect(dummy).toBe(undefined);
    });

    it('should observe size mutations', () => {
      let dummy;
      const set = reactive(new Set());
      effect(() => (dummy = set.size));

      expect(dummy).toBe(0);
      set.add('value');
      set.add('value2');
      expect(dummy).toBe(2);
      set.delete('value');
      expect(dummy).toBe(1);
      set.clear();
      expect(dummy).toBe(0);
    });

    it('should not observe non value changing mutations', () => {
      let dummy;
      const set = reactive(new Set());
      const setSpy = vi.fn(() => (dummy = set.has('value')));
      effect(setSpy);

      expect(dummy).toBe(false);
      expect(setSpy).toHaveBeenCalledTimes(1);
      set.add('value');
      expect(dummy).toBe(true);
      expect(setSpy).toHaveBeenCalledTimes(2);
      set.add('value');
      expect(dummy).toBe(true);
      expect(setSpy).toHaveBeenCalledTimes(2);
      set.delete('value');
      expect(dummy).toBe(false);
      expect(setSpy).toHaveBeenCalledTimes(3);
      set.delete('value');
      expect(dummy).toBe(false);
      expect(setSpy).toHaveBeenCalledTimes(3);
      set.clear();
      expect(dummy).toBe(false);
      expect(setSpy).toHaveBeenCalledTimes(3);
    });

    it('should not observe raw data', () => {
      let dummy;
      const set = reactive(new Set());
      effect(() => (dummy = toRaw(set).has('value')));

      expect(dummy).toBe(false);
      set.add('value');
      expect(dummy).toBe(false);
    });

    it('should not observe raw iterations', () => {
      let dummy = 0;
      const set = reactive(new Set<number>());
      effect(() => {
        dummy = 0;
        for (let [num] of toRaw(set).entries()) {
          dummy += num;
        }
        for (let num of toRaw(set).keys()) {
          dummy += num;
        }
        for (let num of toRaw(set).values()) {
          dummy += num;
        }
        toRaw(set).forEach((num) => {
          dummy += num;
        });
        for (let num of toRaw(set)) {
          dummy += num;
        }
      });

      expect(dummy).toBe(0);
      set.add(2);
      set.add(3);
      expect(dummy).toBe(0);
      set.delete(2);
      expect(dummy).toBe(0);
    });

    it('should not be triggered by raw mutations', () => {
      let dummy;
      const set = reactive(new Set());
      effect(() => (dummy = set.has('value')));

      expect(dummy).toBe(false);
      toRaw(set).add('value');
      expect(dummy).toBe(false);
      dummy = true;
      toRaw(set).delete('value');
      expect(dummy).toBe(true);
      toRaw(set).clear();
      expect(dummy).toBe(true);
    });

    it('should not observe raw size mutations', () => {
      let dummy;
      const set = reactive(new Set());
      effect(() => (dummy = toRaw(set).size));

      expect(dummy).toBe(0);
      set.add('value');
      expect(dummy).toBe(0);
    });

    it('should not be triggered by raw size mutations', () => {
      let dummy;
      const set = reactive(new Set());
      effect(() => (dummy = set.size));

      expect(dummy).toBe(0);
      toRaw(set).add('value');
      expect(dummy).toBe(0);
    });

    it('should support objects as key', () => {
      let dummy;
      const key = {};
      const set = reactive(new Set());
      const setSpy = vi.fn(() => (dummy = set.has(key)));
      effect(setSpy);

      expect(dummy).toBe(false);
      expect(setSpy).toHaveBeenCalledTimes(1);

      set.add({});
      expect(dummy).toBe(false);
      expect(setSpy).toHaveBeenCalledTimes(1);

      set.add(key);
      expect(dummy).toBe(true);
      expect(setSpy).toHaveBeenCalledTimes(2);
    });

    it('should not pollute original Set with Proxies', () => {
      const set = new Set();
      const observed = reactive(set);
      const value = reactive({});
      observed.add(value);
      expect(observed.has(value)).toBe(true);
      expect(set.has(value)).toBe(false);
    });

    it('should observe nested values in iterations (forEach)', () => {
      const set = reactive(new Set([{ foo: 1 }]));
      let dummy: any;
      effect(() => {
        dummy = 0;
        set.forEach((value) => {
          expect(isReactive(value)).toBe(true);
          dummy += value.foo;
        });
      });
      expect(dummy).toBe(1);
      set.forEach((value) => {
        value.foo++;
      });
      expect(dummy).toBe(2);
    });

    it('should observe nested values in iterations (values)', () => {
      const set = reactive(new Set([{ foo: 1 }]));
      let dummy: any;
      effect(() => {
        dummy = 0;
        for (const value of set.values()) {
          expect(isReactive(value)).toBe(true);
          dummy += value.foo;
        }
      });
      expect(dummy).toBe(1);
      set.forEach((value) => {
        value.foo++;
      });
      expect(dummy).toBe(2);
    });

    it('should observe nested values in iterations (entries)', () => {
      const set = reactive(new Set([{ foo: 1 }]));
      let dummy: any;
      effect(() => {
        dummy = 0;
        for (const [key, value] of set.entries()) {
          expect(isReactive(key)).toBe(true);
          expect(isReactive(value)).toBe(true);
          dummy += value.foo;
        }
      });
      expect(dummy).toBe(1);
      set.forEach((value) => {
        value.foo++;
      });
      expect(dummy).toBe(2);
    });

    it('should observe nested values in iterations (for...of)', () => {
      const set = reactive(new Set([{ foo: 1 }]));
      let dummy: any;
      effect(() => {
        dummy = 0;
        for (const value of set) {
          expect(isReactive(value)).toBe(true);
          dummy += value.foo;
        }
      });
      expect(dummy).toBe(1);
      set.forEach((value) => {
        value.foo++;
      });
      expect(dummy).toBe(2);
    });

    it('should work with reactive entries in raw set', () => {
      const raw = new Set();
      const entry = reactive({});
      raw.add(entry);
      const set = reactive(raw);

      expect(set.has(entry)).toBe(true);

      expect(set.delete(entry)).toBe(true);
      expect(set.has(entry)).toBe(false);
    });

    it('should track deletion of reactive entries in raw set', () => {
      const raw = new Set();
      const entry = reactive({});
      raw.add(entry);
      const set = reactive(raw);

      let dummy;
      effect(() => {
        dummy = set.has(entry);
      });
      expect(dummy).toBe(true);

      set.delete(entry);
      expect(dummy).toBe(false);
    });

    it('should not add readonly versions of existing raw values', () => {
      const rawValue = {};
      const wrappedValue = readonly(rawValue);
      const set = reactive(new Set([rawValue]));

      expect(set.has(wrappedValue)).toBe(true);

      set.add(wrappedValue);

      expect(set.size).toBe(1);
      expect(toRaw(set).has(rawValue)).toBe(true);
      expect(toRaw(set).has(wrappedValue)).toBe(false);
    });

    it('should not add proxy versions of existing raw values to shallow sets', () => {
      const rawValue = {};
      const wrappedValue = reactive(rawValue);
      const set = shallowReactive(new Set([rawValue]));

      expect(set.has(wrappedValue)).toBe(true);

      set.add(wrappedValue);

      expect(set.size).toBe(1);
      expect(toRaw(set).has(rawValue)).toBe(true);
      expect(toRaw(set).has(wrappedValue)).toBe(false);
    });

    it('thisArg', () => {
      const raw = new Set(['value']);
      const proxy = reactive(raw);
      const thisArg = {};
      let count = 0;
      proxy.forEach(function (this: {}, value, _, set) {
        ++count;
        expect(this).toBe(thisArg);
        expect(value).toBe('value');
        expect(set).toBe(proxy);
      }, thisArg);
      expect(count).toBe(1);
    });

    it('should trigger Set.has only once for non-reactive keys', () => {
      const [proxy, spy] = coverCollectionFn(new Set(), 'has');
      proxy.has('foo');
      expect(spy).toBeCalledTimes(1);
    });

    it('should trigger Set.add only once for non-reactive keys', () => {
      const [proxy, spy] = coverCollectionFn(new Set(), 'add');
      proxy.add('foo');
      expect(spy).toBeCalledTimes(1);
    });

    it('should trigger Set.delete only once for non-reactive keys', () => {
      const [proxy, spy] = coverCollectionFn(new Set(), 'delete');
      proxy.delete('foo');
      expect(spy).toBeCalledTimes(1);
    });

    it('should trigger Set.clear only once for non-reactive keys', () => {
      const [proxy, spy] = coverCollectionFn(new Set(), 'clear');
      proxy.clear();
      expect(spy).toBeCalledTimes(1);
    });

    it('should return proxy from Set.add call', () => {
      const set = reactive(new Set());
      const result = set.add('a');
      expect(result).toBe(set);
    });
  });
});
