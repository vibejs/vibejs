// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/__tests__/ref.spec.ts (MIT)
// oxlint-disable typescript/no-explicit-any, typescript/no-unsafe-type-assertion, unicorn/consistent-function-scoping -- ported as upstream wrote it
//
// customRef() and its value cache case move to RR-5.
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { vibeError } from '../errors.gen.ts';
import { computed } from './computed.ts';
import { endBatch, ReactiveEffect, startBatch } from './core.ts';
import { isReactive, isRef, isShallow, toRaw } from './dep.ts';
import { reactive, readonly, shallowReactive, shallowReadonly } from './reactive.ts';
import { ref, shallowRef, toRef, toRefs, toValue, triggerRef, unref, type Ref } from './ref.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('ref wrapped in reactive should not track internal _value access', () => {
    const a = ref(1);
    const b = reactive(a);
    let dummy;
    const fn = vi.fn<() => void>(() => {
      dummy = b.value; // this will observe both b.value and a.value access
    });
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(dummy).toBe(1);

    // mutating a.value should only trigger effect once
    a.value = 3;
    expect(fn).toHaveBeenCalledTimes(2);
    expect(dummy).toBe(3);

    // mutating b.value should trigger the effect twice. (once for a.value change and once for b.value change)
    b.value = 5;
    expect(fn).toHaveBeenCalledTimes(4);
    expect(dummy).toBe(5);
  });

  it('should make nested properties reactive', () => {
    const a = ref({
      count: 1,
    });
    let dummy;
    effect(() => {
      dummy = a.value.count;
    });
    expect(dummy).toBe(1);
    a.value.count = 2;
    expect(dummy).toBe(2);
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

  it('should work like a normal property when nested in a reactive object', () => {
    const a = ref(1);
    const obj = reactive({
      a,
      b: {
        c: a,
      },
    });

    let dummy1 = 0;
    let dummy2 = 0;

    effect(() => {
      dummy1 = obj.a;
      dummy2 = obj.b.c;
    });

    const assertDummiesEqualTo = (val: number) => {
      for (const dummy of [dummy1, dummy2]) expect(dummy).toBe(val);
    };

    assertDummiesEqualTo(1);
    a.value++;
    assertDummiesEqualTo(2);
    obj.a++;
    assertDummiesEqualTo(3);
    obj.b.c++;
    assertDummiesEqualTo(4);
  });

  it('should unwrap nested ref in types', () => {
    const a = ref(0);
    const b = ref(a);
    expect(typeof (b.value + 1)).toBe('number');
  });

  it('should unwrap nested values in types', () => {
    const a = {
      b: ref(0),
    };

    const c = ref(a);

    expect(typeof (c.value.b + 1)).toBe('number');
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

  it('should unwrap ref types as props of arrays', () => {
    const arr: any = [ref(0)];
    const symbolKey = Symbol('');
    arr[''] = ref(1);
    arr[symbolKey] = ref(2);
    const arrRef = ref(arr).value;
    expect(isRef(arrRef[0])).toBe(true);
    expect(isRef(arrRef[''])).toBe(false);
    expect(isRef(arrRef[symbolKey])).toBe(false);
    expect(arrRef['']).toBe(1);
    expect(arrRef[symbolKey]).toBe(2);
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

  test('shallowRef isShallow', () => {
    expect(isShallow(shallowRef({ a: 1 }))).toBe(true);
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

  test('toRef on array', () => {
    const a: any = reactive(['a', 'b']);
    const r = toRef(a, 1);
    expect(r.value).toBe('b');
    r.value = 'c';
    expect(r.value).toBe('c');
    expect(a[1]).toBe('c');

    a[1] = ref('d');
    expect(isRef(a[1])).toBe(true);
    expect(r.value).toBe('d');
    r.value = 'e';
    expect(isRef(a[1])).toBe(true);
    expect(a[1].value).toBe('e');

    const s = toRef(a, 2, 'def');
    const len = toRef(a, 'length');

    expect(s.value).toBe('def');
    expect(len.value).toBe(2);

    a.push('f');
    expect(s.value).toBe('f');
    expect(len.value).toBe(3);

    len.value = 2;

    expect(s.value).toBe('def');
    expect(len.value).toBe(2);

    const symbol = Symbol();
    const t = toRef(a, 'foo');
    const u = toRef(a, symbol);
    expect(t.value).toBeUndefined();
    expect(u.value).toBeUndefined();

    const foo = ref(3);
    const bar = ref(5);
    a.foo = foo;
    a[symbol] = bar;
    expect(t.value).toBe(3);
    expect(u.value).toBe(5);

    t.value = 4;
    u.value = 6;

    expect(a.foo).toBe(4);
    expect(foo.value).toBe(4);
    expect(a[symbol]).toBe(6);
    expect(bar.value).toBe(6);
  });

  test('triggerRef on toRef created from array coerces property keys', () => {
    const assertTriggerRef = (key: unknown) => {
      const array = reactive(['a']);
      const first = toRef(array as any, key as any);
      const fn = vi.fn<(value?: unknown) => void>();

      effect(() => fn(first.value));
      expect(fn).toHaveBeenCalledTimes(1);

      triggerRef(first);
      expect(fn).toHaveBeenCalledTimes(2);
    };

    assertTriggerRef(0);
    // JS coerces non-symbol property keys like [0] to the string "0".
    assertTriggerRef([0]);
  });

  test('triggerRef on toRef created from symbol key preserves the symbol', () => {
    const key = Symbol();
    const object = reactive({ [key]: 'a' });
    const value = toRef(object, key);
    const fn = vi.fn<(value?: unknown) => void>();

    effect(() => fn(value.value));
    expect(fn).toHaveBeenCalledTimes(1);

    triggerRef(value);
    expect(fn).toHaveBeenCalledTimes(2);
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

  test('toRef lazy evaluation of properties inside a proxy', () => {
    const fn = vi.fn<() => number>(() => 5);
    const num = computed(fn);
    const a = toRef({ num }, 'num');
    const b = toRef(reactive({ num }), 'num');
    const c = toRef(readonly({ num }), 'num');
    const d = toRef(shallowReactive({ num }), 'num');
    const e = toRef(shallowReadonly({ num }), 'num');

    expect(fn).not.toHaveBeenCalled();

    expect(a.value).toBe(5);
    expect(b.value).toBe(5);
    expect(c.value).toBe(5);
    expect(d.value).toBe(5);
    expect(e.value).toBe(5);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('toRef with shallowReactive/shallowReadonly', () => {
    const r = ref(0);
    const s1 = shallowReactive<{ foo: any }>({ foo: r });
    const t1 = toRef(s1, 'foo', 2);
    const s2 = shallowReadonly(s1);
    const t2 = toRef(s2, 'foo', 3);

    expect(r.value).toBe(0);
    expect(s1.foo.value).toBe(0);
    expect(t1.value).toBe(0);
    expect(s2.foo.value).toBe(0);
    expect(t2.value).toBe(0);

    s1.foo = ref(1);

    expect(r.value).toBe(0);
    expect(s1.foo.value).toBe(1);
    expect(t1.value).toBe(1);
    expect(s2.foo.value).toBe(1);
    expect(t2.value).toBe(1);

    s1.foo.value = undefined;

    expect(r.value).toBe(0);
    expect(s1.foo.value).toBeUndefined();
    expect(t1.value).toBe(2);
    expect(s2.foo.value).toBeUndefined();
    expect(t2.value).toBe(3);

    t1.value = 2;

    expect(r.value).toBe(0);
    expect(s1.foo.value).toBe(2);
    expect(t1.value).toBe(2);
    expect(s2.foo.value).toBe(2);
    expect(t2.value).toBe(2);

    t2.value = 4;

    expect(r.value).toBe(0);
    expect(s1.foo.value).toBe(4);
    expect(t1.value).toBe(4);
    expect(s2.foo.value).toBe(4);
    expect(t2.value).toBe(4);

    s1.foo = undefined;

    expect(r.value).toBe(0);
    expect(s1.foo).toBeUndefined();
    expect(t1.value).toBe(2);
    expect(s2.foo).toBeUndefined();
    expect(t2.value).toBe(3);
  });

  test('toRef for shallowReadonly around reactive', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const get = vi.fn<() => number>(() => 3);
    const set = vi.fn<(value: number) => void>();
    const num = computed({ get, set });
    const t = toRef(shallowReadonly(reactive({ num })), 'num');

    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();

    t.value = 1;

    expect(warn).toHaveBeenLastCalledWith(
      vibeError('VIBE5002', { operation: 'set', key: '"num"' }).message,
    );

    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();

    expect(t.value).toBe(3);

    expect(get).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
  });

  test('toRef for readonly around shallowReactive', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const get = vi.fn<() => number>(() => 3);
    const set = vi.fn<(value: number) => void>();
    const num = computed({ get, set });
    const t: Ref<number> = toRef(readonly(shallowReactive({ num })), 'num');

    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();

    t.value = 1;

    expect(warn).toHaveBeenLastCalledWith(
      vibeError('VIBE5002', { operation: 'set', key: '"num"' }).message,
    );

    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();

    expect(t.value).toBe(3);

    expect(get).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
  });

  test(`toRef doesn't bypass the proxy when getting/setting a nested ref`, () => {
    const r = ref(2);
    const obj = shallowReactive({ num: r });
    const t = toRef(obj, 'num');

    expect(t.value).toBe(2);

    effect(() => {
      t.value = 3;
    });

    expect(t.value).toBe(3);
    expect(r.value).toBe(3);

    const s = ref(4);
    obj.num = s;

    expect(t.value).toBe(3);
    expect(s.value).toBe(3);
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

  test('toRefs should warn on plain object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    toRefs({});
    expect(warn).toHaveBeenLastCalledWith(vibeError('VIBE5004').message);
  });

  test('toRefs should warn on plain array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    toRefs([]);
    expect(warn).toHaveBeenLastCalledWith(vibeError('VIBE5004').message);
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

  test('toRefs reactive array', () => {
    const arr = reactive(['a', 'b', 'c']);
    const refs = toRefs(arr);

    expect(Array.isArray(refs)).toBe(true);

    refs[0].value = '1';
    expect(arr[0]).toBe('1');

    arr[1] = '2';
    expect(refs[1].value).toBe('2');
  });

  test('should not trigger when setting value to same proxy', () => {
    const obj = reactive({ count: 0 });

    const a = ref(obj);
    const spy1 = vi.fn<() => unknown>(() => a.value);

    effect(spy1);

    a.value = obj;
    expect(spy1).toBeCalledTimes(1);

    const b = shallowRef(obj);
    const spy2 = vi.fn<() => unknown>(() => b.value);

    effect(spy2);

    b.value = obj;
    expect(spy2).toBeCalledTimes(1);
  });

  test('ref should preserve value shallow/readonly-ness', () => {
    const original = {};
    const r = reactive(original);
    const s = shallowReactive(original);
    const rr = readonly(original);
    const a = ref(original);

    expect(a.value).toBe(r);

    a.value = s;
    expect(a.value).toBe(s);
    expect(a.value).not.toBe(r);

    a.value = rr;
    expect(a.value).toBe(rr);
    expect(a.value).not.toBe(r);
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

  test('ref() holds an object as its reactive proxy; shallowRef() holds it as-is', () => {
    const value = { nested: { n: 1 } };
    const deep = ref(value);
    expect(deep.value).toBe(reactive(value));
    expect(isReactive(deep.value.nested)).toBe(true);
    expect(shallowRef(value).value).toBe(value);

    // Writing the raw object again, or its proxy, changes nothing.
    const spy = vi.fn<(value?: unknown) => void>();
    effect(() => spy(deep.value));
    deep.value = value;
    deep.value = reactive(value);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('toRefs warns VIBE5004 in dev only, and not for a proxy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    toRefs(reactive({ a: 1 }));
    toRefs(readonly({ a: 1 }));
    // An object that only claims the flags, as the props proxy does.
    toRefs(Object.defineProperties({ a: 1 }, { __v_isReactive: { get: () => true } }));
    toRefs(Object.defineProperties({ a: 1 }, { __v_isReadonly: { get: () => true } }));
    expect(warn).not.toHaveBeenCalled();
    vi.stubGlobal('__DEV__', false);
    toRefs({ a: 1 });
    expect(warn).not.toHaveBeenCalled();
  });

  test('triggerRef(toRef(reactive(o), key)) re-runs the readers of the key', () => {
    const raw = { k: { n: 1 }, other: 1 };
    const o = reactive(raw);
    const k = toRef(o, 'k');
    const readsK = vi.fn<() => void>(() => void o.k);
    const readsOther = vi.fn<() => void>(() => void o.other);
    effect(readsK);
    effect(readsOther);
    toRaw(o).k.n = 2;
    triggerRef(k);
    expect(readsK).toHaveBeenCalledTimes(2);
    expect(readsOther).toHaveBeenCalledTimes(1);
    // A readonly proxy of a ref triggers the ref.
    const s = shallowRef({ n: 1 });
    const spy = vi.fn<() => void>(() => void s.value.n);
    effect(spy);
    triggerRef(readonly(s) as Ref);
    expect(spy).toHaveBeenCalledTimes(2);
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

  test('triggerRef on a computed notifies its readers', () => {
    const c = computed(() => 1);
    const spy = vi.fn<(value?: unknown) => void>();
    effect(() => spy(c.value));
    triggerRef(c);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('triggerRef on a property or getter ref is a no-op', () => {
    const spy = vi.fn<(value?: unknown) => void>();
    const refs = [toRef({ x: 1 }, 'x'), toRef(() => 1)];
    effect(() => spy(refs.map((r) => r.value)));
    for (const r of refs) triggerRef(r);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
