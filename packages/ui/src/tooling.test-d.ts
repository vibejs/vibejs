// oxlint-disable eslint/no-underscore-dangle, eslint/no-unused-vars, typescript/no-empty-object-type, typescript/no-generated-empty-object-type, typescript/no-explicit-any -- the names, `$event` parameters, empty records and `Component<any>` of the virtual code
// Type tests of the tooling contract. The modules in ./virtual are the Layout A virtual code of
// five .vibe files, written as the language tools emit it, with three deviations: the component is
// a named export, `.vibe` imports point at the sibling `.test-d.ts`, and the type annotations that
// isolatedDeclarations needs (on the export and on `__vibe_exposed`). The blocks below copy their
// code to assert types inside it and to seed user mistakes.
import { expectTypeOf } from 'vitest';
import type {
  Component,
  ComponentEmits,
  ComponentExposed,
  ComponentProps,
  ComponentSlots,
  HTMLAttributes,
  ModelRef,
  ReservedProps,
} from './index.ts';
import type { ComponentDef } from './internal.ts';
import { computed, type ComputedRef, type WritableComputedRef } from './reactivity/computed.ts';
import { ref, shallowRef, type Ref, type ShallowRef } from './reactivity/ref.ts';
import * as __vibe from './tooling.ts';
import {
  defineEmits,
  defineExpose,
  defineModel,
  defineOptions,
  defineProps,
  defineSlots,
} from './tooling.ts';
import { Card } from './virtual/Card.test-d.ts';
import { CardParent } from './virtual/CardParent.test-d.ts';
import { Field } from './virtual/Field.test-d.ts';
import { List } from './virtual/List.test-d.ts';
import { Row } from './virtual/Row.test-d.ts';

declare const inputElement: HTMLInputElement;
declare const divElement: HTMLDivElement;
declare const arrayLike: ArrayLike<boolean>;
declare const maybe: string[] | undefined;
declare const kinds: {
  a: Ref<number>;
  b: ShallowRef<number>;
  c: ComputedRef<number>;
  d: WritableComputedRef<number>;
  e: ModelRef<number>;
};

// Component types of the fixtures

type Item = { id: string; label: string; count?: number };
type FieldModels = {
  modelValue: string;
  'onUpdate:modelValue'?: (value: string) => void;
  modelModifiers?: Record<string, true | undefined>;
  count?: number;
  'onUpdate:count'?: (value: number) => void;
  countModifiers?: Record<string, true | undefined>;
  title?: string | undefined;
  'onUpdate:title'?: (value: string | undefined) => void;
  titleModifiers?: Record<'trim', true | undefined>;
};
type CardSlots = {
  default?: (props: {}) => unknown;
  header?: (props: { title: string }) => unknown;
  item: (props: { item: string; index: number }) => unknown;
};

expectTypeOf<ComponentProps<typeof Row>>().branded.toEqualTypeOf<
  { id: string; label: string; count?: number } & {} & {
    onSelect?: (id: string) => void;
    onToggle?: () => void;
  } & Omit<HTMLAttributes, 'id' | 'label' | 'count' | 'onSelect' | 'onToggle'> &
    ReservedProps
>();
expectTypeOf<ComponentEmits<typeof Row>>().toEqualTypeOf<{ select: [id: string]; toggle: [] }>();
expectTypeOf<ComponentSlots<typeof Row>>().toEqualTypeOf<{}>();
expectTypeOf<ComponentExposed<typeof Row>>().toEqualTypeOf<{}>();

expectTypeOf<ComponentProps<typeof List>>().branded.toEqualTypeOf<
  { items: Item[]; title?: string } & {} & { onPick?: (id: string) => void } & Omit<
      HTMLAttributes,
      'items' | 'title' | 'onPick'
    > &
    ReservedProps
>();
expectTypeOf<ComponentEmits<typeof List>>().toEqualTypeOf<{ pick: [id: string] }>();

expectTypeOf<ComponentProps<typeof Field>>().branded.toEqualTypeOf<
  { label: string } & FieldModels & {} & Omit<HTMLAttributes, 'label' | keyof FieldModels> &
    ReservedProps
>();
expectTypeOf<ComponentEmits<typeof Field>>().toEqualTypeOf<{}>();

