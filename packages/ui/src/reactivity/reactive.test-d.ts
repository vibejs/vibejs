// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages-private/dts-test/reactivity.test-d.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Edits: the ported cases follow the vibe.js cases; `describe` blocks became comments and
// `expectType` became `expectTypeOf`.
import { expectTypeOf } from 'vitest';
import { isReactive, isReadonly, isShallow, toRaw } from './dep.ts';
import {
  isProxy,
  markRaw,
  reactive,
  readonly,
  shallowReactive,
  shallowReadonly,
  type DeepReadonly,
  type Raw,
  type Reactive,
  type ShallowReactive,
  type UnwrapNestedRefs,
} from './reactive.ts';
import { ref, type Ref, type UnwrapRef } from './ref.ts';

// Reactive<T> unwraps nested refs, but keeps refs inside arrays and collections.
const state = reactive({
  n: ref(1),
  deep: { s: ref('a') },
  list: [ref(1)],
  map: new Map([['k', ref(1)]]),
});
expectTypeOf(state.n).toEqualTypeOf<number>();
expectTypeOf(state.deep.s).toEqualTypeOf<string>();
expectTypeOf(state.list[0]).toEqualTypeOf<Ref<number, number>>();
expectTypeOf(state.map.get('k')).toEqualTypeOf<Ref<number, number> | undefined>();
expectTypeOf(reactive({ n: 1 })).toEqualTypeOf<Reactive<{ n: number }>>();
// A reactive array carries the marker; an object does not.
expectTypeOf<Reactive<number[]>>().not.toEqualTypeOf<number[]>();
expectTypeOf<Reactive<{ n: number }>>().toEqualTypeOf<{ n: number }>();

// UnwrapNestedRefs<T> keeps a ref itself.
expectTypeOf<UnwrapNestedRefs<Ref<number>>>().toEqualTypeOf<Ref<number>>();
expectTypeOf<UnwrapNestedRefs<{ r: Ref<number> }>>().toEqualTypeOf<{ r: number }>();

// Raw<T> and ShallowReactive<T> are not unwrapped when nested.
const raw = markRaw({ r: ref(1) });
expectTypeOf(raw).toEqualTypeOf<Raw<{ r: Ref<number, number> }>>();
expectTypeOf(reactive({ raw }).raw.r).toEqualTypeOf<Ref<number, number>>();
const shallow = shallowReactive({ r: ref(1) });
expectTypeOf(shallow).toEqualTypeOf<ShallowReactive<{ r: Ref<number, number> }>>();
expectTypeOf(shallow.r).toEqualTypeOf<Ref<number, number>>();
expectTypeOf(reactive({ shallow }).shallow.r).toEqualTypeOf<Ref<number, number>>();
expectTypeOf<UnwrapRef<{ shallow: typeof shallow }>>().toEqualTypeOf<{
  shallow: typeof shallow;
}>();

// readonly() returns DeepReadonly<UnwrapNestedRefs<T>>; shallowReadonly() returns Readonly<T>.
const frozen = readonly({ n: ref(1), deep: { list: [1] } });
expectTypeOf(frozen).toEqualTypeOf<
  DeepReadonly<UnwrapNestedRefs<{ n: Ref<number, number>; deep: { list: number[] } }>>
>();
expectTypeOf(frozen.n).toEqualTypeOf<number>();
expectTypeOf(frozen.deep.list).toEqualTypeOf<readonly number[]>();
// @ts-expect-error a deep readonly key cannot be written
frozen.deep.list = [];
expectTypeOf(readonly(new Map<string, { a: number }>())).toEqualTypeOf<
  ReadonlyMap<string, { readonly a: number }>
>();
const top = shallowReadonly({ n: 1, deep: { m: 1 } });
expectTypeOf(top).toEqualTypeOf<Readonly<{ n: number; deep: { m: number } }>>();
// @ts-expect-error a shallow readonly key cannot be written
top.n = 2;
top.deep.m = 2;

// The flag helpers take any value; toRaw() keeps the type.
expectTypeOf(isReactive).toEqualTypeOf<(value: unknown) => boolean>();
expectTypeOf(isReadonly).toEqualTypeOf<(value: unknown) => boolean>();
expectTypeOf(isShallow).toEqualTypeOf<(value: unknown) => boolean>();
expectTypeOf(isProxy).toEqualTypeOf<(value: unknown) => boolean>();
expectTypeOf(toRaw(state)).toEqualTypeOf(state);
// @ts-expect-error reactive() takes an object
reactive(1);

