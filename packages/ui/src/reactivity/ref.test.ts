// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/__tests__/ref.spec.ts (MIT)
//
// The cases that need reactive(), readonly(), isReactive(), isShallow() or deep conversion in
// ref() move to RR-2; customRef() moves to RR-5.
import { describe, expect, it, test, vi } from 'vitest';
import { computed } from './computed.ts';
import { endBatch, ReactiveEffect, startBatch } from './core.ts';
import {
  isRef,
  ref,
  shallowRef,
  toRef,
  toRefs,
  toValue,
  triggerRef,
  unref,
  type Ref,
} from './ref.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

describe('reactivity/ref', () => {
  it('should hold a value', () => {
    const a = ref(1);
    expect(a.value).toBe(1);
    a.value = 2;
    expect(a.value).toBe(2);
  });

  it('should be reactive', () => {
    const a = ref(1);
    let dummy;
    const fn = vi.fn<() => void>(() => {
      dummy = a.value;
    });
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(dummy).toBe(1);
    a.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
    expect(dummy).toBe(2);
    // same value should not trigger
    a.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should work without initial value', () => {
    const a = ref();
    let dummy;
    effect(() => {
      dummy = a.value;
    });
    expect(dummy).toBe(undefined);
    a.value = 2;
    expect(dummy).toBe(2);
  });

  it('should unwrap nested ref in types', () => {
    const a = ref(0);
    const b = ref(a);
    expect(typeof (b.value + 1)).toBe('number');
  });

  it('should NOT unwrap ref types nested inside arrays', () => {
    const arr = ref([1, ref(3)]).value;
    expect(isRef(arr[0])).toBe(false);
    expect(isRef(arr[1])).toBe(true);
    const second = arr[1];
    expect(isRef(second) && second.value).toBe(3);
  });

  it('should keep tuple types', () => {
    const tuple: [number, string, { a: number }, () => number, Ref<number>] = [
      0,
      '1',
      { a: 1 },
      () => 0,
      ref(0),
    ];
    const tupleRef = ref(tuple);

    tupleRef.value[0]++;
    expect(tupleRef.value[0]).toBe(1);
    tupleRef.value[1] += '1';
    expect(tupleRef.value[1]).toBe('11');
    tupleRef.value[2].a++;
    expect(tupleRef.value[2].a).toBe(2);
    expect(tupleRef.value[3]()).toBe(0);
    tupleRef.value[4].value++;
    expect(tupleRef.value[4].value).toBe(1);
  });

  it('should keep symbols', () => {
    const customSymbol = Symbol();
    const obj = {
      [Symbol.asyncIterator]: ref(1),
      [Symbol.hasInstance]: { a: ref('a') },
      [Symbol.isConcatSpreadable]: { b: ref(true) },
      [Symbol.iterator]: [ref(1)],
      [Symbol.match]: new Set<Ref<number>>(),
      [Symbol.matchAll]: new Map<number, Ref<string>>(),
      [Symbol.replace]: { arr: [ref('a')] },
      [Symbol.search]: { set: new Set<Ref<number>>() },
      [Symbol.species]: { map: new Map<number, Ref<string>>() },
      [Symbol.split]: new WeakSet<Ref<boolean>>(),
      [Symbol.toPrimitive]: new WeakMap<Ref<boolean>, string>(),
      [Symbol.toStringTag]: { weakSet: new WeakSet<Ref<boolean>>() },
      [Symbol.unscopables]: { weakMap: new WeakMap<Ref<boolean>, string>() },
      [customSymbol]: { arr: [ref(1)] },
    };

    const objRef = ref(obj);

    const keys: (keyof typeof obj)[] = [
      Symbol.asyncIterator,
      Symbol.hasInstance,
      Symbol.isConcatSpreadable,
      Symbol.iterator,
      Symbol.match,
      Symbol.matchAll,
      Symbol.replace,
      Symbol.search,
      Symbol.species,
      Symbol.split,
      Symbol.toPrimitive,
      Symbol.toStringTag,
      Symbol.unscopables,
      customSymbol,
    ];

    for (const key of keys) expect(objRef.value[key]).toStrictEqual(obj[key]);
  });

  test('unref', () => {
    expect(unref(1)).toBe(1);
    expect(unref(ref(1))).toBe(1);
  });

  test('shallowRef', () => {
    const sref = shallowRef({ a: 1 });
    let dummy;
    effect(() => {
      dummy = sref.value.a;
    });
    expect(dummy).toBe(1);

    sref.value = { a: 2 };
    expect(dummy).toBe(2);
  });

  test('shallowRef force trigger', () => {
    const sref = shallowRef({ a: 1 });
    let dummy;
    effect(() => {
      dummy = sref.value.a;
    });
    expect(dummy).toBe(1);

    sref.value.a = 2;
    expect(dummy).toBe(1); // should not trigger yet

    // force trigger
    triggerRef(sref);
    expect(dummy).toBe(2);
  });

  test('isRef', () => {
    expect(isRef(ref(1))).toBe(true);
    expect(isRef(computed(() => 1))).toBe(true);

    expect(isRef(0)).toBe(false);
    expect(isRef(1)).toBe(false);
    // an object that looks like a ref isn't necessarily a ref
    expect(isRef({ value: 0 })).toBe(false);
  });

  test('toRef', () => {
    const b = ref({ y: 1 });
    const c = toRef(b);
    const d = toRef({ z: 1 });

    expect(isRef(d)).toBe(true);
    expect(d.value.z).toBe(1);

    expect(c).toBe(b);

    // a ref in a non-reactive object should be unwrapped
    const rx = ref<number | undefined>(1);
    const r: Record<string, unknown> = { x: rx };
    const t = toRef(r, 'x');
    expect(t.value).toBe(1);

    rx.value = 2;
    expect(t.value).toBe(2);

    t.value = 3;
    expect(t.value).toBe(3);
    expect(rx.value).toBe(3);

    // with a default
    const u = toRef(r, 'x', 7);
    expect(u.value).toBe(3);

    rx.value = undefined;
    expect(rx.value).toBeUndefined();
    expect(t.value).toBeUndefined();
    expect(u.value).toBe(7);

    u.value = 7;
    expect(rx.value).toBe(7);
    expect(t.value).toBe(7);
    expect(u.value).toBe(7);
  });

  test('toRef default value', () => {
    const a: { x: number | undefined } = { x: undefined };
    const x = toRef(a, 'x', 1);
    expect(x.value).toBe(1);

    a.x = 2;
    expect(x.value).toBe(2);

    a.x = undefined;
    expect(x.value).toBe(1);
  });

  test('toRef getter', () => {
    const x = toRef(() => 1);
    expect(x.value).toBe(1);
    expect(isRef(x)).toBe(true);
    expect(unref(x)).toBe(1);
    // @ts-expect-error a getter ref is readonly
    expect(() => (x.value = 123)).toThrow(TypeError);
  });

  test('toRef lazy evaluation of properties inside a plain object', () => {
    const fn = vi.fn<() => number>(() => 5);
    const num = computed(fn);
    const a = toRef({ num }, 'num');

    expect(fn).not.toHaveBeenCalled();
    expect(a.value).toBe(5);
  });

  test('toRefs', () => {
    const a = { x: 1, y: 2 };
    const { x, y } = toRefs(a);

    expect(isRef(x)).toBe(true);
    expect(isRef(y)).toBe(true);
    expect(x.value).toBe(1);
    expect(y.value).toBe(2);

    // source -> proxy
    a.x = 2;
    a.y = 3;
    expect(x.value).toBe(2);
    expect(y.value).toBe(3);

    // proxy -> source
    x.value = 3;
    y.value = 4;
    expect(a.x).toBe(3);
    expect(a.y).toBe(4);
  });

  test('toRefs array', () => {
    const arr = ['a', 'b', 'c'];
    const refs = toRefs(arr);

    expect(Array.isArray(refs)).toBe(true);

    refs[0].value = '1';
    expect(arr[0]).toBe('1');

    arr[1] = '2';
    expect(refs[1].value).toBe('2');
  });

  test('should not trigger when setting the same raw object', () => {
    const obj = {};
    const r = ref(obj);
    const spy = vi.fn<(value?: unknown) => void>();
    effect(() => spy(r.value));
    expect(spy).toHaveBeenCalledTimes(1);

    r.value = obj;
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('toValue', () => {
    const a = ref(1);
    const b = computed(() => a.value + 1);
    const c = () => a.value + 2;
    const d = 4;

    expect(toValue(a)).toBe(1);
    expect(toValue(b)).toBe(2);
    expect(toValue(c)).toBe(3);
    expect(toValue(d)).toBe(4);
  });
});

describe('ref', () => {
  test('ref() and shallowRef() return an existing ref as-is', () => {
    const a = ref(1);
    expect(ref(a)).toBe(a);
    expect(shallowRef(a)).toBe(a);
  });

  test('holds object values as-is', () => {
    const value = { nested: { n: 1 } };
    expect(ref(value).value).toBe(value);
    expect(shallowRef(value).value).toBe(value);
  });

  test('uses Object.is: NaN does not trigger, -0 does', () => {
    const a = ref(Number.NaN);
    const spy = vi.fn<(value?: unknown) => void>();
    effect(() => spy(a.value));
    a.value = Number.NaN;
    expect(spy).toHaveBeenCalledTimes(1);

    const b = ref(0);
    effect(() => spy(b.value));
    b.value = -0;
    expect(spy).toHaveBeenCalledTimes(3);
  });

  test('a write with no reader is applied on the next read', () => {
    const a = ref(1);
    a.value = 2;
    expect(a.value).toBe(2);
  });

  test('triggerRef inside a batch notifies once, at the end', () => {
    const sref = shallowRef([1]);
    const spy = vi.fn<(value?: unknown) => void>();
    effect(() => spy(sref.value.length));
    startBatch();
    sref.value.push(2);
    triggerRef(sref);
    triggerRef(sref);
    expect(spy).toHaveBeenCalledTimes(1);
    endBatch();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('triggerRef on a property, getter or computed ref is a no-op', () => {
    const c = computed(() => 1);
    for (const r of [toRef({ x: 1 }, 'x'), toRef(() => 1), c]) {
      expect(() => triggerRef(r)).not.toThrow();
    }
    expect(c.value).toBe(1);
  });
});