expectTypeOf<ComponentProps<typeof Card>>().branded.toEqualTypeOf<
  { title: string; items: string[] } & {} & Omit<HTMLAttributes, 'title' | 'items'> & ReservedProps
>();
expectTypeOf<ComponentSlots<typeof Card>>().toEqualTypeOf<CardSlots>();
expectTypeOf<ComponentExposed<typeof Card>>().toEqualTypeOf<{ toggle: () => void }>();
expectTypeOf<ComponentEmits<typeof Card>>().toEqualTypeOf<{}>();

for (const c of [Row, List, Field, Card, CardParent]) {
  expectTypeOf(c).toExtend<Component<any>>();
  expectTypeOf(c).toExtend<ComponentDef>();
}

// User mistakes fail at the user position

// <Row> in List: props and events.
{
  const c = __vibe.component(Row);
  c({
    id: 'a',
    label: 'x',
    // @ts-expect-error an unknown prop
    bogus: 1,
  });
  c({
    id: 'a',
    // @ts-expect-error a wrong prop type
    label: 1,
  });
  c({
    id: 'a',
    label: 'x',
    // @ts-expect-error a static string passed to a number prop: count="5"
    count: '5',
  });
  c(
    // @ts-expect-error the required prop label is missing
    { id: 'a' },
  );
  c({
    id: 'a',
    label: 'x',
    // @ts-expect-error an unknown event
    onBogus: ($event: unknown) => {},
  });
}

// Row's template: emit payloads and intrinsic attributes.
{
  const emit = defineEmits<{ select: [id: string]; toggle: [] }>();
  const __vibe_setup = { emit };
  const { emit: e } = __vibe.unrefs(__vibe_setup);
  __vibe.el(__vibe.tags.li)({
    onClick: ($event) => {
      // @ts-expect-error a wrong emit payload
      e('select', 1);
    },
  });
  __vibe.el(__vibe.tags.div)({
    // @ts-expect-error an unknown attribute on an intrinsic element
    bogus: '1',
  });
}

// Template writes through writable(): props, consts, imports and computed refs are readonly.
{
  const { title } = defineProps<{ title: string }>();
  const limit = 3;
  const doubled = computed(() => 2);
  const open = ref(false);
  const __vibe_setup = { title, limit, Row, doubled, open };
  const __vibe_w = __vibe.writable<typeof __vibe_setup, never>(__vibe_setup);
  __vibe_w.open = true;
  // @ts-expect-error a write to a prop
  __vibe_w.title = 'x';
  // @ts-expect-error a write to a const
  __vibe_w.limit = 4;
  // @ts-expect-error a write to an import
  __vibe_w.Row = Row;
  // @ts-expect-error a write to a ComputedRef
  __vibe_w.doubled = 3;
}

// Slots: an unknown slot name, in the parent and at the outlet.
{
  var __vibe_c0 = __vibe.component(Card)({ title: 't', items: [] });
  // @ts-expect-error an unknown slot name
  __vibe.slotParams(__vibe_c0.slots.footer);
  // @ts-expect-error an unknown slot name at the outlet
  __vibe.slot<CardSlots, 'footer'>();
  __vibe.slot<CardSlots, 'header'>()({
    // @ts-expect-error a wrong slot prop at the outlet
    title: 1,
  });
}

// defineModel: a wrong value from the parent, and a text v-model on a number model.
{
  __vibe.component(Field)({
    label: 'l',
    // @ts-expect-error a wrong defineModel value type
    modelValue: 1,
  });
  const count = defineModel<number>('count', { default: () => 0 });
  const __vibe_setup = { count };
  const __vibe_w = __vibe.writable<typeof __vibe_setup, never>(__vibe_setup);
  __vibe_w.count = Number();
  // @ts-expect-error v-model without .number writes a string
  __vibe_w.count = String();
}

// templateRef: the element must match the target.
{
  const input = shallowRef<HTMLInputElement | null>(null);
  __vibe.templateRef(input, inputElement);
  // @ts-expect-error a mismatched templateRef element
  __vibe.templateRef(input, divElement);
}

// Narrowing: a v-if narrows the shadow const inside an inline handler.
{
  const user = ref<{ name: string } | null>(null);
  const __vibe_setup = { user };
  const { user: u } = __vibe.unrefs(__vibe_setup);
  if (u) {
    __vibe.el(__vibe.tags.button)({
      onClick: ($event) => {
        expectTypeOf(u).toEqualTypeOf<{ name: string }>();
      },
    });
  }
}

