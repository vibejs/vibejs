// oxlint-disable typescript/no-explicit-any, typescript/no-empty-object-type -- C4 states these signatures
import type { ComponentDef } from './internal.ts';
import type { Ref, ShallowRef } from './reactivity/ref.ts';
import type { Block } from './runtime/block.ts';

/** The type-only key of a component's signature: its props, slots, exposed values and emits. */
export declare const ComponentSignature: unique symbol;

/** What a component returns to its parent in the type system: its slots, exposed values and emits. */
export interface Handle<S = {}, X = {}, E = {}> {
  readonly slots: S;
  readonly exposed: X;
  readonly emits: E;
}

/** A runtime component definition that carries its signature as a phantom type. */
export type Component<Sig extends (props: any) => Handle<any, any, any> = (props: {}) => Handle> =
  ComponentDef & { readonly [ComponentSignature]?: Sig };

/** The props a parent passes, including `on*` event handlers, models and fallthrough attributes. */
export type ComponentProps<C extends Component<any>> = Parameters<
  NonNullable<C[typeof ComponentSignature]>
>[0];
export type ComponentSlots<C extends Component<any>> = ReturnType<
  NonNullable<C[typeof ComponentSignature]>
>['slots'];
/** The value a template ref to the component holds: what its setup passes to `defineExpose()`. */
export type ComponentExposed<C extends Component<any>> = ReturnType<
  NonNullable<C[typeof ComponentSignature]>
>['exposed'];
/** The events, as a record of payload tuples: `{ pick: [id: string] }`. */
export type ComponentEmits<C extends Component<any>> = ReturnType<
  NonNullable<C[typeof ComponentSignature]>
>['emits'];

/** The `on*` handler props of an emits record: `{ pick: [id: string] }` gives `onPick`. */
export type EmitsToProps<E extends Record<string, unknown[]>> = {
  [K in keyof E & string as `on${Capitalize<K>}`]?: (...a: E[K]) => void;
};

/** Emits an event declared in the emits record with its payload. */
export type EmitFn<E extends Record<string, unknown[]>> = <K extends keyof E & string>(
  event: K,
  ...args: E[K]
) => void;

/** The second argument of a component's `setup` and the third of its `render`. */
export interface SetupContext<
  E extends Record<string, unknown[]> = Record<string, unknown[]>,
  S = Record<string, unknown>,
> {
  /** The attributes and handlers passed by the parent that are not declared props or emits. */
  readonly attrs: Record<string, unknown>;
  readonly slots: Readonly<S>;
  readonly emit: EmitFn<E>;
  /** Sets the value that a template ref to this component holds. */
  expose(exposed: Record<string, unknown>): void;
}

/**
 * The ref of `defineModel()`: reading it reads the prop, writing it emits `update:<name>`.
 * Destructuring it gives the ref and its modifiers: `const [value, modifiers] = defineModel()`.
 */
export type ModelRef<T, M extends PropertyKey = string> = Ref<T> &
  [ModelRef<T, M>, Record<M, true | undefined>];

/** The ref of `useTemplateRef()`: the element or the component's exposed values, `null` until rendered. */
export type TemplateRef<T = unknown> = Readonly<ShallowRef<T | null>>;

/** A slot as a component receives it: called with the slot props, it renders the content. */
export type Slot<P = any> = (props: P) => Block;

/** The slots a component receives, by name. */
export type Slots = Readonly<Record<string, Slot | undefined>>;
