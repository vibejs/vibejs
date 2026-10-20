// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/__tests__/computed.spec.ts (MIT)
//
// Cases that need components move to RR-5; onTrack/onTrigger are not part of this API.
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { vibeError } from '../errors.gen.ts';
import { computed, ComputedRefImpl, type ComputedRef } from './computed.ts';
import { endBatch, ReactiveEffect, setActiveSub, startBatch } from './core.ts';
import { isReadonly } from './dep.ts';
import { reactive } from './reactive.ts';
import { ref, RefImpl, shallowRef, triggerRef } from './ref.ts';
import { ReactiveFlags } from './system.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

const impl = <T>(c: ComputedRef<T>): ComputedRefImpl<T> => {
  if (!(c instanceof ComputedRefImpl)) throw new TypeError('not a computed');
  return c;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reactivity/computed', () => {
  it('should return updated value', () => {
    const value = reactive<{ foo?: number }>({});
    const cValue = computed(() => value.foo);
    expect(cValue.value).toBe(undefined);
    value.foo = 1;
    expect(cValue.value).toBe(1);
  });

  it('pass oldValue to computed getter', () => {
    const count = ref(0);
    const oldValue = ref();
    const curValue = computed((pre) => {
      oldValue.value = pre;
      return count.value;
    });
    expect(curValue.value).toBe(0);
    expect(oldValue.value).toBe(undefined);
    count.value++;
    expect(curValue.value).toBe(1);
    expect(oldValue.value).toBe(0);
  });

  it('should compute lazily', () => {
    const value = reactive<{ foo?: number }>({});
    const getter = vi.fn<() => number | undefined>(() => value.foo);
    const cValue = computed(getter);

    // lazy
    expect(getter).not.toHaveBeenCalled();

    expect(cValue.value).toBe(undefined);
    expect(getter).toHaveBeenCalledTimes(1);

    // should not compute again
    void cValue.value;
    expect(getter).toHaveBeenCalledTimes(1);

    // should not compute until needed
    value.foo = 1;
    expect(getter).toHaveBeenCalledTimes(1);

    // now it should compute
    expect(cValue.value).toBe(1);
    expect(getter).toHaveBeenCalledTimes(2);

    // should not compute again
    void cValue.value;
    expect(getter).toHaveBeenCalledTimes(2);
  });

  it('should trigger effect', () => {
    const value = reactive<{ foo?: number }>({});
    const cValue = computed(() => value.foo);
    let dummy;
    effect(() => {
      dummy = cValue.value;
    });
    expect(dummy).toBe(undefined);
    value.foo = 1;
    expect(dummy).toBe(1);
  });

  it('should work when chained', () => {
    const value = reactive({ foo: 0 });
    const c1 = computed(() => value.foo);
    const c2 = computed(() => c1.value + 1);
    expect(c2.value).toBe(1);
    expect(c1.value).toBe(0);
    value.foo++;
    expect(c2.value).toBe(2);
    expect(c1.value).toBe(1);
  });

  it('should trigger effect when chained', () => {
    const value = reactive({ foo: 0 });
    const getter1 = vi.fn<() => number>(() => value.foo);
    const getter2 = vi.fn<() => number>(() => {
      return c1.value + 1;
    });
    const c1 = computed(getter1);
    const c2 = computed(getter2);

    let dummy;
    effect(() => {
      dummy = c2.value;
    });
    expect(dummy).toBe(1);
    expect(getter1).toHaveBeenCalledTimes(1);
    expect(getter2).toHaveBeenCalledTimes(1);
    value.foo++;
    expect(dummy).toBe(2);
    // should not result in duplicate calls
    expect(getter1).toHaveBeenCalledTimes(2);
    expect(getter2).toHaveBeenCalledTimes(2);
  });

  it('should trigger effect when chained (mixed invocations)', () => {
    const value = reactive({ foo: 0 });
    const getter1 = vi.fn<() => number>(() => value.foo);
    const getter2 = vi.fn<() => number>(() => {
      return c1.value + 1;
    });
    const c1 = computed(getter1);
    const c2 = computed(getter2);

    let dummy;
    effect(() => {
      dummy = c1.value + c2.value;
    });
    expect(dummy).toBe(1);

    expect(getter1).toHaveBeenCalledTimes(1);
    expect(getter2).toHaveBeenCalledTimes(1);
    value.foo++;
    expect(dummy).toBe(3);
    // should not result in duplicate calls
    expect(getter1).toHaveBeenCalledTimes(2);
    expect(getter2).toHaveBeenCalledTimes(2);
  });

  it('should be readonly', () => {
    let a = { a: 1 };
    const x = computed(() => a);
    expect(isReadonly(x)).toBe(true);
    expect(isReadonly(x.value)).toBe(false);
    expect(isReadonly(x.value.a)).toBe(false);
    const z = computed<typeof a>({
      get() {
        return a;
      },
      set(v) {
        a = v;
      },
    });
    expect(isReadonly(z)).toBe(false);
    expect(isReadonly(z.value.a)).toBe(false);
  });

  it('should support setter', () => {
    const n = ref(1);
    const plusOne = computed({
      get: () => n.value + 1,
      set: (val: number) => {
        n.value = val - 1;
      },
    });

    expect(plusOne.value).toBe(2);
    n.value++;
    expect(plusOne.value).toBe(3);

    plusOne.value = 0;
    expect(n.value).toBe(-1);
  });

  it('should trigger effect w/ setter', () => {
    const n = ref(1);
    const plusOne = computed({
      get: () => n.value + 1,
      set: (val: number) => {
        n.value = val - 1;
      },
    });

    let dummy;
    effect(() => {
      dummy = n.value;
    });
    expect(dummy).toBe(1);

    plusOne.value = 0;
    expect(dummy).toBe(-1);
  });

  // #5720
  it('should invalidate before non-computed effects', () => {
    const plusOneValues: number[] = [];
    const n = ref(0);
    const plusOne = computed(() => n.value + 1);
    effect(() => {
      void n.value;
      plusOneValues.push(plusOne.value);
    });
    // access plusOne, causing it to be non-dirty
    void plusOne.value;
    // mutate n
    n.value++;
    // on the 2nd run, plusOne.value should have already updated.
    expect(plusOneValues).toMatchObject([1, 2]);
  });

  it('should warn if trying to set a readonly computed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const n = ref(1);
    const plusOne = computed(() => n.value + 1);
    Reflect.set(plusOne, 'value', plusOne.value + 1); // Reflect, because TS rejects the write

    expect(warn).toHaveBeenLastCalledWith(vibeError('VIBE5003').message);
    expect(vibeError('VIBE5003').message).toMatch(/^\[VIBE5003\] Cannot assign/);
    vi.stubGlobal('__DEV__', false);
    Reflect.set(plusOne, 'value', 5);
    expect(plusOne.value).toBe(2);
    expect(warn).toHaveBeenCalledOnce();
  });

  // https://github.com/vuejs/core/pull/5912#issuecomment-1497596875
  it('should query deps dirty sequentially', () => {
    const cSpy = vi.fn<(value?: unknown) => void>();

    const a = ref<null | { v: number }>({
      v: 1,
    });
    const b = computed(() => {
      return a.value;
    });
    const c = computed(() => {
      cSpy();
      return b.value?.v;
    });
    const d = computed(() => {
      if (b.value) {
        return c.value;
      }
      return 0;
    });

    void d.value;
    a.value!.v = 2;
    a.value = null;
    void d.value;
    expect(cSpy).toHaveBeenCalledTimes(1);
  });

  // https://github.com/vuejs/core/pull/5912#issuecomment-1738257692
  it('chained computed dirty reallocation after querying dirty', () => {
    let msgValue: string | undefined;

    const items = ref<number[]>();
    const isLoaded = computed(() => {
      return !!items.value;
    });
    const msg = computed(() => {
      if (isLoaded.value) {
        return 'The items are loaded';
      } else {
        return 'The items are not loaded';
      }
    });

    effect(() => {
      msgValue = msg.value;
    });

    items.value = [1, 2, 3];
    items.value = [1, 2, 3];
    items.value = undefined;

    expect(msgValue).toBe('The items are not loaded');
  });

  it('chained computed dirty reallocation after trigger computed getter', () => {
    let msgValue: string | undefined;

    const items = ref<number[]>();
    const isLoaded = computed(() => {
      return !!items.value;
    });
    const msg = computed(() => {
      if (isLoaded.value) {
        return 'The items are loaded';
      } else {
        return 'The items are not loaded';
      }
    });

    msgValue = msg.value;
    items.value = [1, 2, 3];
    void isLoaded.value; // <- trigger computed getter
    msgValue = msg.value;
    items.value = undefined;
    msgValue = msg.value;

    expect(msgValue).toBe('The items are not loaded');
  });

  // https://github.com/vuejs/core/pull/5912#issuecomment-1739159832
  it('deps order should be consistent with the last time get value', () => {
    const cSpy = vi.fn<(value?: unknown) => void>();

    const a = ref(0);
    const b = computed(() => {
      return a.value % 3 !== 0;
    });
    const c = computed(() => {
      cSpy();
      if (a.value % 3 === 2) {
        return 'expensive';
      }
      return 'cheap';
    });
    const d = computed(() => {
      return a.value % 3 === 2;
    });
    const e = computed(() => {
      if (b.value) {
        if (d.value) {
          return 'Avoiding expensive calculation';
        }
      }
      return c.value;
    });

    void e.value;
    a.value++;
    void e.value;

    const deps = impl(e).deps!;
    expect(deps.dep).toBe(b);
    expect(deps.nextDep!.dep).toBe(d);
    expect(deps.nextDep!.nextDep!.dep).toBe(c);
    expect(cSpy).toHaveBeenCalledTimes(2);

    a.value++;
    void e.value;

    expect(cSpy).toHaveBeenCalledTimes(2);
  });

  it('should trigger by the second computed that maybe dirty', () => {
    const cSpy = vi.fn<(value?: unknown) => void>();

    const src1 = ref(0);
    const src2 = ref(0);
    const c1 = computed(() => src1.value);
    const c2 = computed(() => (src1.value % 2) + src2.value);
    const c3 = computed(() => {
      cSpy();
      void c1.value;
      void c2.value;
    });

    expect(c3.value).toBeUndefined();
    src1.value = 2;
    expect(c3.value).toBeUndefined();
    expect(cSpy).toHaveBeenCalledTimes(2);
    src2.value = 1;
    expect(c3.value).toBeUndefined();
    expect(cSpy).toHaveBeenCalledTimes(3);
  });

  it('should trigger the second effect', () => {
    const fnSpy = vi.fn<(value?: unknown) => void>();
    const v = ref(1);
    const c = computed(() => v.value);

    effect(() => {
      void c.value;
    });
    effect(() => {
      void c.value;
      fnSpy();
    });

    expect(fnSpy).toBeCalledTimes(1);
    v.value = 2;
    expect(fnSpy).toBeCalledTimes(2);
  });

  it('should chained recursive effects clear dirty after trigger', () => {
    const v = ref(1);
    const c1 = computed(() => v.value);
    const c2 = computed(() => c1.value);

    void c2.value;
    expect(impl(c1).flags & ReactiveFlags.Dirty).toBeFalsy();
    expect(impl(c2).flags & ReactiveFlags.Dirty).toBeFalsy();
  });

  it('should chained computeds dirtyLevel update with first computed effect', () => {
    const v = ref(0);
    const c1 = computed(() => {
      if (v.value === 0) {
        v.value = 1;
      }
      return v.value;
    });
    const c2 = computed(() => c1.value);
    const c3 = computed(() => c2.value);

    expect(c3.value).toBe(1);
  });

  it('should work when chained(ref+computed)', () => {
    const v = ref(0);
    const c1 = computed(() => {
      if (v.value === 0) {
        v.value = 1;
      }
      return 'foo';
    });
    const c2 = computed(() => v.value + c1.value);
    expect(c2.value).toBe('0foo');
    expect(c2.value).toBe('1foo');
  });

  it('should trigger effect even computed already dirty', () => {
    const fnSpy = vi.fn<(value?: unknown) => void>();
    const v = ref(0);
    const c1 = computed(() => {
      if (v.value === 0) {
        v.value = 1;
      }
      return 'foo';
    });
    const c2 = computed(() => v.value + c1.value);

    effect(() => {
      fnSpy(c2.value);
    });
    expect(fnSpy).toBeCalledTimes(1);
    expect(fnSpy.mock.calls).toMatchObject([['0foo']]);
    expect(v.value).toBe(1);
    v.value = 2;
    expect(fnSpy).toBeCalledTimes(2);
    expect(fnSpy.mock.calls).toMatchObject([['0foo'], ['2foo']]);
    expect(v.value).toBe(2);
  });

  // #10185
  it('should not override queried MaybeDirty result', () => {
    class Item {
      v = ref(0);
    }
    const v1 = shallowRef<Item>();
    const v2 = ref(false);
    const c1 = computed(() => {
      let c = v1.value;
      if (!v1.value) {
        c = new Item();
        v1.value = c;
      }
      return c!.v.value;
    });
    const c2 = computed(() => {
      if (!v2.value) return 'no';
      return c1.value ? 'yes' : 'no';
    });
    const c3 = computed(() => c2.value);

    void c3.value;
    v2.value = true;

    void c3.value;
    v1.value!.v.value = 999;

    expect(c3.value).toBe('yes');
  });

  test('should not trigger if value did not change', () => {
    const src = ref(0);
    const c = computed(() => src.value % 2);
    const spy = vi.fn<(value?: unknown) => void>();
    effect(() => {
      spy(c.value);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    src.value = 2;

    // should not trigger
    expect(spy).toHaveBeenCalledTimes(1);

    src.value = 3;
    src.value = 5;
    // should trigger because latest value changes
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('chained computed trigger', () => {
    const effectSpy = vi.fn<(value?: unknown) => void>();
    const c1Spy = vi.fn<(value?: unknown) => void>();
    const c2Spy = vi.fn<(value?: unknown) => void>();

    const src = ref(0);
    const c1 = computed(() => {
      c1Spy();
      return src.value % 2;
    });
    const c2 = computed(() => {
      c2Spy();
      return c1.value + 1;
    });

    effect(() => {
      effectSpy(c2.value);
    });

    expect(c1Spy).toHaveBeenCalledTimes(1);
    expect(c2Spy).toHaveBeenCalledTimes(1);
    expect(effectSpy).toHaveBeenCalledTimes(1);

    src.value = 1;
    expect(c1Spy).toHaveBeenCalledTimes(2);
    expect(c2Spy).toHaveBeenCalledTimes(2);
    expect(effectSpy).toHaveBeenCalledTimes(2);
  });

  test('chained computed avoid re-compute', () => {
    const effectSpy = vi.fn<(value?: unknown) => void>();
    const c1Spy = vi.fn<(value?: unknown) => void>();
    const c2Spy = vi.fn<(value?: unknown) => void>();

    const src = ref(0);
    const c1 = computed(() => {
      c1Spy();
      return src.value % 2;
    });
    const c2 = computed(() => {
      c2Spy();
      return c1.value + 1;
    });

    effect(() => {
      effectSpy(c2.value);
    });

    expect(effectSpy).toHaveBeenCalledTimes(1);
    src.value = 2;
    src.value = 4;
    src.value = 6;
    expect(c1Spy).toHaveBeenCalledTimes(4);
    // c2 should not have to re-compute because c1 did not change.
    expect(c2Spy).toHaveBeenCalledTimes(1);
    // effect should not trigger because c2 did not change.
    expect(effectSpy).toHaveBeenCalledTimes(1);
  });

  test('chained computed value invalidation', () => {
    const effectSpy = vi.fn<(value?: unknown) => void>();
    const c1Spy = vi.fn<(value?: unknown) => void>();
    const c2Spy = vi.fn<(value?: unknown) => void>();

    const src = ref(0);
    const c1 = computed(() => {
      c1Spy();
      return src.value % 2;
    });
    const c2 = computed(() => {
      c2Spy();
      return c1.value + 1;
    });

    effect(() => {
      effectSpy(c2.value);
    });

    expect(effectSpy).toHaveBeenCalledTimes(1);
    expect(effectSpy).toHaveBeenCalledWith(1);
    expect(c2.value).toBe(1);

    expect(c1Spy).toHaveBeenCalledTimes(1);
    expect(c2Spy).toHaveBeenCalledTimes(1);

    src.value = 1;
    // value should be available sync
    expect(c2.value).toBe(2);
    expect(c2Spy).toHaveBeenCalledTimes(2);
  });

  test('sync access of invalidated chained computed should not prevent final effect from running', () => {
    const effectSpy = vi.fn<(value?: unknown) => void>();
    const c1Spy = vi.fn<(value?: unknown) => void>();
    const c2Spy = vi.fn<(value?: unknown) => void>();

    const src = ref(0);
    const c1 = computed(() => {
      c1Spy();
      return src.value % 2;
    });
    const c2 = computed(() => {
      c2Spy();
      return c1.value + 1;
    });

    effect(() => {
      effectSpy(c2.value);
    });
    expect(effectSpy).toHaveBeenCalledTimes(1);

    src.value = 1;
    // sync access c2
    void c2.value;
    expect(effectSpy).toHaveBeenCalledTimes(2);
  });

  it('computed should force track in untracked zone', () => {
    const n = ref(0);
    const spy1 = vi.fn<(value?: unknown) => void>();
    const spy2 = vi.fn<(value?: unknown) => void>();

    effect(() => {
      spy1();
      const prev = setActiveSub(undefined);
      void n.value;
      const c = computed(() => n.value + 1);
      // access computed now to force refresh
      void c.value;
      effect(() => spy2(c.value));
      void n.value;
      setActiveSub(prev);
    });

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);

    n.value++;
    // outer effect should not trigger
    expect(spy1).toHaveBeenCalledTimes(1);
    // inner effect should trigger
    expect(spy2).toHaveBeenCalledTimes(2);
  });

  // not recommended behavior, but needed for backwards compatibility
  it('computed side effect should be able trigger', () => {
    const a = ref(false);
    const b = ref(false);
    const c = computed(() => {
      a.value = true;
      return b.value;
    });
    effect(() => {
      if (a.value) {
        b.value = true;
      }
    });
    expect(b.value).toBe(false);
    // accessing c triggers change
    void c.value;
    expect(b.value).toBe(true);
    expect(c.value).toBe(true);
  });

  it('chained computed should work when accessed before having subs', () => {
    const n = ref(0);
    const c = computed(() => n.value);
    const d = computed(() => c.value + 1);
    const spy = vi.fn<(value?: unknown) => void>();

    // access
    void d.value;

    let dummy;
    effect(() => {
      spy();
      dummy = d.value;
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(dummy).toBe(1);

    n.value++;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(dummy).toBe(2);
  });

  it('should be recomputed without being affected by side effects', () => {
    const v = ref(0);
    const c1 = computed(() => {
      v.value = 1;
      return 0;
    });
    const c2 = computed(() => {
      return v.value + ',' + c1.value;
    });

    expect(c2.value).toBe('0,0');
    v.value = 1;
    expect(c2.value).toBe('1,0');
  });

  test('manual trigger computed', () => {
    const cValue = computed(() => 1);
    triggerRef(cValue);
    expect(cValue.value).toBe(1);
  });

  test('should not recompute if computed does not track reactive data', () => {
    const spy = vi.fn<(value?: unknown) => void>();
    const c1 = computed(() => spy());

    expect(c1.value).toBeUndefined();
    ref(0).value++; // update globalVersion
    expect(c1.value).toBeUndefined();

    expect(spy).toBeCalledTimes(1);
  });

  test('computed should remain live after losing all subscribers', () => {
    const state = reactive({ a: 1 });
    const p = computed(() => state.a + 1);
    const e = effect(() => p.value);
    e.stop();

    expect(p.value).toBe(2);
    state.a++;
    expect(p.value).toBe(3);
  });

  // #11995
  test('computed dep cleanup should not cause property dep to be deleted', () => {
    const toggle = ref(true);
    const state = reactive({ a: 1 });
    const p = computed(() => {
      return toggle.value ? state.a : 111;
    });
    const pp = computed(() => state.a);
    effect(() => p.value);

    expect(pp.value).toBe(1);
    toggle.value = false;
    state.a++;
    expect(pp.value).toBe(2);
  });

  // #12020
  test('computed value updates correctly after dep cleanup', () => {
    const obj = reactive({ foo: 1, flag: 1 });
    const c1 = computed(() => obj.foo);

    let foo;
    effect(() => {
      foo = obj.flag ? (obj.foo, c1.value) : 0;
    });
    expect(foo).toBe(1);

    obj.flag = 0;
    expect(foo).toBe(0);

    obj.foo = 2;
    obj.flag = 1;
    expect(foo).toBe(2);
  });

  // #11928. Upstream bounds the wall-clock time; counting getter calls proves the same without
  // depending on the machine: each computed evaluates at most once per write.
  test('should not lead to exponential perf cost with deeply chained computed', () => {
    type Layer = Record<'prop1' | 'prop2' | 'prop3' | 'prop4', { readonly value: number }>;
    const start = {
      prop1: shallowRef(1),
      prop2: shallowRef(2),
      prop3: shallowRef(3),
      prop4: shallowRef(4),
    };

    let layer: Layer = start;
    let calls = 0;

    const LAYERS = 1000;

    for (let i = LAYERS; i > 0; i--) {
      const m = layer;
      const s = {
        prop1: computed(() => (calls++, m.prop2.value)),
        prop2: computed(() => (calls++, m.prop1.value - m.prop3.value)),
        prop3: computed(() => (calls++, m.prop2.value + m.prop4.value)),
        prop4: computed(() => (calls++, m.prop3.value)),
      };
      effect(() => s.prop1.value);
      effect(() => s.prop2.value);
      effect(() => s.prop3.value);
      effect(() => s.prop4.value);

      void s.prop1.value;
      void s.prop2.value;
      void s.prop3.value;
      void s.prop4.value;

      layer = s;
    }

    calls = 0;
    start.prop1.value = 4;
    start.prop2.value = 3;
    start.prop3.value = 2;
    start.prop4.value = 1;
    expect(calls).toBeLessThanOrEqual(4 * 4 * LAYERS);

    const end = layer;
    expect([end.prop1.value, end.prop2.value, end.prop3.value, end.prop4.value]).toMatchObject([
      -2, -4, 2, 3,
    ]);
  });

  test('performance when removing dependencies from deeply nested computeds', () => {
    const base = ref(1);
    const trigger = ref(true);
    const computeds: ComputedRef<number>[] = [];
    let calls = 0;

    const LAYERS = 30;

    for (let i = 0; i < LAYERS; i++) {
      const earlier = [...computeds];

      computeds.push(
        computed(() => {
          calls++;
          return base.value + earlier.reduce((sum, c) => sum + c.value, 0);
        }),
      );
    }

    const tail = computed(() => (trigger.value ? computeds[computeds.length - 1].value : 0));

    expect(tail.value).toBe(2 ** (LAYERS - 1));
    expect(calls).toBe(LAYERS);

    trigger.value = false;
    expect(tail.value).toBe(0);
    expect(calls).toBe(LAYERS);
  });
});

describe('computed', () => {
  test('A -> B -> A in a batch re-runs no dependent computed or effect', () => {
    const a = ref('A');
    const getter = vi.fn<() => string>(() => a.value);
    const c = computed(getter);
    const spy = vi.fn<(value?: unknown) => void>();
    effect(() => spy(c.value));

    startBatch();
    a.value = 'B';
    a.value = 'A';
    endBatch();

    expect(getter).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(c.value).toBe('A');
  });

  test('an Object.is-equal recompute notifies no subscriber', () => {
    const src = ref(1);
    const getter = vi.fn<() => number>(() => (src.value > 0 ? Number.NaN : 0));
    const c = computed(getter);
    const downstream = vi.fn<() => number>(() => c.value);
    const d = computed(downstream);
    const spy = vi.fn<(value?: unknown) => void>();
    effect(() => spy(d.value));

    src.value = 2;

    expect(getter).toHaveBeenCalledTimes(2);
    expect(downstream).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('losing the last subscriber unlinks the deps; the next read recomputes', () => {
    const src = ref(0);
    const getter = vi.fn<() => number>(() => src.value);
    const c = computed(getter);
    const reader = effect(() => c.value);
    expect(impl(c).deps).toBeDefined();

    reader.stop();
    expect(impl(c).deps).toBeUndefined();
    expect(impl(c).flags & ReactiveFlags.Dirty).toBeTruthy();
    expect(src instanceof RefImpl && src.subs).toBeUndefined();

    src.value = 1;
    expect(getter).toHaveBeenCalledTimes(1);
    expect(c.value).toBe(1);
    expect(getter).toHaveBeenCalledTimes(2);
  });

  test('a computed with no deps keeps its value after losing its last subscriber', () => {
    const getter = vi.fn<() => number>(() => 1);
    const c = computed(getter);
    effect(() => c.value).stop();
    expect(c.value).toBe(1);
    expect(getter).toHaveBeenCalledTimes(1);
  });

  test('a chain of computeds is released link by link', () => {
    const src = ref(0);
    const c1 = computed(() => src.value);
    const c2 = computed(() => c1.value);
    effect(() => c2.value).stop();
    expect(impl(c2).deps).toBeUndefined();
    expect(impl(c1).deps).toBeUndefined();
  });
});
