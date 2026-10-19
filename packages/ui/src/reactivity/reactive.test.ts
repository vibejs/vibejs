// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/__tests__/reactive.spec.ts (MIT)
// oxlint-disable typescript/no-explicit-any, typescript/no-unsafe-type-assertion -- ported as upstream wrote it
import { afterEach, describe, expect, test, vi } from 'vitest';
import { vibeError } from '../errors.gen.ts';
import { computed } from './computed.ts';
import { ReactiveEffect } from './core.ts';
import { isReactive, isReadonly, isRef, isShallow, targetMap, toRaw } from './dep.ts';
import {
  isProxy,
  markRaw,
  reactive,
  readonly,
  shallowReactive,
  shallowReadonly,
} from './reactive.ts';
import { ref, shallowRef } from './ref.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reactivity/reactive', () => {
  test('Object', () => {
    const original = { foo: 1 };
    const observed = reactive(original);
    expect(observed).not.toBe(original);
    expect(isReactive(observed)).toBe(true);
    expect(isReactive(original)).toBe(false);
    // get
    expect(observed.foo).toBe(1);
    // has
    expect('foo' in observed).toBe(true);
    // ownKeys
    expect(Object.keys(observed)).toEqual(['foo']);
  });

  test('proto', () => {
    const obj = {};
    const reactiveObj = reactive(obj);
    expect(isReactive(reactiveObj)).toBe(true);
    // read prop of reactiveObject will cause reactiveObj[prop] to be reactive
    // oxlint-disable-next-line no-proto -- the case reads __proto__ on purpose
    expect(Reflect.get(reactiveObj, '__proto__')).toBe(Object.prototype);
    const otherObj = { data: ['a'] };
    expect(isReactive(otherObj)).toBe(false);
    const reactiveOther = reactive(otherObj);
    expect(isReactive(reactiveOther)).toBe(true);
    expect(reactiveOther.data[0]).toBe('a');
  });

  test('nested reactives', () => {
    const original = {
      nested: {
        foo: 1,
      },
      array: [{ bar: 2 }],
    };
    const observed = reactive(original);
    expect(isReactive(observed.nested)).toBe(true);
    expect(isReactive(observed.array)).toBe(true);
    expect(isReactive(observed.array[0])).toBe(true);
  });

  test('observing subtypes of IterableCollections(Map, Set)', () => {
    // subtypes of Map
    class CustomMap extends Map {}
    const cmap = reactive(new CustomMap());

    expect(cmap).toBeInstanceOf(Map);
    expect(isReactive(cmap)).toBe(true);

    cmap.set('key', {});
    expect(isReactive(cmap.get('key'))).toBe(true);

    // subtypes of Set
    class CustomSet extends Set {}
    const cset = reactive(new CustomSet());

    expect(cset).toBeInstanceOf(Set);
    expect(isReactive(cset)).toBe(true);

    let dummy;
    effect(() => (dummy = cset.has('value')));
    expect(dummy).toBe(false);
    cset.add('value');
    expect(dummy).toBe(true);
    cset.delete('value');
    expect(dummy).toBe(false);
  });

  test('observing subtypes of WeakCollections(WeakMap, WeakSet)', () => {
    // subtypes of WeakMap
    class CustomMap extends WeakMap {}
    const cmap = reactive(new CustomMap());

    expect(cmap).toBeInstanceOf(WeakMap);
    expect(isReactive(cmap)).toBe(true);

    const key = {};
    cmap.set(key, {});
    expect(isReactive(cmap.get(key))).toBe(true);

    // subtypes of WeakSet
    class CustomSet extends WeakSet {}
    const cset = reactive(new CustomSet());

    expect(cset).toBeInstanceOf(WeakSet);
    expect(isReactive(cset)).toBe(true);

    let dummy;
    effect(() => (dummy = cset.has(key)));
    expect(dummy).toBe(false);
    cset.add(key);
    expect(dummy).toBe(true);
    cset.delete(key);
    expect(dummy).toBe(false);
  });

  // #8647
  test('observing Set with reactive initial value', () => {
    const observed = reactive({});
    const observedSet = reactive(new Set([observed]));

    expect(observedSet.has(observed)).toBe(true);
    expect(observedSet.size).toBe(1);

    // expect nothing happens
    observedSet.add(observed);
    expect(observedSet.size).toBe(1);
  });

  test('observed value should proxy mutations to original (Object)', () => {
    const original: any = { foo: 1 };
    const observed = reactive(original);
    // set
    observed.bar = 1;
    expect(observed.bar).toBe(1);
    expect(original.bar).toBe(1);
    // delete
    delete observed.foo;
    expect('foo' in observed).toBe(false);
    expect('foo' in original).toBe(false);
  });

  test('failed set operation should not trigger effects', () => {
    const original: any = {};
    Object.defineProperty(original, 'foo', {
      value: 1,
      writable: false,
      configurable: true,
    });
    const observed = reactive(original);
    let dummy;
    let run = 0;
    effect(() => {
      run++;
      dummy = observed.foo;
    });

    expect(() => {
      observed.foo = 2;
    }).toThrow(TypeError);
    expect(dummy).toBe(1);
    expect(run).toBe(1);
  });

  test('original value change should reflect in observed value (Object)', () => {
    const original: any = { foo: 1 };
    const observed = reactive(original);
    // set
    original.bar = 1;
    expect(original.bar).toBe(1);
    expect(observed.bar).toBe(1);
    // delete
    delete original.foo;
    expect('foo' in original).toBe(false);
    expect('foo' in observed).toBe(false);
  });

  test('setting a property with an unobserved value should wrap with reactive', () => {
    const observed = reactive<{ foo?: object }>({});
    const raw = {};
    observed.foo = raw;
    expect(observed.foo).not.toBe(raw);
    expect(isReactive(observed.foo)).toBe(true);
  });

  test('observing already observed value should return same Proxy', () => {
    const original = { foo: 1 };
    const observed = reactive(original);
    const observed2 = reactive(observed);
    expect(observed2).toBe(observed);
  });

  test('observing the same value multiple times should return same Proxy', () => {
    const original = { foo: 1 };
    const observed = reactive(original);
    const observed2 = reactive(original);
    expect(observed2).toBe(observed);
  });

  test('should not pollute original object with Proxies', () => {
    const original: any = { foo: 1 };
    const original2 = { bar: 2 };
    const observed = reactive(original);
    const observed2 = reactive(original2);
    observed.bar = observed2;
    expect(observed.bar).toBe(observed2);
    expect(original.bar).toBe(original2);
  });

  // #1246
  test('mutation on objects using reactive as prototype should not trigger', () => {
    const observed = reactive({ foo: 1 });
    const original = Object.create(observed);
    let dummy;
    effect(() => (dummy = original.foo));
    expect(dummy).toBe(1);
    observed.foo = 2;
    expect(dummy).toBe(2);
    original.foo = 3;
    expect(dummy).toBe(2);
    original.foo = 4;
    expect(dummy).toBe(2);
  });

  test('toRaw', () => {
    const original = { foo: 1 };
    const observed = reactive(original);
    expect(toRaw(observed)).toBe(original);
    expect(toRaw(original)).toBe(original);
  });

  test('toRaw on object using reactive as prototype', () => {
    const original = { foo: 1 };
    const observed = reactive(original);
    const inherited = Object.create(observed);
    expect(toRaw(inherited)).toBe(inherited);
  });

  test('toRaw on user Proxy wrapping reactive', () => {
    const original = {};
    const re = reactive(original);
    const obj = new Proxy(re, {});
    const raw = toRaw(obj);
    expect(raw).toBe(original);
  });

  test('should not unwrap Ref<T>', () => {
    const observedNumberRef = reactive(ref(1));
    const observedObjectRef = reactive(ref({ foo: 1 }));

    expect(isRef(observedNumberRef)).toBe(true);
    expect(isRef(observedObjectRef)).toBe(true);
  });

  test('should unwrap computed refs', () => {
    // readonly
    const a = computed(() => 1);
    // writable
    const b = computed({
      get: () => 1,
      set: () => {},
    });
    const obj = reactive({ a, b });
    // check type
    expect(obj.a + 1).toBe(2);
    expect(obj.b + 1).toBe(2);
    expect(typeof obj.a).toBe(`number`);
    expect(typeof obj.b).toBe(`number`);
  });

  test('should allow setting property from a ref to another ref', () => {
    const foo = ref(0);
    const bar = ref(1);
    const observed = reactive({ a: foo });
    const dummy = computed(() => observed.a);
    expect(dummy.value).toBe(0);

    // @ts-expect-error a ref is assigned where its unwrapped type is declared
    observed.a = bar;
    expect(dummy.value).toBe(1);

    bar.value++;
    expect(dummy.value).toBe(2);
  });

  test('non-observable values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const assertValue = (value: any) => {
      expect(reactive(value)).toBe(value);
      expect(warn).toHaveBeenLastCalledWith(
        vibeError('VIBE5001', { api: 'reactive', value: String(value) }).message,
      );
    };

    // number
    assertValue(1);
    // string
    assertValue('foo');
    // boolean
    assertValue(false);
    // null
    assertValue(null);
    // undefined
    assertValue(undefined);
    // symbol
    const s = Symbol();
    assertValue(s);
    // bigint
    const bn = BigInt('9007199254740991');
    assertValue(bn);

    // built-ins should work and return same value
    const p = Promise.resolve();
    expect(reactive(p)).toBe(p);
    const r = new RegExp('');
    expect(reactive(r)).toBe(r);
    const d = new Date();
    expect(reactive(d)).toBe(d);
  });

  test('markRaw', () => {
    const obj = reactive({
      foo: { a: 1 },
      bar: markRaw({ b: 2 }),
    });
    expect(isReactive(obj.foo)).toBe(true);
    expect(isReactive(obj.bar)).toBe(false);
  });

  test('markRaw should skip non-extensible objects', () => {
    const obj = Object.seal({ foo: 1 });
    expect(() => markRaw(obj)).not.toThrowError();
  });

  test('markRaw should not redefine on an marked object', () => {
    const obj = markRaw({ foo: 1 });
    const raw = markRaw(obj);
    expect(raw).toBe(obj);
    expect(() => markRaw(obj)).not.toThrowError();
  });

  test('should not markRaw object as reactive', () => {
    const a = reactive({ a: 1 });
    const b = reactive({ b: 2 }) as any;
    b.a = markRaw(toRaw(a));
    expect(b.a === a).toBe(false);
  });

  test('should not observe non-extensible objects', () => {
    const obj = reactive({
      foo: Object.preventExtensions({ a: 1 }),
      // sealed or frozen objects are considered non-extensible as well
      bar: Object.freeze({ a: 1 }),
      baz: Object.seal({ a: 1 }),
    });
    expect(isReactive(obj.foo)).toBe(false);
    expect(isReactive(obj.bar)).toBe(false);
    expect(isReactive(obj.baz)).toBe(false);
  });

  test('should not observe objects with __v_skip', () => {
    const original = {
      foo: 1,
      __v_skip: true,
    };
    const observed = reactive(original);
    expect(isReactive(observed)).toBe(false);
  });

  test('hasOwnProperty edge case: Symbol values', () => {
    const key = Symbol();
    const obj = reactive({ [key]: 1 }) as { [key]?: 1 };
    let dummy;
    effect(() => {
      dummy = obj.hasOwnProperty(key);
    });
    expect(dummy).toBe(true);

    delete obj[key];
    expect(dummy).toBe(false);
  });

  test('hasOwnProperty edge case: non-string values', () => {
    const key = {};
    const obj = reactive({ '[object Object]': 1 }) as { '[object Object]'?: 1 };
    let dummy;
    effect(() => {
      dummy = obj.hasOwnProperty(key as PropertyKey);
    });
    expect(dummy).toBe(true);

    delete (obj as any)[key as PropertyKey];
    expect(dummy).toBe(false);
  });

  test('isProxy', () => {
    const foo = {};
    expect(isProxy(foo)).toBe(false);

    const fooRe = reactive(foo);
    expect(isProxy(fooRe)).toBe(true);

    const fooSRe = shallowReactive(foo);
    expect(isProxy(fooSRe)).toBe(true);

    const barRl = readonly(foo);
    expect(isProxy(barRl)).toBe(true);

    const barSRl = shallowReadonly(foo);
    expect(isProxy(barSRl)).toBe(true);

    const c = computed(() => {});
    expect(isProxy(c)).toBe(false);
  });

  test('The results of the shallow and readonly assignments are the same (Map)', () => {
    const map = reactive(new Map());
    map.set('foo', shallowReactive({ a: 2 }));
    expect(isShallow(map.get('foo'))).toBe(true);

    map.set('bar', readonly({ b: 2 }));
    expect(isReadonly(map.get('bar'))).toBe(true);
  });

  test('The results of the shallow and readonly assignments are the same (Set)', () => {
    const set = reactive(new Set());
    set.add(shallowReactive({ a: 2 }));
    set.add(readonly({ b: 2 }));
    const items = [...set];
    expect(isShallow(items[0])).toBe(true);
    expect(isReadonly(items[1])).toBe(true);
  });

  test('isShallow returns true for shallow collection proxies', () => {
    expect(isShallow(shallowReactive(new Map()))).toBe(true);
    expect(isShallow(shallowReadonly(new Map()))).toBe(true);
    expect(isShallow(shallowReactive(new Set()))).toBe(true);
    expect(isShallow(shallowReadonly(new Set()))).toBe(true);
    expect(isShallow(reactive(new Map()))).toBe(false);
    expect(isShallow(readonly(new Map()))).toBe(false);
    expect(isShallow(reactive(new Set()))).toBe(false);
    expect(isShallow(readonly(new Set()))).toBe(false);
  });

  test('shallow collection wrappers are preserved on assignment', () => {
    const shallowMap = shallowReactive(new Map<string, { count: number }>());

    const state = reactive({ m: null as unknown as typeof shallowMap });
    state.m = shallowMap;
    expect(state.m).toBe(shallowMap);
    expect(isShallow(state.m)).toBe(true);

    const r = ref<typeof shallowMap | null>(null);
    r.value = shallowMap;
    expect(r.value).toBe(shallowMap);
    expect(isShallow(r.value)).toBe(true);

    const outer = reactive(new Map<string, typeof shallowMap>());
    outer.set('m', shallowMap);
    expect(outer.get('m')).toBe(shallowMap);
    expect(isShallow(outer.get('m'))).toBe(true);
  });

  // #11696
  test('should use correct receiver on set handler for refs', () => {
    const a = reactive(ref(1));
    effect(() => a.value);
    expect(() => {
      a.value++;
    }).not.toThrow();
  });

  // #11979
  test('should release property Dep instance if it no longer has subscribers', () => {
    const obj = { x: 1 };
    const a = reactive(obj);
    const e = effect(() => a.x);
    expect(targetMap.get(obj)?.get('x')).toBeTruthy();
    e.stop();
    expect(targetMap.get(obj)?.get('x')).toBeFalsy();
  });

  test('should trigger reactivity when Map key is undefined', () => {
    const map = reactive(new Map());
    const c = computed(() => map.get(void 0));

    expect(c.value).toBe(void 0);

    map.set(void 0, 1);
    expect(c.value).toBe(1);
  });

  test('should return true for reactive objects', () => {
    expect(isReactive(reactive({}))).toBe(true);
    expect(isReactive(readonly(reactive({})))).toBe(true);
    expect(isReactive(ref({}).value)).toBe(true);
    expect(isReactive(readonly(ref({})).value)).toBe(true);
    expect(isReactive(shallowReactive({}))).toBe(true);
  });

  test('should return false for non-reactive objects', () => {
    expect(isReactive(ref(true))).toBe(false);
    expect(isReactive(shallowRef({}).value)).toBe(false);
  });
});

