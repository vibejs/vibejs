// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/__tests__/watch.spec.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/__tests__/apiWatch.spec.ts (MIT)
//
// The base `watch()` of the first spec is synchronous and takes `call` and `scheduler` options;
// here its cases use `flush: 'sync'` and `watchSyncEffect()`, its custom scheduler is the pre
// queue, and its `call` error handler is the built-in `handleError`, which reports instead of
// rethrowing. Of the second spec, the cases built on components move to RR-5 ("flush timing: pre
// (default)", "flush timing: post", "watchPostEffect", "flush timing: sync", "watchSyncEffect",
// "should not fire on component unmount w/ flush: post", "should not fire on component unmount w/
// flush: pre", "should not fire on child component unmount w/ flush: pre", "flush: pre watcher in
// child component should not fire before parent update", "flush: pre watcher watching props should
// fire before child update", "flush: pre triggered in component setup should be buffered and
// called before mounted", "flush: post watcher should fire after template refs updated", "pre
// watcher callbacks should not track dependencies", "sync watcher callbacks should not track
// dependencies", "watch should not register in owner component if created inside detached scope",
// "watchEffect should keep running if created in a detached scope" and "watch immediate error in
// effect scope should be caught by onErrorCaptured"); "effect should be removed from scope's
// effects after it is stopped" keeps its effect scope half. Left out: SSR and `this.$watch` cases
// ("stopping the watcher (SSR)", "$watch should always register its effects with its own
// instance", "this.$watch should pass `this.proxy` to watch source as the first argument",
// "watching keypath", "this.$watch w/ onScopeDispose"), onTrack/onTrigger, and the warnings for
// `immediate`/`deep` passed to watchEffect(), whose options type has only `flush`. Warning texts
// are VIBE-code assertions.
// oxlint-disable eslint/no-shadow, typescript/no-explicit-any, typescript/no-unnecessary-boolean-literal-compare, typescript/no-unnecessary-condition, typescript/no-unsafe-type-assertion, unicorn/consistent-function-scoping, vitest/require-mock-type-parameters -- ported as upstream wrote it
import { isVibeError, type VibeError } from '@vibejs-org/errors';
import { afterEach, beforeEach, describe, expect, it, test, vi, type MockInstance } from 'vitest';
import { vibeError } from '../errors.gen.ts';
import { computed } from '../reactivity/computed.ts';
import { ReactiveEffect } from '../reactivity/core.ts';
import { effectScope, EffectScopeImpl, type EffectScope } from '../reactivity/effectScope.ts';
import { markRaw, reactive, readonly, shallowReactive } from '../reactivity/reactive.ts';
import {
  ref,
  shallowRef,
  toRef,
  triggerRef,
  type Ref,
  type ShallowRef,
} from '../reactivity/ref.ts';
import { nextTick } from './scheduler.ts';
import { onWatcherCleanup, watch, watchEffect, watchPostEffect, watchSyncEffect } from './watch.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

const impl = (scope: EffectScope): EffectScopeImpl => {
  if (!(scope instanceof EffectScopeImpl)) throw new TypeError('not an effect scope');
  return scope;
};

let warnSpy: MockInstance<(...args: unknown[]) => void>;
let errorSpy: MockInstance<(...args: unknown[]) => void>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The errors that reached `handleError`, as `[cause, info]` pairs. */
const reported = (): [unknown, unknown][] =>
  errorSpy.mock.calls.map(([logged]) => {
    expect(isVibeError(logged, 'VIBE5102')).toBe(true);
    return [(logged as VibeError).cause, (logged as VibeError).args.info];
  });

const warned = (): unknown[] => warnSpy.mock.calls.map(([message]) => message);