// Unwrapping and writability

{
  const setup = {
    a: ref(1),
    b: shallowRef('s'),
    c: computed(() => true),
    d: computed({ get: () => 1, set: (_: string) => {} }),
    m: defineModel<number>({ required: true }),
    r: ref({ n: ref(1) }),
    n: 1,
    f: () => 'x',
    o: { x: ref(1) },
    l: 0,
  };
  expectTypeOf(__vibe.unrefs(setup)).toEqualTypeOf<{
    readonly a: number;
    readonly b: string;
    readonly c: boolean;
    readonly d: number;
    readonly m: number;
    readonly r: { n: number };
    readonly n: number;
    readonly f: () => string;
    readonly o: { x: Ref<number> };
    readonly l: number;
  }>();
  const w = __vibe.writable<typeof setup, 'l'>(setup);
  w.a = 2;
  w.b = 't';
  w.d = 'x';
  w.m = 3;
  w.r = { n: 2 };
  w.r = { n: ref(2) };
  w.l = 1;
  // @ts-expect-error the setter of r takes { n: number } or { n: Ref<number> }
  w.r = { n: '2' };
  // @ts-expect-error the setter of d takes a string
  w.d = 1;
  // @ts-expect-error a shallow ref of a string takes a string
  w.b = 1;
  // @ts-expect-error a number model takes a number
  w.m = '3';
  // @ts-expect-error a number let takes a number
  w.l = '1';
  // @ts-expect-error a computed ref is readonly
  w.c = false;
  // @ts-expect-error a const is readonly
  w.n = 2;
  // @ts-expect-error a const is readonly
  w.o = { x: ref(2) };
  expectTypeOf(w.c).toEqualTypeOf<boolean>();
}

expectTypeOf<ModelRef<string>>().toExtend<Ref<string>>();
{
  const [m, mods] = defineModel<string, 'trim'>();
  expectTypeOf(m).toEqualTypeOf<ModelRef<string | undefined, 'trim'>>();
  expectTypeOf(mods.trim).toEqualTypeOf<true | undefined>();
  expectTypeOf(defineModel<string>({ required: true })).toEqualTypeOf<ModelRef<string>>();
  expectTypeOf(defineModel<number>({ default: () => 0 })).toEqualTypeOf<ModelRef<number>>();
  expectTypeOf(defineModel<string>()).toEqualTypeOf<ModelRef<string | undefined>>();
  expectTypeOf(defineModel<string>('title', { required: true })).toEqualTypeOf<ModelRef<string>>();
  expectTypeOf(defineModel<number>('n', { default: () => 0 })).toEqualTypeOf<ModelRef<number>>();
  expectTypeOf(defineModel<string>('title')).toEqualTypeOf<ModelRef<string | undefined>>();
}

// vFor overloads

{
  expectTypeOf(__vibe.vFor(3)).toEqualTypeOf<Iterable<[value: number, index: number]>>();
  expectTypeOf(__vibe.vFor('ab')).toEqualTypeOf<Iterable<[value: string, index: number]>>();
  expectTypeOf(__vibe.vFor([1n])).toEqualTypeOf<Iterable<[value: bigint, index: number]>>();
  expectTypeOf(__vibe.vFor(new Set([1]))).toEqualTypeOf<Iterable<[value: number, index: number]>>();
  expectTypeOf(__vibe.vFor(arrayLike)).toEqualTypeOf<Iterable<[value: boolean, index: number]>>();
  expectTypeOf(__vibe.vFor(maybe)).toEqualTypeOf<Iterable<[value: string, index: number]>>();
  expectTypeOf(__vibe.vFor({ a: 1, b: 'x' })).toEqualTypeOf<
    Iterable<[value: number | string, key: 'a' | 'b', index: number]>
  >();
}

// No any leaks

