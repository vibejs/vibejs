// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages-private/dts-test/ref.test-d.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Edits: `expectType` became `expectTypeOf`; the computed cases moved to computed.test-d.ts and
// the useTemplateRef cases to runtime/templateRef.test-d.ts. Dropped, not exported: the
// `customRef` and `proxyRefs` cases.
import { expectTypeOf } from 'vitest';
import { computed, type ComputedRef, type WritableComputedRef } from './computed.ts';
import { isRef } from './dep.ts';
import { reactive, readonly, shallowReactive } from './reactive.ts';
import {
  ref,
  shallowRef,
  toRef,
  toRefs,
  toValue,
  unref,
  type MaybeRef,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
  type ToRefs,
} from './ref.ts';

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
// A class keeps its construct signature.
class Foo {
  x = 1;
}
expectTypeOf(ref({ C: Foo }).value.C).toEqualTypeOf<typeof Foo>();
const existing = ref(1);
expectTypeOf(ref(existing)).toEqualTypeOf(existing);

// shallowRef() keeps the value type as-is.
expectTypeOf(shallowRef({ n: ref(1) })).toEqualTypeOf<ShallowRef<{ n: Ref<number, number> }>>();
expectTypeOf(shallowRef<number>()).toEqualTypeOf<ShallowRef<number | undefined>>();
expectTypeOf(shallowRef(existing)).toEqualTypeOf(existing);

// Ported cases.
function plainType(arg: number | Ref<number>): void {
  // ref coercing
  expectTypeOf(ref(arg)).toEqualTypeOf<Ref<number>>();
  // isRef as type guard
  if (isRef(arg)) expectTypeOf(arg).toEqualTypeOf<Ref<number>>();
  // ref unwrapping
  expectTypeOf(unref(arg)).toEqualTypeOf<number>();
  expectTypeOf(toValue(arg)).toEqualTypeOf<number>();
  expectTypeOf(toValue(() => 123)).toEqualTypeOf<number>();
  // ref inner type should be unwrapped
  expectTypeOf(ref({ foo: ref(1) }).value).toEqualTypeOf<{ foo: number }>();
  // ref boolean and literal
  expectTypeOf(ref(false)).toEqualTypeOf<Ref<boolean>>();
  expectTypeOf(ref<true>(true).value).toEqualTypeOf<true>();
  // tuple
  expectTypeOf(unref(ref<[number, string]>([1, '1']))).toEqualTypeOf<[number, string]>();
  // with symbol
  interface IteratorFoo {
    [Symbol.iterator]: unknown;
  }
  expectTypeOf(ref<IteratorFoo | null | undefined>()).toEqualTypeOf<
    Ref<IteratorFoo | null | undefined>
  >();
  // should not unwrap ref inside arrays
  const arr = ref([1, new Map<string, unknown>(), ref('1')]).value;
  const value = arr[0];
  if (isRef(value)) expectTypeOf(value).toEqualTypeOf<Ref<string>>();
  else if (typeof value === 'number') expectTypeOf(value).toEqualTypeOf<number>();
  else expectTypeOf(value).toExtend<Map<string, unknown>>();
  // should still unwrap in objects nested in arrays
  expectTypeOf(ref([{ a: ref(1) }]).value[0].a).toEqualTypeOf<number>();
}
plainType(1);

function bailType(arg: HTMLElement | Ref<HTMLElement>): void {
  const coerced: Ref<HTMLElement> = ref(arg);
  expectTypeOf(coerced).not.toBeAny();
  if (isRef(arg)) expectTypeOf(arg).toEqualTypeOf<Ref<HTMLElement>>();
  expectTypeOf(unref(arg)).toEqualTypeOf<HTMLElement>();
  // an element is not unwrapped
  const nestedRef = ref({ foo: ref(document.createElement('DIV')) });
  const unwrapped: { foo: HTMLElement } = nestedRef.value;
  expectTypeOf(unwrapped).not.toBeAny();
}
bailType(document.createElement('DIV'));

