import { expectTypeOf } from 'vitest';
import { computed, type ComputedRef, type WritableComputedRef } from './computed.ts';
import { ref, shallowRef, type Ref, type ShallowRef } from './ref.ts';

// C4: Ref<T, S> is the super-type of every ref.
expectTypeOf<ShallowRef<number>>().toExtend<Ref<number>>();
expectTypeOf<ComputedRef<number>>().toExtend<Ref<number>>();
expectTypeOf<WritableComputedRef<number>>().toExtend<Ref<number>>();
expectTypeOf<WritableComputedRef<number, string>>().toExtend<Ref<number, string>>();
// A ref is not a computed, and a plain object with a value is not a ref.
expectTypeOf<Ref<number>>().not.toExtend<ComputedRef<number>>();
expectTypeOf<{ value: number }>().not.toExtend<Ref<number>>();

// ref() unwraps nested refs in its type and accepts the raw or the unwrapped value.
expectTypeOf(ref(1)).toEqualTypeOf<Ref<number, number>>();
expectTypeOf(ref({ n: ref(1) })).toEqualTypeOf<
  Ref<{ n: number }, { n: number } | { n: Ref<number, number> }>
>();
expectTypeOf(ref().value).toBeAny();
expectTypeOf(ref<string>()).toEqualTypeOf<Ref<string | undefined>>();
const existing = ref(1);
expectTypeOf(ref(existing)).toEqualTypeOf(existing);

// shallowRef() keeps the value type as-is.
expectTypeOf(shallowRef({ n: ref(1) })).toEqualTypeOf<ShallowRef<{ n: Ref<number, number> }>>();
expectTypeOf(shallowRef<number>()).toEqualTypeOf<ShallowRef<number | undefined>>();
expectTypeOf(shallowRef(existing)).toEqualTypeOf(existing);

// computed() is readonly with a getter and writable with get/set.
const doubled = computed((old: number | undefined) => (old ?? 0) * 2);
expectTypeOf(doubled).toEqualTypeOf<ComputedRef<number>>();
// @ts-expect-error a getter-only computed is readonly
doubled.value = 1;
const label = computed<string, number>({ get: () => 'a', set: () => {} });
expectTypeOf(label).toEqualTypeOf<WritableComputedRef<string, number>>();
label.value = 1;
expectTypeOf(label.value).toEqualTypeOf<string>();