describe('reactive', () => {
  test('one proxy per target and mode; readonly() wraps a reactive proxy', () => {
    const raw = {};
    const proxies = [reactive(raw), shallowReactive(raw), readonly(raw), shallowReadonly(raw)];
    expect(new Set(proxies).size).toBe(4);
    expect([reactive(raw), shallowReactive(raw), readonly(raw), shallowReadonly(raw)]).toEqual(
      proxies,
    );
    for (const proxy of proxies) expect(reactive(proxy)).toBe(proxy);

    const wrapped = readonly(proxies[0]);
    expect(wrapped).not.toBe(proxies[2]);
    expect(readonly(proxies[0])).toBe(wrapped);
    expect(readonly(proxies[2])).toBe(proxies[2]);
    expect(toRaw(wrapped)).toBe(raw);
  });

  test('nested objects are wrapped when read, not when the parent is created', () => {
    const getter = vi.fn<() => object>(() => ({}));
    const raw = Object.defineProperty({}, 'nested', { get: getter, enumerable: true });
    const observed = reactive(raw) as { nested: object };
    expect(getter).not.toHaveBeenCalled();
    expect(isReactive(observed.nested)).toBe(true);
    expect(getter).toHaveBeenCalledTimes(1);
  });

  test('an object with a __v_isReactive getter is reported reactive', () => {
    const props = Object.defineProperties({}, { __v_isReactive: { get: () => true } });
    expect(isReactive(props)).toBe(true);
    expect(isProxy(props)).toBe(false);
    // The props proxy claims both flags and has no `__v_raw`.
    const readonlyProps = Object.defineProperties(
      {},
      { __v_isReactive: { get: () => true }, __v_isReadonly: { get: () => true } },
    );
    expect(isReadonly(readonlyProps)).toBe(true);
    expect(isReactive(readonlyProps)).toBe(true);
    expect(isProxy(readonlyProps)).toBe(false);
  });

  test('flags of the four modes', () => {
    const raw = {};
    expect([isReactive, isReadonly, isShallow].map((is) => is(reactive(raw)))).toEqual([
      true,
      false,
      false,
    ]);
    expect([isReactive, isReadonly, isShallow].map((is) => is(shallowReactive(raw)))).toEqual([
      true,
      false,
      true,
    ]);
    expect([isReactive, isReadonly, isShallow].map((is) => is(readonly(raw)))).toEqual([
      false,
      true,
      false,
    ]);
    expect([isReactive, isReadonly, isShallow].map((is) => is(shallowReadonly(raw)))).toEqual([
      false,
      true,
      true,
    ]);
    expect(isShallow(shallowRef(1))).toBe(true);
    expect(isShallow(ref(1))).toBe(false);
  });

  test('a write through a reactive child whose prototype is reactive triggers the child only', () => {
    const parent = reactive<{ foo?: number }>({});
    const child = reactive(Object.create(parent) as { foo?: number });
    const parentSpy = vi.fn<() => void>(() => void parent.foo);
    const childSpy = vi.fn<() => void>(() => void child.foo);
    effect(parentSpy);
    effect(childSpy);

    child.foo = 1;
    expect(child.foo).toBe(1);
    expect(parent.foo).toBeUndefined();
    expect(childSpy).toHaveBeenCalledTimes(2);
    expect(parentSpy).toHaveBeenCalledTimes(1);
  });

  test('in and Object.keys re-run on add and delete, not on a value change', () => {
    const observed = reactive<Record<string, number>>({ a: 1 });
    const keys = vi.fn<() => void>(() => void Object.keys(observed));
    const has = vi.fn<() => void>(() => void ('b' in observed));
    effect(keys);
    effect(has);
    observed.a = 2;
    expect([keys, has].map((spy) => spy.mock.calls.length)).toEqual([1, 1]);
    observed.b = 1;
    expect([keys, has].map((spy) => spy.mock.calls.length)).toEqual([2, 2]);
    delete observed.b;
    expect([keys, has].map((spy) => spy.mock.calls.length)).toEqual([3, 3]);
    // Deleting a missing key, and well-known symbols, change nothing.
    delete observed.missing;
    expect(Symbol.iterator in observed).toBe(false);
    expect([keys, has].map((spy) => spy.mock.calls.length)).toEqual([3, 3]);
  });

  test('VIBE5001 names the API, and is silent in production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    readonly(1 as unknown as object);
    expect(warn).toHaveBeenLastCalledWith(
      vibeError('VIBE5001', { api: 'readonly', value: '1' }).message,
    );
    shallowReactive('a' as unknown as object);
    expect(warn).toHaveBeenLastCalledWith(
      vibeError('VIBE5001', { api: 'shallowReactive', value: 'a' }).message,
    );
    shallowReadonly(null as unknown as object);
    expect(warn).toHaveBeenLastCalledWith(
      vibeError('VIBE5001', { api: 'shallowReadonly', value: 'null' }).message,
    );

    vi.stubGlobal('__DEV__', false);
    warn.mockClear();
    expect(reactive(1 as unknown as object)).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