// Symbol keys are not unwrapped.
const customSymbol = Symbol();
const symbols = ref({
  [Symbol.asyncIterator]: ref(1),
  [Symbol.hasInstance]: { a: ref('a') },
  [Symbol.iterator]: [ref(1)],
  [Symbol.match]: new Set<Ref<number>>(),
  [Symbol.matchAll]: new Map<number, Ref<string>>(),
  [Symbol.split]: new WeakSet<Ref<boolean>>(),
  [Symbol.toPrimitive]: new WeakMap<Ref<boolean>, string>(),
  [customSymbol]: { arr: [ref(1)] },
});
expectTypeOf(symbols.value[Symbol.asyncIterator]).toEqualTypeOf<Ref<number>>();
expectTypeOf(symbols.value[Symbol.hasInstance]).toEqualTypeOf<{ a: Ref<string> }>();
expectTypeOf(symbols.value[Symbol.iterator]).toEqualTypeOf<Ref<number>[]>();
expectTypeOf(symbols.value[Symbol.match]).toEqualTypeOf<Set<Ref<number>>>();
expectTypeOf(symbols.value[Symbol.matchAll]).toEqualTypeOf<Map<number, Ref<string>>>();
expectTypeOf(symbols.value[Symbol.split]).toEqualTypeOf<WeakSet<Ref<boolean>>>();
expectTypeOf(symbols.value[Symbol.toPrimitive]).toEqualTypeOf<WeakMap<Ref<boolean>, string>>();
expectTypeOf(symbols.value[customSymbol]).toEqualTypeOf<{ arr: Ref<number>[] }>();

// ref and shallowRef with a generic
function withGeneric<T extends { name: string }>(r: T): ShallowRef<T> {
  expectTypeOf(ref(r).value.name).toExtend<string>();
  // the return type is the assertion
  return shallowRef(r);
}
withGeneric({ name: 'a' });

// allow getter and setter types to be unrelated
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- upstream case: a generic value
function unrelated<T>(d: T): void {
  const a = { b: ref(0) };
  const c = ref(a);
  c.value = a;
  const e = ref(d);
  e.value = d;
  const f = ref(ref(0));
  expectTypeOf(f.value).toEqualTypeOf<number>();
  // @ts-expect-error a ref of a ref holds the inner value, not a ref
  f.value = ref(1);
}
unrelated(1);

// correctly unwraps nested refs
const nested = ref({ n: 24, ref: ref(24), nestedRef: ref({ n: ref(0) }) });
expectTypeOf(nested.value.n).toEqualTypeOf<number>();
expectTypeOf(nested.value.ref).toEqualTypeOf<number>();
expectTypeOf(nested.value.nestedRef.n).toEqualTypeOf<number>();
expectTypeOf(reactive({ a: nested }).a.nestedRef.n).toEqualTypeOf<number>();

// shallowRef narrows like a ref and stays a ShallowRef.
type Status = 'initial' | 'ready' | 'invalidating';
const shallowStatus = shallowRef<Status>('initial');
if (shallowStatus.value === 'initial') {
  expectTypeOf(shallowStatus).toExtend<Ref<Status>>();
  shallowStatus.value = 'invalidating';
}
expectTypeOf(shallowRef(1)).toEqualTypeOf<ShallowRef<number>>();
// #7852: a union stays one ref
type Steps = { step: '1' } | { step: '2' };
expectTypeOf(shallowRef<Steps>({ step: '1' })).toEqualTypeOf<ShallowRef<Steps>>();
expectTypeOf(shallowRef({ step: '1' } as Steps)).toEqualTypeOf<ShallowRef<Steps>>();
// should return ShallowRef<T> | Ref<T>, not ShallowRef<T | Ref<T>>
declare const maybeName: MaybeRef<{ name: string }>;
expectTypeOf(shallowRef(maybeName)).toExtend<
  ShallowRef<{ name: string }> | Ref<{ name: string }>
>();

