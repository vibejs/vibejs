// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/__tests__/collections/WeakMap.spec.ts (MIT)
// oxlint-disable typescript/no-explicit-any, typescript/no-unsafe-type-assertion, vitest/require-mock-type-parameters -- ported as upstream wrote it
import { describe, expect, it, test, vi } from 'vitest';
import { ReactiveEffect } from './core.ts';
import { isReactive, toRaw } from './dep.ts';
import { reactive } from './reactive.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

describe('reactivity/collections', () => {
  describe('WeakMap', () => {
    test('instanceof', () => {
      const original = new WeakMap();
      const observed = reactive(original);
      expect(isReactive(observed)).toBe(true);
      expect(original).toBeInstanceOf(WeakMap);
      expect(observed).toBeInstanceOf(WeakMap);
    });

    it('should observe mutations', () => {
      let dummy;
      const key = {};
      const map = reactive(new WeakMap());
      effect(() => {
        dummy = map.get(key);
      });

      expect(dummy).toBe(undefined);
      map.set(key, 'value');
      expect(dummy).toBe('value');
      map.set(key, 'value2');
      expect(dummy).toBe('value2');
      map.delete(key);
      expect(dummy).toBe(undefined);
    });

    it('should observe mutations with observed value as key', () => {
      let dummy;
      const key = reactive({});
      const value = reactive({});
      const map = reactive(new WeakMap());
      effect(() => {
        dummy = map.get(key);
      });

      expect(dummy).toBe(undefined);
      map.set(key, value);
      expect(dummy).toBe(value);
      map.delete(key);
      expect(dummy).toBe(undefined);
    });

    it('should not observe custom property mutations', () => {
      let dummy;
      const map: any = reactive(new WeakMap());
      effect(() => (dummy = map.customProp));

      expect(dummy).toBe(undefined);
      map.customProp = 'Hello World';
      expect(dummy).toBe(undefined);
    });

    it('should not observe non value changing mutations', () => {
      let dummy;
      const key = {};
      const map = reactive(new WeakMap());
      const mapSpy = vi.fn(() => (dummy = map.get(key)));
      effect(mapSpy);

      expect(dummy).toBe(undefined);
      expect(mapSpy).toHaveBeenCalledTimes(1);
      map.set(key, undefined);
      expect(dummy).toBe(undefined);
      expect(mapSpy).toHaveBeenCalledTimes(2);
      map.set(key, 'value');
      expect(dummy).toBe('value');
      expect(mapSpy).toHaveBeenCalledTimes(3);
      map.set(key, 'value');
      expect(dummy).toBe('value');
      expect(mapSpy).toHaveBeenCalledTimes(3);
      map.delete(key);
      expect(dummy).toBe(undefined);
      expect(mapSpy).toHaveBeenCalledTimes(4);
      map.delete(key);
      expect(dummy).toBe(undefined);
      expect(mapSpy).toHaveBeenCalledTimes(4);
    });

    it('should not observe raw data', () => {
      let dummy;
      const key = {};
      const map = reactive(new WeakMap());
      effect(() => (dummy = toRaw(map).get(key)));

      expect(dummy).toBe(undefined);
      map.set(key, 'Hello');
      expect(dummy).toBe(undefined);
      map.delete(key);
      expect(dummy).toBe(undefined);
    });

    it('should not pollute original Map with Proxies', () => {
      const map = new WeakMap();
      const observed = reactive(map);
      const key = {};
      const value = reactive({});
      observed.set(key, value);
      expect(map.get(key)).not.toBe(value);
      expect(map.get(key)).toBe(toRaw(value));
    });

    it('should return observable versions of contained values', () => {
      const observed = reactive(new WeakMap());
      const key = {};
      const value = {};
      observed.set(key, value);
      const wrapped = observed.get(key);
      expect(isReactive(wrapped)).toBe(true);
      expect(toRaw(wrapped)).toBe(value);
    });

    it('should observed nested data', () => {
      const observed = reactive(new WeakMap());
      const key = {};
      observed.set(key, { a: 1 });
      let dummy;
      effect(() => {
        dummy = observed.get(key).a;
      });
      observed.get(key).a = 2;
      expect(dummy).toBe(2);
    });

    it('should not be trigger when the value and the old value both are NaN', () => {
      const map = new WeakMap();
      const key = {};
      map.set(key, NaN);
      const mapSpy = vi.fn(() => map.get(key));
      effect(mapSpy);
      map.set(key, NaN);
      expect(mapSpy).toHaveBeenCalledTimes(1);
    });
    it('should return proxy from WeakMap.set call', () => {
      const map = reactive(new WeakMap());
      const result = map.set({}, 'a');
      expect(result).toBe(map);
    });
  });
});
