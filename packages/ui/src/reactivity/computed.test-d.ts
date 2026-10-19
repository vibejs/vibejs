// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages-private/dts-test/ref.test-d.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Edits: only the computed cases of the upstream file; `expectType` became `expectTypeOf`.
import { expectTypeOf } from 'vitest';
import { computed, type ComputedRef, type WritableComputedRef } from './computed.ts';
import { ref } from './ref.ts';

// computed() is readonly with a getter and writable with get/set.
const doubled = computed((old: number | undefined) => (old ?? 0) * 2);
expectTypeOf(doubled).toEqualTypeOf<ComputedRef<number>>();
// @ts-expect-error a getter-only computed is readonly
doubled.value = 1;
const label = computed<string, number>({ get: () => 'a', set: () => {} });
expectTypeOf(label).toEqualTypeOf<WritableComputedRef<string, number>>();
label.value = 1;
expectTypeOf(label.value).toEqualTypeOf<string>();
// @ts-expect-error the setter takes a number
label.value = 'a';

// The getter receives the previous value.
computed<number>((oldValue) => {
  expectTypeOf(oldValue).toEqualTypeOf<number | undefined>();
  return 1;
});

// Allow computed getter and setter types to be unrelated.
const obj = ref({ name: 'foo' });
const c = computed({
  get: () => JSON.stringify(obj.value),
  set(val: typeof obj.value) {
    obj.value = val;
  },
});
c.value = { name: 'bar' };
expectTypeOf(c.value).toEqualTypeOf<string>();

// A getter-only computed is not a WritableComputedRef; a writable one is a ComputedRef.
// @ts-expect-error a getter-only computed has no setter
const writableComputed: WritableComputedRef<string> = computed(() => '');
const immutableComputed: ComputedRef<string> = writableComputed;
expectTypeOf(immutableComputed).toEqualTypeOf<ComputedRef<string>>();