// toRef and toRefs
const obj: { a: number; b: Ref<number>; c: number | string } = { a: 1, b: ref(1), c: 1 };
expectTypeOf(toRef(obj, 'a')).toEqualTypeOf<Ref<number>>();
expectTypeOf(toRef(obj, 'b')).toEqualTypeOf<Ref<number>>();
// should not distribute refs over a union
expectTypeOf(toRef(obj, 'c')).toEqualTypeOf<Ref<number | string>>();
const array = reactive(['a', 'b']);
expectTypeOf(toRef(array, 1)).toEqualTypeOf<Ref<string>>();
expectTypeOf(toRef(array, 1, 'fallback')).toEqualTypeOf<Ref<string>>();
const tuple: [string, number] = ['a', 1];
expectTypeOf(toRef(tuple, '0')).toEqualTypeOf<Ref<string>>();
expectTypeOf(toRef(tuple, '1')).toEqualTypeOf<Ref<number>>();
const fromGetter = toRef(() => 123);
expectTypeOf(fromGetter).toExtend<Readonly<Ref<number>>>();
// @ts-expect-error a ref made from a getter is readonly
fromGetter.value = 234;
expectTypeOf(toRefs(obj)).toEqualTypeOf<{
  a: Ref<number>;
  b: Ref<number>;
  c: Ref<number | string>;
}>();
// neither unwraps a shallow reactive's nested refs
const someReactive = shallowReactive({ a: { b: ref(42) } });
expectTypeOf(toRef(someReactive, 'a').value.b).toEqualTypeOf<Ref<number>>();
expectTypeOf(toRefs(someReactive).a.value.b).toEqualTypeOf<Ref<number>>();
// toRef default value
const optional: { x?: number } = {};
expectTypeOf(toRef(optional, 'x', 1)).toEqualTypeOf<Ref<number>>();
// readonly() + ref()
expectTypeOf(readonly(ref(1))).toEqualTypeOf<Readonly<Ref<number>>>();
// #2687: ToRefs keeps literal unions writable
interface AppData {
  state: 'state1' | 'state2';
}
const data: ToRefs<AppData> = toRefs(reactive<AppData>({ state: 'state1' }));
if (data.state.value === 'state1') data.state.value = 'state2';

// #3954
// the return type is the assertion
function unrefGeneric<T>(p: T | Ref<T>): T {
  return unref(p);
}
unrefGeneric(1);

// #4771: a shallow reactive inside a reactive keeps its refs
const baz = reactive({ foo: shallowReactive({ a: { b: ref(42) } }) });
expectTypeOf(toRef(baz, 'foo').value.a.b).toEqualTypeOf<Ref<number>>();
const bazMap = reactive({ foo: shallowReactive(new Map([['a', ref(42)]])) });
expectTypeOf(toRef(bazMap, 'foo').value.get('a')).toEqualTypeOf<Ref<number> | undefined>();
// a shallow ref inside a reactive, and a reactive inside a shallow ref
const x = reactive({ foo: shallowRef({ bar: { baz: ref(123), qux: reactive({ z: ref(123) }) } }) });
expectTypeOf(x.foo.bar.baz).toEqualTypeOf<Ref<number>>();
expectTypeOf(x.foo.bar.qux.z).toEqualTypeOf<number>();
expectTypeOf(shallowRef({ a: ref(123) }).value.a).toEqualTypeOf<Ref<number>>();
expectTypeOf(shallowRef({ a: reactive({ b: ref(0) }) }).value.a.b).toEqualTypeOf<number>();

// toRef <-> toValue
function refsAndValues(
  a: MaybeRef<string>,
  b: () => string,
  c: MaybeRefOrGetter<string>,
  d: ComputedRef<string>,
): void {
  const r = toRef(a);
  expectTypeOf(r).toExtend<Ref<string>>();
  r.value = 'foo';
  const rb = toRef(b);
  expectTypeOf(rb).toEqualTypeOf<Readonly<Ref<string>>>();
  // @ts-expect-error a ref made from a getter is readonly
  rb.value = 'foo';
  const rc = toRef(c);
  // @ts-expect-error a ref made from a ref or a getter is readonly
  rc.value = 'foo';
  const rd = toRef(d);
  expectTypeOf(rd).toEqualTypeOf<ComputedRef<string>>();
  // @ts-expect-error a ref made from a computed is readonly
  rd.value = 'foo';
  expectTypeOf(toValue(a)).toEqualTypeOf<string>();
  expectTypeOf(toValue(b)).toEqualTypeOf<string>();
  expectTypeOf(toValue(c)).toEqualTypeOf<string>();
  expectTypeOf(toValue(d)).toEqualTypeOf<string>();
}
refsAndValues(
  'foo',
  () => 'bar',
  ref('baz'),
  computed(() => 'hi'),
);

// #8747, #11356: unref() and toValue() take any kind of ref.
declare const unref1: number | Ref<number> | ComputedRef<number>;
expectTypeOf(unref(unref1)).toEqualTypeOf<number>();
declare const unref2:
  | MaybeRef<string>
  | ShallowRef<string>
  | ComputedRef<string>
  | WritableComputedRef<string>;
expectTypeOf(unref(unref2)).toEqualTypeOf<string>();
expectTypeOf(toValue(unref1)).toEqualTypeOf<number>();
expectTypeOf(toValue(unref2)).toEqualTypeOf<string>();
