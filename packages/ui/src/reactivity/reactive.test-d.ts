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
