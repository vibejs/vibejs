// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages-private/dts-test/watch.test-d.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Edits: the ported cases follow the vibe.js cases; `expectType` became `expectTypeOf`. Dropped,
// not in vibe.js: `this.$watch` (#6135) and the `defineModel` cases (a compiler macro).
import { expectTypeOf } from 'vitest';
import { computed, type ComputedRef } from '../reactivity/computed.ts';
import { reactive } from '../reactivity/reactive.ts';
import { ref, shallowRef, type MaybeRef, type Ref } from '../reactivity/ref.ts';
import { nextTick } from './scheduler.ts';
import { watch, watchEffect, type WatchHandle, type WatchStopHandle } from './watch.ts';

const count = ref(0);
const label = computed(() => 'a');

// One source: the value type, and `undefined` added to the old value by `immediate: true`.
watch(count, (value, oldValue, onCleanup) => {
  expectTypeOf(value).toEqualTypeOf<number>();
  expectTypeOf(oldValue).toEqualTypeOf<number>();
  expectTypeOf(onCleanup).toEqualTypeOf<(cleanupFn: () => void) => void>();
});
watch(
  () => count.value > 0,
  (value, oldValue) => {
    expectTypeOf(value).toEqualTypeOf<boolean>();
    expectTypeOf(oldValue).toEqualTypeOf<boolean | undefined>();
  },
  { immediate: true },
);
watch(label, (value) => {
  expectTypeOf(value).toEqualTypeOf<string>();
});

// A tuple of sources maps each source to its value.
watch([count, label, () => true], (values, oldValues) => {
  expectTypeOf(values).toEqualTypeOf<[number, string, boolean]>();
  expectTypeOf(oldValues).toEqualTypeOf<[number, string, boolean]>();
});
watch(
  [count, label] as const,
  (values, oldValues) => {
    expectTypeOf(values[0]).toEqualTypeOf<number>();
    expectTypeOf(values[1]).toEqualTypeOf<string>();
    expectTypeOf(oldValues[0]).toEqualTypeOf<number | undefined>();
    expectTypeOf(oldValues[1]).toEqualTypeOf<string | undefined>();
  },
  { immediate: true },
);

// A reactive array or object passes through as the value.
const list = reactive([1, 2]);
watch(list, (value, oldValue) => {
  expectTypeOf(value).toEqualTypeOf(list);
  expectTypeOf(oldValue).toEqualTypeOf(list);
});
const state = reactive({ n: ref(1) });
watch(state, (value) => {
  expectTypeOf(value).toEqualTypeOf<{ n: number }>();
});

// The handle is callable and is a stop handle.
const handle = watchEffect(() => {});
expectTypeOf(handle).toEqualTypeOf<WatchHandle>();
expectTypeOf(handle).toExtend<WatchStopHandle>();
expectTypeOf(handle).returns.toBeVoid();
expectTypeOf(handle.pause).toEqualTypeOf<() => void>();

// nextTick() resolves to the awaited result of its callback.
expectTypeOf(nextTick()).toEqualTypeOf<Promise<void>>();
expectTypeOf(nextTick(() => 1)).toEqualTypeOf<Promise<number>>();
expectTypeOf(nextTick(async () => 'a')).toEqualTypeOf<Promise<string>>();

// Invalid sources (VIBE5007 at runtime) fail to type-check.
// @ts-expect-error a primitive is not a watch source
watch(1, () => {});
// @ts-expect-error a string is not a watch source
watch('count', () => {});
// @ts-expect-error undefined is not a watch source
watch(undefined, () => {});
// @ts-expect-error the value of a ref is not a watch source
watch(count.value, () => {});

// Ported cases.
const source = ref('foo');
const source2 = computed(() => source.value);
const source3 = (): number => 1;
type Bar = Ref<string> | ComputedRef<string> | (() => number);
type Foo = readonly [Ref<string>, ComputedRef<string>, () => number];
const readonlyArr: Foo = [source, source2, source3];

// a reactive array passes through
watch(reactive([source, source2, source3]), (value, oldValues) => {
  expectTypeOf(value).toExtend<Bar[]>();
  expectTypeOf(oldValues).toExtend<Bar[]>();
});
watch(
  reactive([source, source2, source3]),
  (value, oldValues) => {
    expectTypeOf(value).toExtend<Bar[]>();
    expectTypeOf(oldValues).toExtend<Bar[] | undefined>();
  },
  { immediate: true },
);
// a reactive readonly tuple
watch(reactive([source, source2, source3] as const), (value, oldValues) => {
  expectTypeOf(value).toExtend<Foo>();
  expectTypeOf(oldValues).toExtend<Foo>();
});
// a readonly array
watch(readonlyArr, (values, oldValues) => {
  expectTypeOf(values).toExtend<Readonly<[string, string, number]>>();
  expectTypeOf(oldValues).toExtend<Readonly<[string, string, number]>>();
});
watch(
  readonlyArr,
  (values, oldValues) => {
    expectTypeOf(values).toExtend<Readonly<[string, string, number]>>();
    expectTypeOf(oldValues).toExtend<
      Readonly<[string | undefined, string | undefined, number | undefined]>
    >();
  },
  { immediate: true },
);
watch(
  [source, source2, source3],
  (values, oldValues) => {
    expectTypeOf(values).toEqualTypeOf<[string, string, number]>();
    expectTypeOf(oldValues).toEqualTypeOf<
      [string | undefined, string | undefined, number | undefined]
    >();
  },
  { immediate: true },
);

// no type error, case from vueuse
// oxlint-disable-next-line typescript/no-explicit-any -- upstream case: an `any` source
declare const aAny: any;
watch(aAny, () => {});
watch(aAny, () => {}, { immediate: true });

// the callback receives the unwrapped value of a nested ref
watch(ref({ foo: ref(1) }), (v, ov) => {
  expectTypeOf(v).toEqualTypeOf<{ foo: number }>();
  expectTypeOf(ov).toEqualTypeOf<{ foo: number }>();
});
watch([ref({ test: 'test' }), ref({ a: 'b' })], (values) => {
  expectTypeOf(values[0].test).toEqualTypeOf<string>();
  expectTypeOf(values[1].a).toEqualTypeOf<string>();
});

// #7852: a union stays one value
type Steps = { step: '1' } | { step: '2' };
watch(shallowRef<Steps>({ step: '1' }), (value) => {
  expectTypeOf(value).toEqualTypeOf<Steps>();
});
watch(shallowRef({ step: '1' } as Steps), (value) => {
  expectTypeOf(value).toEqualTypeOf<Steps>();
});

// a ref of a MaybeRef
const css: MaybeRef<string> = '';
watch(ref(css), (value) => {
  expectTypeOf(value).toEqualTypeOf<string>();
});
