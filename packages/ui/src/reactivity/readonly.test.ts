// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/__tests__/readonly.spec.ts (MIT)
// oxlint-disable typescript/no-base-to-string, typescript/no-explicit-any, typescript/no-unnecessary-type-arguments, typescript/no-unsafe-type-assertion, typescript/restrict-template-expressions, vitest/no-conditional-tests, vitest/valid-title -- ported as upstream wrote it
//
// The readonly warning texts are VIBE5002 assertions here.
import { afterEach, beforeEach, describe, expect, it, test, vi, type MockInstance } from 'vitest';
import { vibeError } from '../errors.gen.ts';
import { computed } from './computed.ts';
import { ReactiveEffect } from './core.ts';
import { isReactive, isReadonly, toRaw } from './dep.ts';
import { isProxy, markRaw, reactive, readonly, shallowReactive } from './reactive.ts';
import { ref, shallowRef, triggerRef } from './ref.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

const readonlyWarning = (operation: string, key: string): string =>
  vibeError('VIBE5002', { operation, key }).message;

let warn: MockInstance<(...args: unknown[]) => void>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Writable<T> = { -readonly [P in keyof T]: T[P] };

describe('reactivity/readonly', () => {
  describe('Object', () => {
    it('should make nested values readonly', () => {
      const original = { foo: 1, bar: { baz: 2 } };
      const wrapped = readonly(original);
      expect(wrapped).not.toBe(original);
      expect(isProxy(wrapped)).toBe(true);
      expect(isReactive(wrapped)).toBe(false);
      expect(isReadonly(wrapped)).toBe(true);
      expect(isReactive(original)).toBe(false);
      expect(isReadonly(original)).toBe(false);
      expect(isReactive(wrapped.bar)).toBe(false);
      expect(isReadonly(wrapped.bar)).toBe(true);
      expect(isReactive(original.bar)).toBe(false);
      expect(isReadonly(original.bar)).toBe(false);
      // get
      expect(wrapped.foo).toBe(1);
      // has
      expect('foo' in wrapped).toBe(true);
      // ownKeys
      expect(Object.keys(wrapped)).toEqual(['foo', 'bar']);
    });

    it('should not allow mutation', () => {
      const qux = Symbol('qux');
      const original = {
        foo: 1,
        bar: {
          baz: 2,
        },
        [qux]: 3,
      };
      const wrapped: Writable<typeof original> = readonly(original);

      wrapped.foo = 2;
      expect(wrapped.foo).toBe(1);
      expect(warn).toHaveBeenLastCalledWith(readonlyWarning('set', `"foo"`));

      wrapped.bar.baz = 3;
      expect(wrapped.bar.baz).toBe(2);
      expect(warn).toHaveBeenLastCalledWith(readonlyWarning('set', `"baz"`));

      wrapped[qux] = 4;
      expect(wrapped[qux]).toBe(3);
      expect(warn).toHaveBeenLastCalledWith(readonlyWarning('set', `"Symbol(qux)"`));

      // @ts-expect-error -- ported as upstream wrote it
      delete wrapped.foo;
      expect(wrapped.foo).toBe(1);
      expect(warn).toHaveBeenLastCalledWith(readonlyWarning('delete', `"foo"`));

      // @ts-expect-error -- ported as upstream wrote it
      delete wrapped.bar.baz;
      expect(wrapped.bar.baz).toBe(2);
      expect(warn).toHaveBeenLastCalledWith(readonlyWarning('delete', `"baz"`));

      // @ts-expect-error -- ported as upstream wrote it
      delete wrapped[qux];
      expect(wrapped[qux]).toBe(3);
      expect(warn).toHaveBeenLastCalledWith(readonlyWarning('delete', `"Symbol(qux)"`));
    });

    it('should not trigger effects', () => {
      const wrapped: any = readonly({ a: 1 });
      let dummy;
      effect(() => {
        dummy = wrapped.a;
      });
      expect(dummy).toBe(1);
      wrapped.a = 2;
      expect(wrapped.a).toBe(1);
      expect(dummy).toBe(1);
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('Array', () => {
    it('should make nested values readonly', () => {
      const original = [{ foo: 1 }];
      const wrapped = readonly(original);
      expect(wrapped).not.toBe(original);
      expect(isProxy(wrapped)).toBe(true);
      expect(isReactive(wrapped)).toBe(false);
      expect(isReadonly(wrapped)).toBe(true);
      expect(isReactive(original)).toBe(false);
      expect(isReadonly(original)).toBe(false);
      expect(isReactive(wrapped[0])).toBe(false);
      expect(isReadonly(wrapped[0])).toBe(true);
      expect(isReactive(original[0])).toBe(false);
      expect(isReadonly(original[0])).toBe(false);
      // get
      expect(wrapped[0].foo).toBe(1);
      // has
      expect(0 in wrapped).toBe(true);
      // ownKeys
      expect(Object.keys(wrapped)).toEqual(['0']);
    });

    it('should not allow mutation', () => {
      const wrapped: any = readonly([{ foo: 1 }]);
      wrapped[0] = 1;
      expect(wrapped[0]).not.toBe(1);
      expect(warn).toHaveBeenCalledWith(readonlyWarning('set', `"0"`));
      wrapped[0].foo = 2;
      expect(wrapped[0].foo).toBe(1);
      expect(warn).toHaveBeenCalledWith(readonlyWarning('set', `"foo"`));

      // should block length mutation
      wrapped.length = 0;
      expect(wrapped.length).toBe(1);
      expect(wrapped[0].foo).toBe(1);
      expect(warn).toHaveBeenCalledWith(readonlyWarning('set', `"length"`));

      // mutation methods invoke set/length internally and thus are blocked as well
      wrapped.push(2);
      expect(wrapped.length).toBe(1);
      // push triggers two warnings on [1] and .length
      expect(warn).toHaveBeenCalledTimes(5);
    });

    it('should not trigger effects', () => {
      const wrapped: any = readonly([{ a: 1 }]);
      let dummy;
      effect(() => {
        dummy = wrapped[0].a;
      });
      expect(dummy).toBe(1);
      wrapped[0].a = 2;
      expect(wrapped[0].a).toBe(1);
      expect(dummy).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
      wrapped[0] = { a: 2 };
      expect(wrapped[0].a).toBe(1);
      expect(dummy).toBe(1);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('should maintain identity when iterating readonly ref array', () => {
      const list = readonly(ref([{}, {}, {}]));
      const computedList = computed(() => {
        const newList: any[] = [];
        list.value.forEach((x) => newList.push(x));
        return newList;
      });

      expect(list.value[0]).toBe(computedList.value[0]);
      expect(isReadonly(computedList.value[0])).toBe(true);
      expect(isReactive(computedList.value[0])).toBe(true);
    });
  });

  const maps = [Map, WeakMap];
  maps.forEach((Collection: any) => {
    describe(Collection.name, () => {
      test('should make nested values readonly', () => {
        const key1 = {};
        const key2 = {};
        const original = new Collection([
          [key1, {}],
          [key2, {}],
        ]);
        const wrapped = readonly(original);
        expect(wrapped).not.toBe(original);
        expect(isProxy(wrapped)).toBe(true);
        expect(isReactive(wrapped)).toBe(false);
        expect(isReadonly(wrapped)).toBe(true);
        expect(isReactive(original)).toBe(false);
        expect(isReadonly(original)).toBe(false);
        expect(isReactive(wrapped.get(key1))).toBe(false);
        expect(isReadonly(wrapped.get(key1))).toBe(true);
        expect(isReactive(original.get(key1))).toBe(false);
        expect(isReadonly(original.get(key1))).toBe(false);
      });

      test('should not allow mutation & not trigger effect', () => {
        const map = readonly(new Collection());
        const key = {};
        let dummy;
        effect(() => {
          dummy = map.get(key);
        });
        expect(dummy).toBeUndefined();
        map.set(key, 1);
        expect(dummy).toBeUndefined();
        expect(map.has(key)).toBe(false);
        expect(warn).toHaveBeenCalledWith(readonlyWarning('set', `"${key}"`));
      });

      // #1772
      test('readonly + reactive should make get() value also readonly + reactive', () => {
        const map = reactive(new Collection());
        const roMap = readonly(map);
        const key = {};
        map.set(key, {});

        const item = map.get(key);
        expect(isReactive(item)).toBe(true);
        expect(isReadonly(item)).toBe(false);

        const roItem = roMap.get(key);
        expect(isReactive(roItem)).toBe(true);
        expect(isReadonly(roItem)).toBe(true);
      });

      if (Collection === Map) {
        test('should retrieve readonly values on iteration', () => {
          const key1 = {};
          const key2 = {};
          const original = new Map([
            [key1, {}],
            [key2, {}],
          ]);
          const wrapped: any = readonly(original);
          expect(wrapped.size).toBe(2);
          for (const [key, value] of wrapped) {
            expect(isReadonly(key)).toBe(true);
            expect(isReadonly(value)).toBe(true);
          }
          wrapped.forEach((value: any) => {
            expect(isReadonly(value)).toBe(true);
          });
          for (const value of wrapped.values()) {
            expect(isReadonly(value)).toBe(true);
          }
        });

        test('should retrieve reactive + readonly values on iteration', () => {
          const key1 = {};
          const key2 = {};
          const original = reactive(
            new Map([
              [key1, {}],
              [key2, {}],
            ]),
          );
          const wrapped: any = readonly(original);
          expect(wrapped.size).toBe(2);
          for (const [key, value] of wrapped) {
            expect(isReadonly(key)).toBe(true);
            expect(isReadonly(value)).toBe(true);
            expect(isReactive(key)).toBe(true);
            expect(isReactive(value)).toBe(true);
          }
          wrapped.forEach((value: any) => {
            expect(isReadonly(value)).toBe(true);
            expect(isReactive(value)).toBe(true);
          });
          for (const value of wrapped.values()) {
            expect(isReadonly(value)).toBe(true);
            expect(isReactive(value)).toBe(true);
          }
        });

        test('should return undefined from Map.clear() call', () => {
          const wrapped = readonly(new Collection());
          expect(wrapped.clear()).toBeUndefined();
          expect(warn).toHaveBeenCalledWith(readonlyWarning('clear', `all entries`));
        });
      }
    });
  });

  const sets = [Set, WeakSet];
  sets.forEach((Collection: any) => {
    describe(Collection.name, () => {
      test('should make nested values readonly', () => {
        const key1 = {};
        const key2 = {};
        const original = new Collection([key1, key2]);
        const wrapped = readonly(original);
        expect(wrapped).not.toBe(original);
        expect(isProxy(wrapped)).toBe(true);
        expect(isReactive(wrapped)).toBe(false);
        expect(isReadonly(wrapped)).toBe(true);
        expect(isReactive(original)).toBe(false);
        expect(isReadonly(original)).toBe(false);
        expect(wrapped.has(reactive(key1))).toBe(true);
        expect(original.has(reactive(key1))).toBe(false);
      });

      test('should not allow mutation & not trigger effect', () => {
        const set = readonly(new Collection());
        const key = {};
        let dummy;
        effect(() => {
          dummy = set.has(key);
        });
        expect(dummy).toBe(false);
        set.add(key);
        expect(dummy).toBe(false);
        expect(set.has(key)).toBe(false);
        expect(warn).toHaveBeenCalledWith(readonlyWarning('add', `"${key}"`));
      });

      if (Collection === Set) {
        test('should retrieve readonly values on iteration', () => {
          const original = new Collection([{}, {}]);
          const wrapped: any = readonly(original);
          expect(wrapped.size).toBe(2);
          for (const value of wrapped) {
            expect(isReadonly(value)).toBe(true);
          }
          wrapped.forEach((value: any) => {
            expect(isReadonly(value)).toBe(true);
          });
          for (const value of wrapped.values()) {
            expect(isReadonly(value)).toBe(true);
          }
          for (const [v1, v2] of wrapped.entries()) {
            expect(isReadonly(v1)).toBe(true);
            expect(isReadonly(v2)).toBe(true);
          }
        });

        test('should return undefined from Set.clear() call', () => {
          const wrapped = readonly(new Collection());
          expect(wrapped.clear()).toBeUndefined();
          expect(warn).toHaveBeenCalledWith(readonlyWarning('clear', `all entries`));
        });
      }
    });
  });

  test('calling reactive on an readonly should return readonly', () => {
    const a = readonly({});
    const b = reactive(a);
    expect(isReadonly(b)).toBe(true);
    // should point to same original
    expect(toRaw(a)).toBe(toRaw(b));
  });

  test('calling readonly on a reactive object should return readonly', () => {
    const a = reactive({});
    const b = readonly(a);
    expect(isReadonly(b)).toBe(true);
    // should point to same original
    expect(toRaw(a)).toBe(toRaw(b));
  });

  test('readonly should track and trigger if wrapping reactive original', () => {
    const a = reactive({ n: 1 });
    const b = readonly(a);
    // should return true since it's wrapping a reactive source
    expect(isReactive(b)).toBe(true);

    let dummy;
    effect(() => {
      dummy = b.n;
    });
    expect(dummy).toBe(1);
    a.n++;
    expect(b.n).toBe(2);
    expect(dummy).toBe(2);
  });

  test('readonly collection should not track', () => {
    const map = new Map();
    map.set('foo', 1);

    const reMap = reactive(map);
    const roMap = readonly(map);

    let dummy;
    effect(() => {
      dummy = roMap.get('foo');
    });
    expect(dummy).toBe(1);
    reMap.set('foo', 2);
    expect(roMap.get('foo')).toBe(2);
    // should not trigger
    expect(dummy).toBe(1);
  });

  test('readonly array should not track', () => {
    const arr = [1];
    const roArr = readonly(arr);

    const eff = effect(() => {
      roArr.includes(2);
    });
    expect(eff.deps).toBeUndefined();
  });

  test('readonly should track and trigger if wrapping reactive original (collection)', () => {
    const a = reactive(new Map());
    const b = readonly(a);
    // should return true since it's wrapping a reactive source
    expect(isReactive(b)).toBe(true);

    a.set('foo', 1);

    let dummy;
    effect(() => {
      dummy = b.get('foo');
    });
    expect(dummy).toBe(1);
    a.set('foo', 2);
    expect(b.get('foo')).toBe(2);
    expect(dummy).toBe(2);
  });

  test('wrapping already wrapped value should return same Proxy', () => {
    const original = { foo: 1 };
    const wrapped = readonly(original);
    const wrapped2 = readonly(wrapped);
    expect(wrapped2).toBe(wrapped);
  });

  test('wrapping the same value multiple times should return same Proxy', () => {
    const original = { foo: 1 };
    const wrapped = readonly(original);
    const wrapped2 = readonly(original);
    expect(wrapped2).toBe(wrapped);
  });

  test('markRaw', () => {
    const obj = readonly({
      foo: { a: 1 },
      bar: markRaw({ b: 2 }),
    });
    expect(isReadonly(obj.foo)).toBe(true);
    expect(isReadonly(obj.bar)).toBe(false);
  });

  test('should make ref readonly', () => {
    const n = readonly(ref(1));
    // @ts-expect-error -- ported as upstream wrote it
    n.value = 2;
    expect(n.value).toBe(1);
    expect(warn).toHaveBeenCalledWith(readonlyWarning('set', `"value"`));
  });

  // https://github.com/vuejs/core/issues/3376
  test('calling readonly on computed should allow computed to set its private properties', () => {
    const r = ref<boolean>(false);
    const c = computed(() => r.value);
    const rC = readonly(c);

    r.value = true;

    expect(rC.value).toBe(true);
    expect(warn).not.toHaveBeenCalledWith(readonlyWarning('set', `"_dirty"`));
    // @ts-expect-error - non-existent property
    rC.randomProperty = true;

    expect(warn).toHaveBeenCalledWith(readonlyWarning('set', `"randomProperty"`));
  });

  // #4986
  test('setting a readonly object as a property of a reactive object should retain readonly proxy', () => {
    const r = readonly({});
    const rr = reactive({}) as any;
    rr.foo = r;
    expect(rr.foo).toBe(r);
    expect(isReadonly(rr.foo)).toBe(true);
  });

  test('attempting to write plain value to a readonly ref nested in a reactive object should fail', () => {
    const r = ref(false);
    const ror = readonly(r);
    const obj = reactive({ ror });
    obj.ror = true;
    expect(warn).toHaveBeenCalledWith(readonlyWarning('set', `"ror"`));
    expect(obj.ror).toBe(false);
  });

  test('replacing a readonly ref nested in a reactive object with a new ref', () => {
    const r = ref(false);
    const ror = readonly(r);
    const obj = reactive({ ror });
    obj.ror = ref(true) as unknown as boolean;
    expect(obj.ror).toBe(true);
    expect(toRaw(obj).ror).not.toBe(ror); // ref successfully replaced
  });

  test('setting readonly object to writable nested ref', () => {
    const r = ref<any>();
    const obj = reactive({ r });
    const ro = readonly({});
    obj.r = ro;
    expect(obj.r).toBe(ro);
    expect(r.value).toBe(ro);
  });

  test('should keep nested ref readonly', () => {
    const items = ref(['one', 'two', 'three']);
    const obj = {
      o: readonly({
        items,
      }),
    };
    expect(isReadonly(obj.o.items)).toBe(true);
  });
});

test('should be able to trigger with triggerRef', () => {
  const r = shallowRef({ a: 1 });
  const ror = readonly(r);
  let dummy;
  effect(() => {
    dummy = ror.value.a;
  });
  r.value.a = 2;
  expect(dummy).toBe(1);
  triggerRef(ror);
  expect(dummy).toBe(2);
});

describe('readonly(reactive(array)) element access', () => {
  // concat/toReversed/toSorted/toSpliced go through reactiveReadArray, which
  // wrapped elements with toReactive and so dropped the readonly layer. The
  // giveaway is the dev warning: writing through the paths below used to land on
  // the raw object without one, while the same write through an index warns.
  const paths: [string, (state: any) => any][] = [
    ['index', (state) => state[0]],
    ['filter', (state) => state.filter(() => true)[0]],
    ['slice', (state) => state.slice()[0]],
    ['concat', (state) => state.concat()[0]],
    ['toReversed', (state) => state.toReversed()[1]],
    ['toSorted', (state) => state.toSorted()[0]],
    ['toSpliced', (state) => state.toSpliced(0, 0)[0]],
  ];

  test.each(paths)('%s preserves readonly and reactivity', (_name, get) => {
    const raw = [{ a: 1 }, { a: 2 }];
    const source = reactive(raw);
    const state = readonly(source);
    const item = get(state);

    expect(isReadonly(item)).toBe(true);
    expect(isReactive(item)).toBe(true);
    expect(item).toBe(state[0]);

    let observed = 0;
    effect(() => {
      observed = item.a;
    });
    expect(observed).toBe(1);

    item.a = 999;
    expect(raw[0].a).toBe(1);
    expect(observed).toBe(1);
    expect(warn).toHaveBeenCalled();

    source[0].a = 2;
    expect(observed).toBe(2);
  });

  test('concat wraps elements coming from a readonly argument', () => {
    const raw = [{ a: 1 }];
    const other = [{ b: 1 }];
    const input = readonly(reactive(raw));
    const merged = reactive<unknown[]>([]).concat(input, reactive(other));

    expect(isReadonly(merged[0])).toBe(true);
    expect(isReactive(merged[0])).toBe(true);
    expect(merged[0]).toBe(input[0]);
    expect(isReadonly(merged[1])).toBe(false);
    expect(isReactive(merged[1])).toBe(true);
  });

  test('readonly(shallowReactive(array)) methods return readonly(reactive(item))', () => {
    // As upstream: an index read is readonly(item), the array methods wrap the reactive item.
    const raw = [{ a: 1 }];
    const state = readonly(shallowReactive(raw));
    const item = readonly(reactive(raw[0]));

    expect(isReactive(state[0])).toBe(false);
    expect(state.find(() => true)).toBe(item);
    const seen: unknown[] = [];
    state.forEach((x) => seen.push(x));
    expect(seen[0]).toBe(item);
    expect(isReadonly(item)).toBe(true);
    expect(isReactive(item)).toBe(true);
    expect(state.includes(item)).toBe(true);
    expect(state.includes(raw[0])).toBe(true);
  });

  test('concat preserves elements from a non-reactive readonly argument', () => {
    const input = readonly([{ a: 1 }]);
    const merged = reactive<unknown[]>([]).concat(input);

    expect(isReadonly(merged[0])).toBe(true);
    expect(isReactive(merged[0])).toBe(false);
    expect(merged[0]).toBe(input[0]);
  });
});

describe('readonly mutations', () => {
  test('a missing key read through readonly(reactive(map)) is tracked by the reactive map', () => {
    const map = reactive(new Map<string, number>());
    let dummy;
    effect(() => (dummy = readonly(map).get('k')));
    expect(dummy).toBeUndefined();
    map.set('k', 1);
    expect(dummy).toBe(1);
  });

  test('collection mutators do not mutate, warn VIBE5002 with the key, and are silent in production', () => {
    const map = readonly(new Map([['k', 1]]));
    const set = readonly(new Set([1]));
    expect((map as Map<string, number>).set('k', 2)).toBe(map);
    expect(warn).toHaveBeenLastCalledWith(readonlyWarning('set', '"k"'));
    expect((set as Set<number>).add(2)).toBe(set);
    expect(warn).toHaveBeenLastCalledWith(readonlyWarning('add', '"2"'));
    expect((map as Map<string, number>).delete('k')).toBe(false);
    expect(warn).toHaveBeenLastCalledWith(readonlyWarning('delete', '"k"'));
    (set as Set<number>).clear();
    expect(warn).toHaveBeenLastCalledWith(readonlyWarning('clear', 'all entries'));
    expect([...map]).toEqual([['k', 1]]);
    expect([...set]).toEqual([1]);

    warn.mockClear();
    vi.stubGlobal('__DEV__', false);
    (map as Map<string, number>).set('k', 2);
    (map as Map<string, number>).delete('k');
    (set as Set<number>).add(2);
    (set as Set<number>).delete(1);
    (set as Set<number>).clear();
    const object = readonly({ a: 1 }) as { a?: number };
    object.a = 2;
    delete object.a;
    expect(warn).not.toHaveBeenCalled();
    expect([...map]).toEqual([['k', 1]]);
    expect([...set]).toEqual([1]);
    expect(object.a).toBe(1);
  });

  test('a collection mutator with a key that has no toString is ignored, in dev and production', () => {
    const key = Object.create(null) as object;
    const map = readonly(new Map<object, number>()) as Map<object, number>;
    const set = readonly(new Set<object>()) as Set<object>;
    expect(map.set(key, 1)).toBe(map);
    expect(warn).toHaveBeenLastCalledWith(readonlyWarning('set', 'an object'));
    expect(set.add(key)).toBe(set);
    expect(map.delete(key)).toBe(false);
    vi.stubGlobal('__DEV__', false);
    expect(set.add(key)).toBe(set);
    expect(set.delete(key)).toBe(false);
    expect(map.size + set.size).toBe(0);
  });
});