{
  type P = { label: string; count?: number };
  type E = { select: [id: string] };
  expectTypeOf(defineProps<P>()).not.toBeAny();
  expectTypeOf(defineEmits<E>()).not.toBeAny();
  expectTypeOf(defineSlots<CardSlots>()).not.toBeAny();
  expectTypeOf(defineModel<string>()).not.toBeAny();
  expectTypeOf(defineExpose({ a: 1 })).not.toBeAny();
  expectTypeOf(defineOptions({ name: 'X' })).toEqualTypeOf<void>();
  expectTypeOf(__vibe.tags).not.toBeAny();
  expectTypeOf(__vibe.tags.div).not.toBeAny();
  expectTypeOf(__vibe.el(__vibe.tags.div)).not.toBeAny();
  expectTypeOf(__vibe.el(__vibe.tags.div)({})).toEqualTypeOf<void>();
  expectTypeOf(__vibe.customElement({})).toEqualTypeOf<void>();
  expectTypeOf(__vibe.component(Row)).not.toBeAny();
  const handle = __vibe.component(Card)({ title: 't', items: [] });
  expectTypeOf(handle).not.toBeAny();
  expectTypeOf(handle.slots).not.toBeAny();
  expectTypeOf(handle.exposed).not.toBeAny();
  expectTypeOf(handle.emits).not.toBeAny();
  const dynamic = __vibe.dynamicComponent(Row)({ a: 1 });
  expectTypeOf(dynamic).not.toBeAny();
  expectTypeOf(dynamic.slots).not.toBeAny();
  expectTypeOf(dynamic.exposed).toEqualTypeOf<unknown>();
  expectTypeOf(__vibe.vFor([1])).not.toBeAny();
  expectTypeOf(__vibe.slotParams(handle.slots.item)).not.toBeAny();
  expectTypeOf(__vibe.slot<CardSlots, 'item'>()).not.toBeAny();
  expectTypeOf(__vibe.templateRef(ref(1), 1)).toEqualTypeOf<void>();
  expectTypeOf(__vibe.defineComponent<P, E, {}, {}, {}>()).not.toBeAny();

  // Row: unrefs and ctx bindings, native and component handlers.
  const { label, count = 0 } = defineProps<P>();
  const emit = defineEmits<E>();
  const __vibe_setup = { label, count, emit, open: ref(false), c: computed(() => 1) };
  const s = __vibe.unrefs(__vibe_setup);
  expectTypeOf(s.label).toEqualTypeOf<string>();
  expectTypeOf(s.count).toEqualTypeOf<number>();
  expectTypeOf(s.emit).not.toBeAny();
  expectTypeOf(s.open).toEqualTypeOf<boolean>();
  expectTypeOf(s.c).toEqualTypeOf<number>();
  const x = __vibe.ctx<P, E, CardSlots>();
  expectTypeOf(x.label).toEqualTypeOf<string>();
  expectTypeOf(x.count).toEqualTypeOf<number | undefined>();
  expectTypeOf(x.$attrs).toEqualTypeOf<Record<string, unknown>>();
  expectTypeOf(x.$slots).toEqualTypeOf<Readonly<CardSlots>>();
  expectTypeOf(x.$emit).not.toBeAny();
  expectTypeOf(x.$props).toEqualTypeOf<Readonly<P>>();
  expectTypeOf(__vibe.writable<typeof __vibe_setup, never>(__vibe_setup)).not.toBeAny();
  __vibe.el(__vibe.tags.li)({
    onClick: ($event) => {
      expectTypeOf($event).not.toBeAny();
      expectTypeOf($event).toEqualTypeOf<PointerEvent>();
    },
    onKeydown: ($event) => {
      expectTypeOf($event).toEqualTypeOf<KeyboardEvent>();
    },
  });
  __vibe.component(Row)({
    id: 'a',
    label: 'x',
    onSelect: ($event) => {
      expectTypeOf($event).not.toBeAny();
      expectTypeOf($event).toEqualTypeOf<string>();
    },
  });
  __vibe.customElement({
    onChange: ($event) => {
      expectTypeOf($event).toEqualTypeOf<Event>();
    },
  });

  // CardParent: scoped slot params.
  const [{ title }] = __vibe.slotParams(handle.slots.header);
  expectTypeOf(title).toEqualTypeOf<string>();
  const [{ item, index }] = __vibe.slotParams(handle.slots.item);
  expectTypeOf(item).toEqualTypeOf<string>();
  expectTypeOf(index).toEqualTypeOf<number>();
}

// Ref kinds that unrefs unwraps, by their declared types.
{
  expectTypeOf(__vibe.unrefs(kinds)).toEqualTypeOf<{
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly e: number;
  }>();
}