describe('watch', () => {
  test('effect', () => {
    let dummy: any;
    const source = ref(0);
    watchSyncEffect(() => {
      dummy = source.value;
    });
    expect(dummy).toBe(0);
    source.value++;
    expect(dummy).toBe(1);
  });

  test('with callback', () => {
    let dummy: any;
    const source = ref(0);
    watch(
      source,
      () => {
        dummy = source.value;
      },
      { flush: 'sync' },
    );
    expect(dummy).toBe(undefined);
    source.value++;
    expect(dummy).toBe(1);
  });

  test('call option with error handling', () => {
    watchSyncEffect(() => {
      throw 'oops in effect';
    });

    const source = ref(0);
    const handle = watch(
      source,
      () => {
        onWatcherCleanup(() => {
          throw 'oops in cleanup';
        });
        throw 'oops in watch';
      },
      { flush: 'sync' },
    );

    expect(reported()).toEqual([['oops in effect', 'watcher callback']]);

    source.value++;
    expect(reported()).toHaveLength(2);
    expect(reported()[1]).toEqual(['oops in watch', 'watcher callback']);

    handle.stop();
    source.value++;
    expect(reported()).toHaveLength(3);
    expect(reported()[2]).toEqual(['oops in cleanup', 'watcher cleanup']);
  });

  test('call option with async error handling', async () => {
    const source1 = ref(0);
    watch(
      source1,
      async () => {
        throw 'oops in watch';
      },
      { flush: 'sync' },
    );

    source1.value++;
    await nextTick();
    expect(reported()).toEqual([['oops in watch', 'watcher callback']]);

    const source2 = ref(0);
    watch(
      source2,
      async () => {
        throw 'oops in once watch';
      },
      { flush: 'sync', once: true },
    );

    source2.value++;
    await nextTick();
    expect(reported()).toHaveLength(2);
    expect(reported()[1]).toEqual(['oops in once watch', 'watcher callback']);
  });

  test('watch with onWatcherCleanup', async () => {
    let dummy = 0;
    let source!: Ref<number>;
    const scope = effectScope();

    scope.run(() => {
      source = ref(0);
      watchSyncEffect((onCleanup) => {
        void source.value;

        onCleanup(() => (dummy += 2));
        onWatcherCleanup(() => (dummy += 3));
        onWatcherCleanup(() => (dummy += 5));
      });
    });
    expect(dummy).toBe(0);

    scope.run(() => {
      source.value++;
    });
    expect(dummy).toBe(10);

    scope.run(() => {
      source.value++;
    });
    expect(dummy).toBe(20);

    scope.stop();
    expect(dummy).toBe(30);
  });

  test('nested calls to baseWatch and onWatcherCleanup', async () => {
    const calls: string[] = [];
    let source!: Ref<number>;
    let copyist!: Ref<number>;
    const scope = effectScope();

    scope.run(() => {
      source = ref(0);
      copyist = ref(0);
      // sync by default
      watchSyncEffect(() => {
        const current = (copyist.value = source.value);
        onWatcherCleanup(() => calls.push(`sync ${current}`));
      });
      // with scheduler
      watchEffect(() => {
        const current = copyist.value;
        onWatcherCleanup(() => calls.push(`post ${current}`));
      });
    });

    await nextTick();
    expect(calls).toEqual([]);

    scope.run(() => source.value++);
    expect(calls).toEqual(['sync 0']);
    await nextTick();
    expect(calls).toEqual(['sync 0', 'post 0']);
    calls.length = 0;

    scope.run(() => source.value++);
    expect(calls).toEqual(['sync 1']);
    await nextTick();
    expect(calls).toEqual(['sync 1', 'post 1']);
    calls.length = 0;

    scope.stop();
    expect(calls).toEqual(['sync 2', 'post 2']);
  });

  test('once option should be ignored by simple watch', async () => {
    let dummy: any;
    const source = ref(0);
    watchEffect(
      () => {
        dummy = source.value;
      },
      // @ts-expect-error -- watchEffect() takes no `once` option
      { flush: 'sync', once: true },
    );
    expect(dummy).toBe(0);

    source.value++;
    expect(dummy).toBe(1);
  });

  // #12033
  test('recursive sync watcher on computed', () => {
    const r = ref(0);
    const c = computed(() => r.value);

    watch(
      c,
      (v) => {
        if (v > 1) {
          r.value--;
        }
      },
      { flush: 'sync' },
    );

    expect(r.value).toBe(0);
    expect(c.value).toBe(0);

    r.value = 10;
    expect(r.value).toBe(1);
    expect(c.value).toBe(1);
  });

  // edge case where a nested endBatch() causes an effect to be batched in a
  // nested batch loop with its .next mutated, causing the outer loop to end
  // early
  test('nested batch edge case', () => {
    // useClamp from VueUse
    const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
    function useClamp(src: Ref<number>, min: number, max: number) {
      return computed({
        get() {
          return (src.value = clamp(src.value, min, max));
        },
        set(val: number) {
          src.value = clamp(val, min, max);
        },
      });
    }

    const src = ref(1);
    const clamped = useClamp(src, 1, 5);
    watch(src, (val) => (clamped.value = val), { flush: 'sync' });

    const spy = vi.fn();
    watch(clamped, spy, { flush: 'sync' });

    src.value = 2;
    expect(spy).toHaveBeenCalledTimes(1);
    src.value = 10;
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('should ensure correct execution order in batch processing', () => {
    const dummy: number[] = [];
    const n1 = ref(0);
    const n2 = ref(0);
    const sum = computed(() => n1.value + n2.value);
    watch(
      n1,
      () => {
        dummy.push(1);
        n2.value++;
      },
      { flush: 'sync' },
    );
    watch(sum, () => dummy.push(2), { flush: 'sync' });
    watch(n1, () => dummy.push(3), { flush: 'sync' });

    n1.value++;

    expect(dummy).toEqual([1, 2, 3]);
  });

  test('watch with immediate reset and sync flush', () => {
    const value = ref(false);

    watch(
      value,
      () => {
        value.value = false;
      },
      { flush: 'sync' },
    );

    value.value = true;
    value.value = true;
    expect(value.value).toBe(false);
  });

  test('once watcher should stop when its callback throws', () => {
    const source = ref(0);
    const err = new Error('oops');
    const callback = vi.fn(() => {
      throw err;
    });
    watch(source, callback, { flush: 'sync', once: true });

    source.value = 1;
    expect(reported()).toEqual([[err, 'watcher callback']]);
    source.value = 2;
    expect(callback).toHaveBeenCalledTimes(1);
  });

  // #5009
  test('should not track deps of cleanup and callback run inside another effect', () => {
    const source = ref(0);
    const dep = ref(0);
    const cb = vi.fn(() => {
      void dep.value;
      onWatcherCleanup(() => dep.value);
    });
    watch(source, cb, { flush: 'sync' });
    source.value++;
    expect(cb).toHaveBeenCalledTimes(1);

    const fn = vi.fn(() => {
      source.value = 10;
    });
    effect(fn);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledTimes(1);

    dep.value++;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should restore tracking when cleanup throws inside another effect', () => {
    const source = ref(0);
    const dep = ref(0);
    const err = new Error('cleanup error');
    watch(
      source,
      () => {
        onWatcherCleanup(() => {
          throw err;
        });
      },
      { flush: 'sync' },
    );
    source.value++;

    let dummy;
    effect(() => {
      source.value = 10;
      dummy = dep.value;
    });
    expect(reported()).toEqual([[err, 'watcher cleanup']]);
    expect(dummy).toBe(0);

    dep.value++;
    expect(dummy).toBe(1);
  });
});

describe('api: watch', () => {
  it('effect', async () => {
    const state = reactive({ count: 0 });
    let dummy;
    watchEffect(() => {
      dummy = state.count;
    });
    expect(dummy).toBe(0);

    state.count++;
    await nextTick();
    expect(dummy).toBe(1);
  });

  it('watching single source: getter', async () => {
    const state = reactive({ count: 0 });
    let dummy;
    watch(
      () => state.count,
      (count, prevCount) => {
        dummy = [count, prevCount];
        // assert types
        void (count + 1);
        if (prevCount) {
          void (prevCount + 1);
        }
      },
    );
    state.count++;
    await nextTick();
    expect(dummy).toMatchObject([1, 0]);
  });

  it('watching single source: ref', async () => {
    const count = ref(0);
    let dummy;
    watch(count, (count, prevCount) => {
      dummy = [count, prevCount];
      // assert types
      void (count + 1);
      if (prevCount) {
        void (prevCount + 1);
      }
    });
    count.value++;
    await nextTick();
    expect(dummy).toMatchObject([1, 0]);
  });

  it('watching single source: array', async () => {
    const array = reactive([] as number[]);
    const spy = vi.fn();
    watch(array, spy);
    array.push(1);
    await nextTick();
    expect(spy).toBeCalledTimes(1);
    expect(spy).toBeCalledWith([1], [1], expect.anything());
  });

  it('should not call functions inside a reactive source array', () => {
    const spy1 = vi.fn();
    const array = reactive([spy1]);
    const spy2 = vi.fn();
    watch(array, spy2, { immediate: true });
    expect(spy1).toBeCalledTimes(0);
    expect(spy2).toBeCalledWith([spy1], undefined, expect.anything());
  });

  it('should not unwrap refs in a reactive source array', async () => {
    const val = ref({ foo: 1 });
    const array = reactive([val]);
    const spy = vi.fn();
    watch(array, spy, { immediate: true });
    expect(spy).toBeCalledTimes(1);
    expect(spy).toBeCalledWith([val], undefined, expect.anything());

    // deep by default
    val.value.foo++;
    await nextTick();
    expect(spy).toBeCalledTimes(2);
    expect(spy).toBeCalledWith([val], [val], expect.anything());
  });

  it('should not fire if watched getter result did not change', async () => {
    const spy = vi.fn();
    const n = ref(0);
    watch(() => n.value % 2, spy);

    n.value++;
    await nextTick();
    expect(spy).toBeCalledTimes(1);

    n.value += 2;
    await nextTick();
    // should not be called again because getter result did not change
    expect(spy).toBeCalledTimes(1);
  });

  it('watching single source: computed ref', async () => {
    const count = ref(0);
    const plus = computed(() => count.value + 1);
    let dummy;
    watch(plus, (count, prevCount) => {
      dummy = [count, prevCount];
      // assert types
      void (count + 1);
      if (prevCount) {
        void (prevCount + 1);
      }
    });
    count.value++;
    await nextTick();
    expect(dummy).toMatchObject([2, 1]);
  });

  it('watching primitive with deep: true', async () => {
    const count = ref(0);
    let dummy;
    watch(
      count,
      (c, prevCount) => {
        dummy = [c, prevCount];
      },
      {
        deep: true,
      },
    );
    count.value++;
    await nextTick();
    expect(dummy).toMatchObject([1, 0]);
  });

  it('directly watching reactive object (with automatic deep: true)', async () => {
    const src = reactive({
      count: 0,
    });
    let dummy;
    watch(src, ({ count }) => {
      dummy = count;
    });
    src.count++;
    await nextTick();
    expect(dummy).toBe(1);
  });

  it('directly watching reactive object with explicit deep: false', async () => {
    const src = reactive({
      state: {
        count: 0,
      },
    });
    let dummy;
    watch(
      src,
      ({ state }) => {
        dummy = state?.count;
      },
      {
        deep: false,
      },
    );

    // nested should not trigger
    src.state.count++;
    await nextTick();
    expect(dummy).toBe(undefined);

    // root level should trigger
    src.state = { count: 1 };
    await nextTick();
    expect(dummy).toBe(1);
  });

  it('directly watching reactive array with explicit deep: false', async () => {
    const val = ref(1);
    const array: any[] = reactive([val]);
    const spy = vi.fn();
    watch(array, spy, { immediate: true, deep: false });
    expect(spy).toBeCalledTimes(1);
    expect(spy).toBeCalledWith([val], undefined, expect.anything());

    val.value++;
    await nextTick();
    expect(spy).toBeCalledTimes(1);

    array[1] = 2;
    await nextTick();
    expect(spy).toBeCalledTimes(2);
    expect(spy).toBeCalledWith([val, 2], [val, 2], expect.anything());
  });

  // #9916
  it('watching shallow reactive array with deep: false', async () => {
    class foo {
      prop1: ShallowRef<string> = shallowRef('');
      prop2: string = '';
    }

    const obj1 = new foo();
    const obj2 = new foo();

    const collection = shallowReactive([obj1, obj2]);
    const cb = vi.fn();
    watch(collection, cb, { deep: false });

    collection[0].prop1.value = 'foo';
    await nextTick();
    // should not trigger
    expect(cb).toBeCalledTimes(0);

    collection.push(new foo());
    await nextTick();
    // should trigger on array self mutation
    expect(cb).toBeCalledTimes(1);
  });

  it('should still respect deep: true on shallowReactive source', async () => {
    const obj = reactive({ a: 1 });
    const arr = shallowReactive([obj]);

    let dummy;
    watch(
      arr,
      () => {
        dummy = arr[0].a;
      },
      { deep: true },
    );

    obj.a++;
    await nextTick();
    expect(dummy).toBe(2);
  });

  it('watching multiple sources', async () => {
    const state = reactive({ count: 1 });
    const count = ref(1);
    const plus = computed(() => count.value + 1);

    let dummy;
    watch([() => state.count, count, plus], (vals, oldVals) => {
      dummy = [vals, oldVals];
      // assert types
      vals.concat(1);
      oldVals.concat(1);
    });

    state.count++;
    count.value++;
    await nextTick();
    expect(dummy).toMatchObject([
      [2, 2, 3],
      [1, 1, 2],
    ]);
  });

  it('watching multiple sources: undefined initial values and immediate: true', async () => {
    const a = ref();
    const b = ref();
    let called = false;
    watch(
      [a, b],
      ([newA, newB], [oldA, oldB]) => {
        called = true;
        expect([newA, newB]).toMatchObject([undefined, undefined]);
        expect([oldA, oldB]).toMatchObject([undefined, undefined]);
      },
      { immediate: true },
    );
    await nextTick();
    expect(called).toBe(true);
  });

  it('watching empty multiple sources with immediate: true', () => {
    const spy = vi.fn();
    watch([], spy, { immediate: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith([], [], expect.any(Function));
  });

  it('watching multiple sources: readonly array', async () => {
    const state = reactive({ count: 1 });
    const status = ref(false);

    let dummy;
    watch([() => state.count, status] as const, (vals, oldVals) => {
      dummy = [vals, oldVals];
      const [count] = vals;
      const [, oldStatus] = oldVals;
      // assert types
      void (count + 1);
      void (oldStatus === true);
    });

    state.count++;
    status.value = true;
    await nextTick();
    expect(dummy).toMatchObject([
      [2, true],
      [1, false],
    ]);
  });

  it('watching multiple sources: reactive object (with automatic deep: true)', async () => {
    const src = reactive({ count: 0 });
    let dummy;
    watch([src], ([state]) => {
      dummy = state;
      // assert types
      void (state.count === 1);
    });
    src.count++;
    await nextTick();
    expect(dummy).toMatchObject({ count: 1 });
  });

  it('warn invalid watch source', () => {
    // @ts-expect-error -- a number is not a watch source
    watch(1, () => {});
    expect(warned()).toEqual([vibeError('VIBE5007', { type: 'Number' }).message]);
  });

  it('warn invalid watch source: multiple sources', () => {
    watch([1], () => {});
    expect(warned()).toEqual([vibeError('VIBE5007', { type: 'Number' }).message]);
  });

  it('stopping the watcher (effect)', async () => {
    const state = reactive({ count: 0 });
    let dummy;
    const stop = watchEffect(() => {
      dummy = state.count;
    });
    expect(dummy).toBe(0);

    stop();
    state.count++;
    await nextTick();
    // should not update
    expect(dummy).toBe(0);
  });

  it('stopping the watcher (with source)', async () => {
    const state = reactive({ count: 0 });
    let dummy;
    const stop = watch(
      () => state.count,
      (count) => {
        dummy = count;
      },
    );

    state.count++;
    await nextTick();
    expect(dummy).toBe(1);

    stop();
    state.count++;
    await nextTick();
    // should not update
    expect(dummy).toBe(1);
  });

  it('cleanup registration (effect)', async () => {
    const state = reactive({ count: 0 });
    const cleanup = vi.fn();
    let dummy;
    const stop = watchEffect((onCleanup) => {
      onCleanup(cleanup);
      dummy = state.count;
    });
    expect(dummy).toBe(0);

    state.count++;
    await nextTick();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(dummy).toBe(1);

    stop();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('cleanup registration (with source)', async () => {
    const count = ref(0);
    const cleanup = vi.fn();
    let dummy;
    const stop = watch(count, (count, prevCount, onCleanup) => {
      onCleanup(cleanup);
      dummy = count;
    });

    count.value++;
    await nextTick();
    expect(cleanup).toHaveBeenCalledTimes(0);
    expect(dummy).toBe(1);

    count.value++;
    await nextTick();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(dummy).toBe(2);

    stop();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('onWatcherCleanup', async () => {
    const count = ref(0);
    const cleanupEffect = vi.fn();
    const cleanupWatch = vi.fn();

    const stopEffect = watchEffect(() => {
      onWatcherCleanup(cleanupEffect);
      void count.value;
    });
    const stopWatch = watch(count, () => {
      onWatcherCleanup(cleanupWatch);
    });

    count.value++;
    await nextTick();
    expect(cleanupEffect).toHaveBeenCalledTimes(1);
    expect(cleanupWatch).toHaveBeenCalledTimes(0);

    count.value++;
    await nextTick();
    expect(cleanupEffect).toHaveBeenCalledTimes(2);
    expect(cleanupWatch).toHaveBeenCalledTimes(1);

    stopEffect();
    expect(cleanupEffect).toHaveBeenCalledTimes(3);
    stopWatch();
    expect(cleanupWatch).toHaveBeenCalledTimes(2);
  });

  it('deep', async () => {
    const state = reactive({
      nested: {
        count: ref(0),
      },
      array: [1, 2, 3],
      map: new Map([
        ['a', 1],
        ['b', 2],
      ]),
      set: new Set([1, 2, 3]),
    });

    let dummy;
    watch(
      () => state,
      (state) => {
        dummy = [state.nested.count, state.array[0], state.map.get('a'), state.set.has(1)];
      },
      { deep: true },
    );

    state.nested.count++;
    await nextTick();
    expect(dummy).toEqual([1, 1, 1, true]);

    // nested array mutation
    state.array[0] = 2;
    await nextTick();
    expect(dummy).toEqual([1, 2, 1, true]);

    // nested map mutation
    state.map.set('a', 2);
    await nextTick();
    expect(dummy).toEqual([1, 2, 2, true]);

    // nested set mutation
    state.set.delete(1);
    await nextTick();
    expect(dummy).toEqual([1, 2, 2, false]);
  });

  it('watching deep ref', async () => {
    const count = ref(0);
    const double = computed(() => count.value * 2);
    const state = reactive([count, double]);

    let dummy;
    watch(
      () => state,
      (state) => {
        dummy = [state[0].value, state[1].value];
      },
      { deep: true },
    );

    count.value++;
    await nextTick();
    expect(dummy).toEqual([1, 2]);
  });

  it('deep with symbols', async () => {
    const symbol1 = Symbol();
    const symbol2 = Symbol();
    const symbol3 = Symbol();
    const symbol4 = Symbol();

    const raw: any = {
      [symbol1]: {
        [symbol2]: 1,
      },
    };

    Object.defineProperty(raw, symbol3, {
      writable: true,
      enumerable: false,
      value: 1,
    });

    const state = reactive(raw);
    const spy = vi.fn();

    watch(() => state, spy, { deep: true });

    await nextTick();
    expect(spy).toHaveBeenCalledTimes(0);

    state[symbol1][symbol2] = 2;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);

    // Non-enumerable properties don't trigger deep watchers
    state[symbol3] = 3;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);

    // Adding a new symbol property
    state[symbol4] = 1;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(2);

    // Removing a symbol property
    delete state[symbol4];
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('immediate', async () => {
    const count = ref(0);
    const cb = vi.fn();
    watch(count, cb, { immediate: true });
    expect(cb).toHaveBeenCalledTimes(1);
    count.value++;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('immediate: triggers when initial value is null', async () => {
    const state = ref(null);
    const spy = vi.fn();
    watch(() => state.value, spy, { immediate: true });
    expect(spy).toHaveBeenCalled();
  });

  it('immediate: triggers when initial value is undefined', async () => {
    const state = ref();
    const spy = vi.fn();
    watch(() => state.value, spy, { immediate: true });
    expect(spy).toHaveBeenCalledWith(undefined, undefined, expect.any(Function));
    state.value = 3;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(2);
    // testing if undefined can trigger the watcher
    state.value = undefined;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(3);
    // it shouldn't trigger if the same value is set
    state.value = undefined;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('should work sync', () => {
    const v = ref(1);
    let calls = 0;

    watch(
      v,
      () => {
        ++calls;
      },
      {
        flush: 'sync',
      },
    );

    expect(calls).toBe(0);
    v.value++;
    expect(calls).toBe(1);
  });

  test('should force trigger on triggerRef when watching a shallow ref', async () => {
    const v = shallowRef({ a: 1 });
    let sideEffect = 0;
    watch(v, (obj) => {
      sideEffect = obj.a;
    });

    // oxlint-disable-next-line no-self-assign -- ported as upstream wrote it
    v.value = v.value;
    await nextTick();
    // should not trigger
    expect(sideEffect).toBe(0);

    v.value.a++;
    await nextTick();
    // should not trigger
    expect(sideEffect).toBe(0);

    triggerRef(v);
    await nextTick();
    // should trigger now
    expect(sideEffect).toBe(2);
  });

  test('should force trigger on triggerRef when watching multiple sources: shallow ref array', async () => {
    const v = shallowRef([] as any);
    const spy = vi.fn();
    watch([v], () => {
      spy();
    });

    v.value.push(1);
    triggerRef(v);

    await nextTick();
    // should trigger now
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('should force trigger on triggerRef with toRef from reactive', async () => {
    const foo = reactive({ bar: 1 });
    const bar = toRef(foo, 'bar');
    const spy = vi.fn();

    watchEffect(() => {
      void bar.value;
      spy();
    });

    expect(spy).toHaveBeenCalledTimes(1);

    triggerRef(bar);

    await nextTick();
    // should trigger now
    expect(spy).toHaveBeenCalledTimes(2);
  });

  // #2125
  test('watchEffect should not recursively trigger itself', async () => {
    const spy = vi.fn();
    const price = ref(10);
    const history = ref<number[]>([]);
    watchEffect(() => {
      history.value.push(price.value);
      spy();
    });
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // #2231
  test('computed refs should not trigger watch if value has no change', async () => {
    const spy = vi.fn();
    const source = ref(0);
    const price = computed(() => source.value === 0);
    watch(price, spy);
    source.value++;
    await nextTick();
    source.value++;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Upstream mounts a component; the getter is called with no arguments.
  test('should not leak `this.proxy` to setup()', () => {
    const source = vi.fn();
    watch(source, () => {});
    // should not have any arguments
    expect(source.mock.calls[0]).toMatchObject([]);
  });

  it('watching sources: ref<any[]>', async () => {
    const foo = ref([1]);
    const spy = vi.fn();
    watch(foo, () => {
      spy();
    });
    foo.value = foo.value.slice();
    await nextTick();
    expect(spy).toBeCalledTimes(1);
  });

  it('watching multiple sources: computed', async () => {
    let count = 0;
    const value = ref('1');
    const plus = computed(() => !!value.value);
    watch([plus], () => {
      count++;
    });
    value.value = '2';
    await nextTick();
    expect(plus.value).toBe(true);
    expect(count).toBe(0);
  });

  const options = [
    { name: 'only trigger once watch' },
    {
      deep: true,
      name: 'only trigger once watch with deep',
    },
    {
      flush: 'sync',
      name: 'only trigger once watch with flush: sync',
    },
    {
      flush: 'pre',
      name: 'only trigger once watch with flush: pre',
    },
    {
      immediate: true,
      name: 'only trigger once watch with immediate',
    },
  ] as const;
  test.each(options)('$name', async (option) => {
    const count = ref(0);
    const cb = vi.fn();

    watch(count, cb, { once: true, ...option });

    count.value++;
    await nextTick();

    expect(count.value).toBe(1);
    expect(cb).toHaveBeenCalledTimes(1);

    count.value++;
    await nextTick();

    expect(count.value).toBe(2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // #5151
  test('OnCleanup also needs to be cleaned，', async () => {
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    const num = ref(0);

    watch(num, (value, oldValue, onCleanup) => {
      if (value > 1) {
        return;
      }
      spy1();
      onCleanup(() => {
        // OnCleanup also needs to be cleaned
        spy2();
      });
    });

    num.value++;
    await nextTick();
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(0);

    num.value++;
    await nextTick();

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);

    num.value++;
    await nextTick();
    // would not be called when value>1
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });

  it('watching reactive depth', async () => {
    const state = reactive({
      a: {
        b: {
          c: {
            d: {
              e: 1,
            },
          },
        },
      },
    });

    const cb = vi.fn();

    watch(state, cb, { deep: 2 });

    state.a.b = { c: { d: { e: 2 } } };
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);

    state.a.b.c = { d: { e: 3 } };

    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);

    state.a.b = { c: { d: { e: 4 } } };

    await nextTick();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('watching ref depth', async () => {
    const state = ref({
      a: {
        b: 2,
      },
    });

    const cb = vi.fn();

    watch(state, cb, { deep: 1 });

    state.value.a.b = 3;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(0);

    state.value.a = { b: 3 };
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('watching array depth', async () => {
    const arr = ref([
      {
        a: {
          b: 2,
        },
      },
      {
        a: {
          b: 3,
        },
      },
    ]);
    const cb = vi.fn();
    watch(arr, cb, { deep: 2 });

    arr.value[0].a.b = 3;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(0);

    arr.value[0].a = { b: 3 };
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);

    arr.value[1].a = { b: 4 };
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(2);

    arr.value.push({ a: { b: 5 } });
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(3);

    arr.value.pop();
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(4);
  });

  test('watching the same object at different depths', async () => {
    const arr1: any[] = reactive([[[{ foo: {} }]]]);
    const arr2 = arr1[0];
    const arr3 = arr2[0];
    const obj = arr3[0];
    arr1.push(arr3);

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();
    const cb4 = vi.fn();
    watch(arr1, cb1, { deep: 1 });
    watch(arr1, cb2, { deep: 2 });
    watch(arr1, cb3, { deep: 3 });
    watch(arr1, cb4, { deep: 4 });

    await nextTick();
    expect(cb1).toHaveBeenCalledTimes(0);
    expect(cb2).toHaveBeenCalledTimes(0);
    expect(cb3).toHaveBeenCalledTimes(0);
    expect(cb4).toHaveBeenCalledTimes(0);

    obj.foo = {};
    await nextTick();
    expect(cb1).toHaveBeenCalledTimes(0);
    expect(cb2).toHaveBeenCalledTimes(0);
    expect(cb3).toHaveBeenCalledTimes(1);
    expect(cb4).toHaveBeenCalledTimes(1);

    obj.foo.bar = 1;
    await nextTick();
    expect(cb1).toHaveBeenCalledTimes(0);
    expect(cb2).toHaveBeenCalledTimes(0);
    expect(cb3).toHaveBeenCalledTimes(1);
    expect(cb4).toHaveBeenCalledTimes(2);

    arr3.push(obj.foo);
    await nextTick();
    expect(cb1).toHaveBeenCalledTimes(0);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(2);
    expect(cb4).toHaveBeenCalledTimes(3);

    obj.foo.bar = 2;
    await nextTick();
    expect(cb1).toHaveBeenCalledTimes(0);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(3);
    expect(cb4).toHaveBeenCalledTimes(4);
  });

  test('pause / resume', async () => {
    const count = ref(0);
    const cb = vi.fn();
    const { pause, resume } = watch(count, cb);

    count.value++;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(1, 0, expect.any(Function));

    pause();
    count.value++;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(1, 0, expect.any(Function));

    resume();
    count.value++;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(3, 1, expect.any(Function));

    count.value++;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb).toHaveBeenLastCalledWith(4, 3, expect.any(Function));

    pause();
    count.value++;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb).toHaveBeenLastCalledWith(4, 3, expect.any(Function));

    resume();
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(4);
    expect(cb).toHaveBeenLastCalledWith(5, 4, expect.any(Function));
  });

  it('shallowReactive', async () => {
    const state = shallowReactive({
      msg: ref('hello'),
      foo: {
        a: ref(1),
        b: 2,
      },
      bar: 'bar',
    });

    const spy = vi.fn();

    watch(state, spy);

    state.msg.value = 'hi';
    await nextTick();
    expect(spy).not.toHaveBeenCalled();

    state.bar = 'bar2';
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);

    state.foo.a.value++;
    state.foo.b++;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);

    state.bar = 'bar3';
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('watching reactive with deep: false', async () => {
    const state = reactive({
      foo: {
        a: 2,
      },
      bar: 'bar',
    });

    const spy = vi.fn();

    watch(state, spy, { deep: false });

    state.foo.a++;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(0);

    state.bar = 'bar2';
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Upstream also checks a component's scope, which moves to RR-5.
  test("effect should be removed from scope's effects after it is stopped", () => {
    const num = ref(0);
    let unwatch!: () => void;

    const scope = effectScope();
    scope.run(() => {
      unwatch = watch(num, () => {});
    });
    expect(impl(scope).effects.length).toBe(1);
    unwatch();
    expect(impl(scope).effects.length).toBe(0);

    scope.run(() => {
      watch(num, () => {}, { once: true, immediate: true });
    });
    expect(impl(scope).effects.length).toBe(0);
  });

  // simplified case of VueUse syncRef
  test('sync watcher should not be batched', () => {
    const a = ref(0);
    const b = ref(0);
    let pauseB = false;
    watch(
      a,
      () => {
        pauseB = true;
        b.value = a.value + 1;
        pauseB = false;
      },
      { flush: 'sync' },
    );
    watch(
      b,
      () => {
        if (!pauseB) {
          throw new Error('should not be called');
        }
      },
      { flush: 'sync' },
    );

    a.value = 1;
    expect(b.value).toBe(2);
    expect(reported()).toEqual([]);
  });

  test('watchEffect should not fire on computed deps that did not change', async () => {
    const a = ref(0);
    const c = computed(() => a.value % 2);
    const spy = vi.fn();
    watchEffect(() => {
      spy();
      void c.value;
    });
    expect(spy).toHaveBeenCalledTimes(1);
    a.value += 2;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('circular reference', async () => {
    const obj = { a: 1 };
    // @ts-expect-error -- ported as upstream wrote it
    obj.b = obj;
    const foo = ref(obj);
    const spy = vi.fn();

    watch(foo, spy, { deep: true });

    // @ts-expect-error -- ported as upstream wrote it
    foo.value.b.a = 2;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(foo.value.a).toBe(2);
  });

  test('should be executed correctly', () => {
    const v = ref(1);
    let foo = '';

    watch(
      v,
      () => {
        foo += '1';
      },
      {
        flush: 'sync',
      },
    );
    watch(
      v,
      () => {
        foo += '2';
      },
      {
        flush: 'sync',
      },
    );

    expect(foo).toBe('');
    v.value++;
    expect(foo).toBe('12');
  });

  // 12045
  test('sync watcher should not break pre watchers', async () => {
    const count1 = ref(0);
    const count2 = ref(0);

    watch(
      count1,
      () => {
        count2.value++;
      },
      { flush: 'sync' },
    );

    const spy1 = vi.fn();
    watch([count1, count2], spy1);

    const spy2 = vi.fn();
    watch(count1, spy2);

    count1.value++;

    await nextTick();
    expect(spy1).toHaveBeenCalled();
    expect(spy2).toHaveBeenCalled();
  });
});

describe('sources', () => {
  test('an array of a ref, a computed ref, a getter and a reactive object', async () => {
    const a = ref(1);
    const b = computed(() => a.value * 10);
    const c = ref('c');
    const d = reactive({ nested: { n: 0 } });
    const cb = vi.fn();
    watch([a, b, () => c.value, d], cb);

    a.value = 2;
    await nextTick();
    expect(cb).toHaveBeenLastCalledWith([2, 20, 'c', d], [1, 10, 'c', d], expect.any(Function));

    // A reactive object in the array is deep too.
    d.nested.n++;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  test('deep: 0 on a reactive object reacts to its first level only', async () => {
    const state = reactive({ nested: { n: 0 }, top: 0 });
    const cb = vi.fn();
    watch(state, cb, { deep: 0 });

    state.nested.n++;
    await nextTick();
    expect(cb).not.toHaveBeenCalled();

    state.top++;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('deep traversal skips markRaw() values and reads through readonly proxies', async () => {
    const raw = markRaw({ n: 0 });
    // A date is neither a collection nor a plain object: its fields are not read.
    const state = reactive({ raw, list: [{ n: 0 }], date: new Date(0) });
    const view = readonly(state);
    const cb = vi.fn();
    watch(() => view, cb, { deep: true });

    state.raw.n++;
    await nextTick();
    expect(cb).not.toHaveBeenCalled();

    state.list[0].n++;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('an invalid source warns VIBE5007 in dev and never fires', async () => {
    const plain = { count: 0 };
    const cb = vi.fn();
    // A plain object is not reactive: nothing tracks it.
    watch(plain, cb);
    plain.count++;
    await nextTick();
    expect(cb).not.toHaveBeenCalled();
    expect(warned()).toEqual([vibeError('VIBE5007', { type: 'Object' }).message]);
  });

  test('an invalid source does not warn in prod', () => {
    vi.stubGlobal('__DEV__', false);
    // @ts-expect-error -- null is not a watch source
    watch(null, () => {});
    expect(warned()).toEqual([]);
  });
});

describe('timing', () => {
  test('the getter of watch, the first effect run and an immediate callback are synchronous', () => {
    const calls: string[] = [];
    const n = ref(0);
    watch(
      () => {
        calls.push('getter');
        return n.value;
      },
      () => calls.push('callback'),
    );
    watch(n, () => calls.push('immediate'), { immediate: true });
    watchEffect(() => calls.push('effect'));
    watchSyncEffect(() => calls.push('sync effect'));
    watchPostEffect(() => calls.push('post effect'));
    expect(calls).toEqual(['getter', 'immediate', 'effect', 'sync effect']);
  });

  test('the first run of watchPostEffect waits for the post queue', async () => {
    const calls: string[] = [];
    const n = ref(0);
    watchPostEffect(() => calls.push(`post ${n.value}`));
    expect(calls).toEqual([]);
    await nextTick();
    expect(calls).toEqual(['post 0']);
  });

  test("on a change, 'sync' runs inside the write, 'pre' before 'post' in the same flush", async () => {
    const calls: string[] = [];
    const n = ref(0);
    watch(n, () => calls.push('post'), { flush: 'post' });
    watch(n, () => calls.push('pre'));
    watch(n, () => calls.push('sync'), { flush: 'sync' });
    n.value++;
    calls.push('after write');
    expect(calls).toEqual(['sync', 'after write']);
    await nextTick();
    expect(calls).toEqual(['sync', 'after write', 'pre', 'post']);
  });
});

describe('handle and ownership', () => {
  test('the handle is callable and has stop, pause and resume', async () => {
    const n = ref(0);
    const cb = vi.fn();
    const handle = watch(n, cb);
    expect(handle).toBeTypeOf('function');
    expect(handle.stop).toBe(handle);

    handle.pause();
    n.value++;
    n.value++;
    n.value++;
    await nextTick();
    expect(cb).not.toHaveBeenCalled();
    // Triggered three times while paused: one run on resume.
    handle.resume();
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(3, 0, expect.any(Function));

    handle();
    n.value++;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
    // Stopping again changes nothing.
    handle.stop();
  });

  test('a paused watcher does not run on resume when the value came back', async () => {
    const n = ref(0);
    const cb = vi.fn();
    const { pause, resume } = watch(n, cb);
    pause();
    n.value = 1;
    n.value = 0;
    resume();
    await nextTick();
    expect(cb).not.toHaveBeenCalled();
  });

  test('watchers stop and pause with their effect scope', async () => {
    const n = ref(0);
    const cb = vi.fn();
    const effectSpy = vi.fn();
    const scope = effectScope();
    scope.run(() => {
      watch(n, cb);
      watchEffect(() => effectSpy(n.value));
    });

    scope.pause();
    n.value++;
    await nextTick();
    expect(cb).not.toHaveBeenCalled();
    scope.resume();
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(effectSpy).toHaveBeenCalledTimes(2);

    scope.stop();
    n.value++;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(effectSpy).toHaveBeenCalledTimes(2);
  });

  test('stopping a watcher after its scope stopped leaves the scope as it is', () => {
    const scope = effectScope();
    const handle = scope.run(() => watch(ref(0), () => {}))!;
    scope.stop();
    handle();
    expect(impl(scope).effects).toEqual([]);
  });

  test("a watcher created in another watcher's callback belongs to the active scope", () => {
    const outer = ref(0);
    const inner = ref(0);
    const innerCb = vi.fn();
    const scope = effectScope();
    scope.run(() => {
      watch(outer, () => watch(inner, innerCb, { flush: 'sync' }), { flush: 'sync' });
    });

    scope.run(() => outer.value++);
    scope.run(() => outer.value++);
    // The watcher of the first callback run survives the second run.
    inner.value++;
    expect(innerCb).toHaveBeenCalledTimes(2);

    scope.stop();
    inner.value++;
    expect(innerCb).toHaveBeenCalledTimes(2);
  });
});

describe('disposal', () => {
  test('a watcher stopped after being triggered and before the flush never runs', async () => {
    const n = ref(0);
    const pre = vi.fn();
    const post = vi.fn();
    const stopPre = watch(n, pre);
    const stopPost = watch(n, post, { flush: 'post' });
    n.value++;
    stopPre();
    stopPost();
    await nextTick();
    expect(pre).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  test('a watcher whose scope stops after a trigger and before the flush never runs', async () => {
    const n = ref(0);
    const cb = vi.fn();
    const scope = effectScope();
    scope.run(() => watch(n, cb));
    n.value++;
    scope.stop();
    await nextTick();
    expect(cb).not.toHaveBeenCalled();
  });

  test('a watchPostEffect stopped before its first run never runs', async () => {
    const spy = vi.fn();
    const stop = watchPostEffect(spy);
    stop();
    await nextTick();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('onWatcherCleanup', () => {
  test('outside a watcher, it warns VIBE5006 naming onWatcherCleanup in dev', () => {
    onWatcherCleanup(() => {});
    expect(warned()).toEqual([vibeError('VIBE5006', { api: 'onWatcherCleanup' }).message]);
  });

  test('outside a watcher, it is silent with failSilently and in prod', () => {
    onWatcherCleanup(() => {}, true);
    vi.stubGlobal('__DEV__', false);
    onWatcherCleanup(() => {});
    expect(warned()).toEqual([]);
  });

  test('inside a watcher getter, it is outside the watcher', () => {
    const n = ref(0);
    watch(
      () => {
        onWatcherCleanup(() => {});
        return n.value;
      },
      () => {},
    );
    expect(warned()).toEqual([vibeError('VIBE5006', { api: 'onWatcherCleanup' }).message]);
  });
});
