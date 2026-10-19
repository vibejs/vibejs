// oxlint-disable typescript/no-empty-object-type, typescript/no-generated-empty-object-type, typescript/no-explicit-any -- the defaults are empty records; `Component<any>` is the contract's any component
import { expectTypeOf } from 'vitest';
import type {
  Component,
  ComponentEmits,
  ComponentExposed,
  ComponentProps,
  ComponentSlots,
  EmitFn,
  EmitsToProps,
  Handle,
  ModelRef,
  SetupContext,
} from './index.ts';
import type { Block, ComponentDef } from './internal.ts';
import type { Ref } from './reactivity/ref.ts';

// Defaults.
expectTypeOf<Handle>().toEqualTypeOf<{
  readonly slots: {};
  readonly exposed: {};
  readonly emits: {};
}>();
expectTypeOf<ComponentProps<Component>>().toEqualTypeOf<{}>();
expectTypeOf<ComponentSlots<Component>>().toEqualTypeOf<{}>();
expectTypeOf<Component>().toExtend<ComponentDef>();

// A ComponentDef cast to Component<Sig>, as the router and the test host are typed.
type Sig = (props: {
  to: string;
  replace?: boolean;
}) => Handle<
  { default?: (props: { active: boolean }) => unknown },
  { focus(): void },
  { navigate: [to: string] }
>;
const def = {
  name: 'Link',
  __propKeys: ['to', 'replace'],
  render: (): Block => [document.createElement('a')],
} satisfies ComponentDef;
const Link = def as Component<Sig>;
expectTypeOf<ComponentProps<typeof Link>>().toEqualTypeOf<{ to: string; replace?: boolean }>();
expectTypeOf<ComponentSlots<typeof Link>>().toEqualTypeOf<{
  default?: (props: { active: boolean }) => unknown;
}>();
expectTypeOf<ComponentExposed<typeof Link>>().toEqualTypeOf<{ focus(): void }>();
expectTypeOf<ComponentEmits<typeof Link>>().toEqualTypeOf<{ navigate: [to: string] }>();
expectTypeOf(Link).toExtend<Component<any>>();
// @ts-expect-error a component signature returns a handle
expectTypeOf<Component<(props: {}) => string>>();

// Events: on* props and the emit function.
expectTypeOf<
  EmitsToProps<{ pick: [id: string]; 'update:value': [value: number] }>
>().toEqualTypeOf<{
  onPick?: (id: string) => void;
  'onUpdate:value'?: (value: number) => void;
}>();
declare const emit: EmitFn<{ pick: [id: string]; close: [] }>;
emit('pick', 'a');
emit('close');
// @ts-expect-error pick takes an id
emit('pick');
// @ts-expect-error close takes no payload
emit('close', 1);
// @ts-expect-error an unknown event
emit('open');

// The setup context.
declare const ctx: SetupContext<{ pick: [id: string] }, { default?: () => unknown }>;
expectTypeOf(ctx.attrs).toEqualTypeOf<Record<string, unknown>>();
expectTypeOf(ctx.slots).toEqualTypeOf<Readonly<{ default?: () => unknown }>>();
expectTypeOf(ctx.emit).toEqualTypeOf<EmitFn<{ pick: [id: string] }>>();
expectTypeOf<typeof ctx.expose>().toEqualTypeOf<(exposed: Record<string, unknown>) => void>();

// A model ref is a ref, and it destructures into the ref and its modifiers.
declare const model: ModelRef<string, 'trim' | 'number'>;
expectTypeOf(model).toExtend<Ref<string>>();
const [value, modifiers] = model;
expectTypeOf(value).toEqualTypeOf<ModelRef<string, 'trim' | 'number'>>();
expectTypeOf(modifiers).toEqualTypeOf<Record<'trim' | 'number', true | undefined>>();
