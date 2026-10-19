// oxlint-disable typescript/no-empty-object-type -- empty slots and props records
// The ABI v1 signatures of CONTRACTS C3, and the compiled twins as typed components (C4).
import { expectTypeOf } from 'vitest';
import { Counter } from '../test/abi/Counter.ts';
import { Dynamic } from '../test/abi/Dynamic.ts';
import { Refs } from '../test/abi/Refs.ts';
import type { Component, ComponentExposed, ComponentProps, Handle, ModelRef } from './index.ts';
import type {
  Block,
  ComponentDef,
  ComponentInstance,
  Fragment,
  RawProps,
  RawSlots,
  Slot,
} from './internal.ts';
import {
  createComponent,
  createDynamicComponent,
  createSlot,
  setRef,
  useModel,
} from './internal.ts';

expectTypeOf<RawProps>().toEqualTypeOf<
  Record<string, () => unknown> & { $?: (() => Record<string, unknown>)[] }
>();
expectTypeOf<RawSlots>().toEqualTypeOf<
  Record<string, Slot> & { $?: (() => { name: string; fn: Slot } | null | undefined)[] }
>();
expectTypeOf(createComponent).toEqualTypeOf<
  (
    def: ComponentDef,
    props?: RawProps | null,
    slots?: RawSlots | null,
    isSingleRoot?: boolean,
  ) => ComponentInstance
>();
expectTypeOf(createDynamicComponent).parameters.toEqualTypeOf<
  [
    is: () => ComponentDef | null | undefined,
    props?: RawProps | null,
    slots?: RawSlots | null,
    isSingleRoot?: boolean,
  ]
>();
expectTypeOf(createDynamicComponent).returns.toExtend<Fragment>();
expectTypeOf(createSlot).parameters.toEqualTypeOf<
  [name: string, props?: RawProps | null, fallback?: () => Block]
>();
expectTypeOf(createSlot).returns.toExtend<Fragment>();
expectTypeOf(useModel).toEqualTypeOf<
  (props: Record<string, unknown>, name: string) => ModelRef<unknown>
>();
expectTypeOf(setRef).toEqualTypeOf<
  (
    target: Element | ComponentInstance,
    ref: string | ((v: unknown, refs: Record<string, unknown>) => void),
    inFor?: boolean,
  ) => void
>();

// The twins cast to the component types the language tools give their .vibe files.
const TypedCounter = Counter as Component<
  (props: {
    start?: number;
    step?: number;
    onChange?: (count: number) => void;
  }) => Handle<{}, { count: number }, { change: [count: number] }>
>;
expectTypeOf<ComponentProps<typeof TypedCounter>>().toEqualTypeOf<{
  start?: number;
  step?: number;
  onChange?: (count: number) => void;
}>();
expectTypeOf<ComponentExposed<typeof TypedCounter>>().toEqualTypeOf<{ count: number }>();
const TypedDynamic = Dynamic as Component<
  (props: { is: Component | null | undefined; label: string }) => Handle
>;
expectTypeOf(TypedDynamic).toExtend<ComponentDef>();
const TypedRefs = Refs as Component<
  (props: {}) => Handle<{}, { items: number[]; show: boolean; seen: unknown[] }>
>;
expectTypeOf<ComponentExposed<typeof TypedRefs>>().toHaveProperty('seen');
