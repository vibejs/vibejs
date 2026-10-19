// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/__tests__/shallowReactive.spec.ts (MIT)
// oxlint-disable typescript/no-explicit-any -- the ported cases write through untyped proxies
//
// onTrack is not part of this API: its two #1210 cases assert that the iteration re-runs instead.
import { describe, expect, test } from 'vitest';
import { ReactiveEffect } from './core.ts';
import { isReactive, isRef, isShallow } from './dep.ts';
import { reactive, shallowReactive, shallowReadonly } from './reactive.ts';
import { ref, type Ref } from './ref.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

describe('shallowReactive', () => {
  test('should not make non-reactive properties reactive', () => {
    const props = shallowReactive({ n: { foo: 1 } });
    expect(isReactive(props.n)).toBe(false);
  });

  test('should keep reactive properties reactive', () => {
    const props: any = shallowReactive({ n: reactive({ foo: 1 }) });
    props.n = reactive({ foo: 2 });
    expect(isReactive(props.n)).toBe(true);
  });

  // #2843
  test('should allow shallow and normal reactive for same target', () => {
    const original = { foo: {} };
    const shallowProxy = shallowReactive(original);
    const reactiveProxy = reactive(original);
    expect(shallowProxy).not.toBe(reactiveProxy);
    expect(isReactive(shallowProxy.foo)).toBe(false);
    expect(isReactive(reactiveProxy.foo)).toBe(true);
  });

  test('isShallow', () => {
    expect(isShallow(shallowReactive({}))).toBe(true);
    expect(isShallow(shallowReadonly({}))).toBe(true);
  });

  // #5271
  test('should respect shallow reactive nested inside reactive on reset', () => {
    const r = reactive({ foo: shallowReactive({ bar: {} }) });
    expect(isShallow(r.foo)).toBe(true);
    expect(isReactive(r.foo.bar)).toBe(false);

    r.foo = shallowReactive({ bar: {} });
    expect(isShallow(r.foo)).toBe(true);
    expect(isReactive(r.foo.bar)).toBe(false);
  });

  // vuejs/vue#12597
  test('should not unwrap refs', () => {
    const foo = shallowReactive({
      bar: ref(123),
    });
    expect(isRef(foo.bar)).toBe(true);
    expect(foo.bar.value).toBe(123);
  });

  // vuejs/vue#12688
  test('should not mutate refs', () => {
    const original = ref(123);
    const foo = shallowReactive<{ bar: Ref<number> | number }>({
      bar: original,
    });
    expect(foo.bar).toBe(original);
    foo.bar = 234;
    expect(foo.bar).toBe(234);
    expect(original.value).toBe(123);
  });

  test('should respect shallow/deep versions of same target on access', () => {
    const original = {};
    const shallow = shallowReactive(original);
    const deep = reactive(original);
    const r = reactive({ shallow, deep });
    expect(r.shallow).toBe(shallow);
    expect(r.deep).toBe(deep);
  });

  describe('collections', () => {
    test('should be reactive', () => {
      const shallowSet = shallowReactive(new Set());
      const a = {};
      let size;

      effect(() => {
        size = shallowSet.size;
      });

      expect(size).toBe(0);

      shallowSet.add(a);
      expect(size).toBe(1);

      shallowSet.delete(a);
      expect(size).toBe(0);
    });

    test('should not observe when iterating', () => {
      const shallowSet = shallowReactive(new Set());
      const a = {};
      shallowSet.add(a);

      const spreadA = [...shallowSet][0];
      expect(isReactive(spreadA)).toBe(false);
    });

    test('should not get reactive entry', () => {
      const shallowMap = shallowReactive(new Map());
      const a = {};
      const key = 'a';

      shallowMap.set(key, a);

      expect(isReactive(shallowMap.get(key))).toBe(false);
    });

    test('should not get reactive on foreach', () => {
      const shallowSet = shallowReactive(new Set());
      const a = {};
      shallowSet.add(a);

      shallowSet.forEach((x) => expect(isReactive(x)).toBe(false));
    });

    test('Setting a reactive object on a shallowReactive map', () => {
      const msg = ref('ads');
      const bar = reactive({ msg });
      const foo = shallowReactive(new Map([['foo1', bar]]));
      foo.set('foo2', bar);

      expect(isReactive(foo.get('foo2'))).toBe(true);
      expect(isReactive(foo.get('foo1'))).toBe(true);
    });

    test('Setting a reactive object on a shallowReactive set', () => {
      const msg = ref(1);
      const bar = reactive({ msg });
      const foo = reactive({ msg });

      const deps = shallowReactive(new Set([bar]));
      deps.add(foo);

      deps.forEach((dep) => {
        expect(isReactive(dep)).toBe(true);
      });
    });

    // #1210
    test('Array.from tracks the iteration', () => {
      const shallowSet = shallowReactive(new Set());
      let a;
      effect(() => {
        a = Array.from(shallowSet);
      });

      expect(a).toMatchObject([]);
      shallowSet.add(1);
      expect(a).toMatchObject([1]);
    });
  });

  describe('array', () => {
    test('should be reactive', () => {
      const shallowArray = shallowReactive<unknown[]>([]);
      const a = {};
      let size;

      effect(() => {
        size = shallowArray.length;
      });

      expect(size).toBe(0);

      shallowArray.push(a);
      expect(size).toBe(1);

      shallowArray.pop();
      expect(size).toBe(0);
    });

    test('should not observe when iterating', () => {
      const shallowArray = shallowReactive<object[]>([]);
      const a = {};
      shallowArray.push(a);

      const spreadA = [...shallowArray][0];
      expect(isReactive(spreadA)).toBe(false);
    });

    test('Array.from tracks the iteration', () => {
      const shallowArray = shallowReactive<number[]>([]);
      let a;
      effect(() => {
        a = Array.from(shallowArray);
      });

      expect(a).toMatchObject([]);
      shallowArray.push(1);
      expect(a).toMatchObject([1]);
    });
  });
});