// Ported cases.
// DeepReadonly
const deep = readonly({ obj: { k: 'v' } });
// @ts-expect-error a readonly key cannot be written
deep.obj = { k: 'w' };
// @ts-expect-error a nested readonly key cannot be written
deep.obj.k = 'x';

// #4180: readonly ref
expectTypeOf(readonly(ref({ count: 1 }))).toExtend<Ref>();

// markRaw
class Test<T> {
  declare item: Ref<T>;
}
const test = new Test<number>();
const plain = { ref: ref(1) };
const marked = reactive({
  class: { raw: markRaw(test), reactive: test },
  plain: { raw: markRaw(plain), reactive: plain },
});
expectTypeOf(marked.class.raw).toExtend<Test<number>>();
// it should unwrap
expectTypeOf(marked.class.reactive).not.toExtend<Test<number>>();
expectTypeOf(marked.plain.raw.ref).toEqualTypeOf<Ref<number>>();
expectTypeOf(marked.plain.reactive.ref).toEqualTypeOf<number>();

// shallowReadonly ref unwrap
const shallowTop = shallowReadonly({ count: { n: ref(1) } });
// @ts-expect-error a shallow readonly key cannot be written
shallowTop.count = { n: ref(2) };
expectTypeOf(shallowTop.count.n).toEqualTypeOf<Ref<number>>();
shallowTop.count.n.value = 123;

// #3819: tuples keep their refs
expectTypeOf(reactive([ref(0)] as const)[0]).toEqualTypeOf<Ref<number>>();
const tuple: [Ref<number>] = [ref(0)];
expectTypeOf(reactive(tuple)[0]).toEqualTypeOf<Ref<number>>();

// Map and WeakMap values keep refs but unwrap refs nested in objects.
expectTypeOf(reactive(new Map<string, Ref<number>>()).get('a')!).toEqualTypeOf<Ref<number>>();
expectTypeOf(
  reactive(new Map<string, { wrap: Ref<number> }>()).get('a')!.wrap,
).toEqualTypeOf<number>();
expectTypeOf(reactive(new WeakMap<object, Ref<number>>()).get({})!).toEqualTypeOf<Ref<number>>();
expectTypeOf(
  reactive(new WeakMap<object, { wrap: Ref<number> }>()).get({})!.wrap,
).toEqualTypeOf<number>();
class ExtendedMap extends Map<string, { wrap: Ref<number> }> {
  foo = ref('foo');
  bar = 1;
}
const extendedMap = reactive(new ExtendedMap());
expectTypeOf(extendedMap.foo).toEqualTypeOf<string>();
expectTypeOf(extendedMap.bar).toEqualTypeOf<number>();
expectTypeOf(extendedMap.get('a')!.wrap).toEqualTypeOf<number>();

// Set and WeakSet
expectTypeOf(reactive(new Set<Ref<number>>())).toExtend<Set<Ref<number>>>();
expectTypeOf(reactive(new Set<{ wrap: Ref<number> }>())).toExtend<Set<{ wrap: number }>>();
expectTypeOf(reactive(new WeakSet<Ref<number>>())).toExtend<WeakSet<Ref<number>>>();
expectTypeOf(reactive(new WeakSet<{ wrap: Ref<number> }>())).toExtend<WeakSet<{ wrap: number }>>();
class ExtendedSet extends Set<{ wrap: Ref<number> }> {
  foo = ref('foo');
  bar = 1;
}
const extendedSet = reactive(new ExtendedSet());
expectTypeOf(extendedSet.foo).toEqualTypeOf<string>();
expectTypeOf(extendedSet.bar).toEqualTypeOf<number>();

// A reactive array is assignable to a record.
const arr = reactive(['']);
const record: Record<number, string> = arr;
expectTypeOf(record[0]).toEqualTypeOf<string>();
const indexed: { [key: number]: string } = arr;
expectTypeOf(indexed[0]).toEqualTypeOf<string>();

// The shallowReactive marker does not leak into value unions.
const shallowState = shallowReactive({ a: { title: 'A' }, b: { title: 'B' } });
declare const shallowValue: (typeof shallowState)[keyof typeof shallowState];
expectTypeOf(shallowValue.title).toEqualTypeOf<string>();
// A shallowReactive type accepts a plain object.
let shallowValues: typeof shallowState = shallowState;
shallowValues = { a: { title: 'C' }, b: { title: 'D' } };
expectTypeOf(shallowValues).toEqualTypeOf(shallowState);
