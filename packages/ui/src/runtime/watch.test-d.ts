import { expectTypeOf } from 'vitest';
import { computed } from '../reactivity/computed.ts';
import { reactive } from '../reactivity/reactive.ts';
import { ref } from '../reactivity/ref.ts';
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
