// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/__tests__/collections/WeakSet.spec.ts (MIT)
// oxlint-disable typescript/no-explicit-any, typescript/no-unsafe-type-assertion, vitest/require-mock-type-parameters -- ported as upstream wrote it
import { describe, expect, it, vi } from 'vitest';
import { ReactiveEffect } from './core.ts';
import { isReactive, toRaw } from './dep.ts';
import { reactive } from './reactive.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

describe('reactivity/collections', () => {
  describe('WeakSet', () => {
    it('instanceof', () => {
      const original = new WeakSet();
      const observed = reactive(original);
      expect(isReactive(observed)).toBe(true);
      expect(original).toBeInstanceOf(WeakSet);
      expect(observed).toBeInstanceOf(WeakSet);
    });

    it('should observe mutations', () => {
      let dummy;
      const value = {};
      const set = reactive(new WeakSet());
      effect(() => (dummy = set.has(value)));

      expect(dummy).toBe(false);
      set.add(value);
      expect(dummy).toBe(true);
      set.delete(value);
      expect(dummy).toBe(false);
    });

    it('should observe mutations with observed value', () => {
      let dummy;
      const value = reactive({});
      const set = reactive(new WeakSet());
      effect(() => (dummy = set.has(value)));

      expect(dummy).toBe(false);
      set.add(value);
      expect(dummy).toBe(true);
      set.delete(value);
      expect(dummy).toBe(false);
    });

    it('should not observe custom property mutations', () => {
      let dummy;
      const set: any = reactive(new WeakSet());
      effect(() => (dummy = set.customProp));

      expect(dummy).toBe(undefined);
      set.customProp = 'Hello World';
      expect(dummy).toBe(undefined);
    });

    it('should not observe non value changing mutations', () => {
      let dummy;
      const value = {};
      const set = reactive(new WeakSet());
      const setSpy = vi.fn(() => (dummy = set.has(value)));
      effect(setSpy);

      expect(dummy).toBe(false);
      expect(setSpy).toHaveBeenCalledTimes(1);
      set.add(value);
      expect(dummy).toBe(true);
      expect(setSpy).toHaveBeenCalledTimes(2);
      set.add(value);
      expect(dummy).toBe(true);
      expect(setSpy).toHaveBeenCalledTimes(2);
      set.delete(value);
      expect(dummy).toBe(false);
      expect(setSpy).toHaveBeenCalledTimes(3);
      set.delete(value);
      expect(dummy).toBe(false);
      expect(setSpy).toHaveBeenCalledTimes(3);
    });

    it('should not observe raw data', () => {
      const value = {};
      let dummy;
      const set = reactive(new WeakSet());
      effect(() => (dummy = toRaw(set).has(value)));

      expect(dummy).toBe(false);
      set.add(value);
      expect(dummy).toBe(false);
    });

    it('should not be triggered by raw mutations', () => {
      const value = {};
      let dummy;
      const set = reactive(new WeakSet());
      effect(() => (dummy = set.has(value)));

      expect(dummy).toBe(false);
      toRaw(set).add(value);
      expect(dummy).toBe(false);
    });

    it('should not pollute original Set with Proxies', () => {
      const set = new WeakSet();
      const observed = reactive(set);
      const value = reactive({});
      observed.add(value);
      expect(observed.has(value)).toBe(true);
      expect(set.has(value)).toBe(false);
    });

    it('should return proxy from WeakSet.add call', () => {
      const set = reactive(new WeakSet());
      const result = set.add({});
      expect(result).toBe(set);
    });
  });
});
