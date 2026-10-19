// The type contract that the virtual TypeScript of a .vibe file is checked against (CONTRACTS C4).
// It only declares types: the compiler replaces the macros, and the helpers exist only in the
// virtual code. Every name here is a lockstep ABI with the language tools; it carries no semver
// promise.
// oxlint-disable typescript/no-explicit-any, typescript/no-empty-object-type -- C4 states these signatures
import type {
  Component,
  ComponentSignature,
  EmitFn,
  EmitsToProps,
  Handle,
  ModelRef,
} from './component.ts';
import type {
  EventHandlers,
  Events,
  HTMLAttributes,
  IntrinsicElementAttributes,
  ReservedProps,
} from './dom-types.ts';
import { vibeError } from './errors.gen.ts';
import type { ComputedRef, WritableComputedRef } from './reactivity/computed.ts';
import type { Ref, ShallowUnwrapRef } from './reactivity/ref.ts';

// Macros

/**
 * Declares the props of the component: `const { title = 'List' } = defineProps<{ title?: string }>()`.
 * Destructured props stay reactive, and a destructure default is the prop default.
 */
export declare function defineProps<P extends object = {}>(): Readonly<P>;
/** Declares the events as a record of payload tuples: `defineEmits<{ pick: [id: string] }>()`. */
export declare function defineEmits<E extends Record<string, unknown[]> = {}>(): EmitFn<E>;
/** Declares the slots and the props each one receives: `defineSlots<{ item?: (props: { item: Item }) => unknown }>()`. */
export declare function defineSlots<
  S extends Record<string, ((props: never) => unknown) | undefined> = {},
>(): Readonly<S>;
/**
 * Declares a two-way bound prop: `modelValue` by default, or the named one. The ref reads the prop
 * and writing it emits `update:<name>`. Destructure it for the modifiers: `const [m, mods] = defineModel()`.
 */
export declare function defineModel<T, M extends PropertyKey = string>(
  o: { required: true } | { default: () => T },
): ModelRef<T, M>;
export declare function defineModel<T, M extends PropertyKey = string>(o?: {
  required?: false;
}): ModelRef<T | undefined, M>;
export declare function defineModel<T, M extends PropertyKey = string>(
  name: string,
  o: { required: true } | { default: () => T },
): ModelRef<T, M>;
export declare function defineModel<T, M extends PropertyKey = string>(
  name: string,
  o?: { required?: false },
): ModelRef<T | undefined, M>;
/** Sets the value that a template ref to this component holds. */
export declare function defineExpose<X extends object>(exposed: X): X;
/** Sets the component name and whether fallthrough attributes land on the root element. */
export declare function defineOptions(o: { name?: string; inheritAttrs?: boolean }): void;

// Helpers of the virtual code

type Tags = {
  readonly [K in keyof IntrinsicElementAttributes]: IntrinsicElementAttributes[K] &
    EventHandlers<Events>;
};
// Not `export declare const`: the declaration emitter drops the types that an ambient variable
// references, and Node's type stripping keeps the `export { tags }` of a local `declare const`.
/** The attributes and event handlers of each intrinsic element. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the module throws before any read
export const tags: Tags = undefined as never;
/** Checks the attributes of an intrinsic element: `el(tags.div)({ id: e })`. */
export declare function el<A>(attrs: A): (props: A & ReservedProps) => void;
/** Accepts any attribute of a custom element; `on*` handlers receive an `Event`. */
export declare function customElement(props: {
  [k: string]: unknown;
  [k: `on${string}`]: ((event: Event) => unknown) | undefined;
}): void;
/** The signature of a component: called with its props, it returns its handle. */
export declare function component<C extends Component<any>>(
  c: C,
): NonNullable<C[typeof ComponentSignature]>;
/** The loose signature of `<component :is>`: its props and slots are not checked. */
export declare function dynamicComponent(
  c: Component<any> | null | undefined,
): (props: {
  [k: string]: unknown;
  [k: `on${string}`]: ((...args: unknown[]) => unknown) | undefined;
}) => Handle<
  Record<string, ((props: Record<string, unknown>) => unknown) | undefined>,
  unknown,
  Record<string, unknown[]>
>;
/** The template view of the setup bindings: refs are unwrapped one level. */
export declare function unrefs<S extends object>(setup: S): Readonly<ShallowUnwrapRef<S>>;
/**
 * The write targets of the template. Refs and the `let` bindings `L` are writable, refs with their
 * setter type. Everything else is readonly: computed refs, consts, props and imports.
 */
export declare function writable<S extends object, L extends keyof S>(setup: S): Writable<S, L>;
/** The template globals: the props, plus `$attrs`, `$slots`, `$emit` and `$props`. */
export declare function ctx<P, E extends Record<string, unknown[]>, S>(): Readonly<P> & {
  readonly $attrs: Record<string, unknown>;
  readonly $slots: Readonly<S>;
  readonly $emit: EmitFn<E>;
  readonly $props: Readonly<P>;
};
/** The items of a `v-for` source: `[value, index]`, or `[value, key, index]` for an object. */
export declare function vFor(source: number): Iterable<[value: number, index: number]>;
export declare function vFor(source: string): Iterable<[value: string, index: number]>;
export declare function vFor<T>(
  source: Iterable<T> | ArrayLike<T> | null | undefined,
): Iterable<[value: T, index: number]>;
export declare function vFor<T extends object>(
  source: T,
): Iterable<[value: T[keyof T], key: keyof T & string, index: number]>;
/** The props a slot passes, for a scoped slot's destructure: `const [{ item }] = slotParams(slot)`. */
export declare function slotParams<P>(slot: ((props: P) => unknown) | undefined): [props: P];
/** A `<slot>` outlet of a component with `defineSlots`: checks the props it passes. */
export declare function slot<S, K extends keyof S>(): NonNullable<S[K]>;
/** Checks that a template ref target holds the element or component it is set on. */
export declare function templateRef<T>(target: { readonly value: T }, el: NoInfer<T>): void;
/** The type of the default export of a .vibe module. */
export declare function defineComponent<
  P,
  E extends Record<string, unknown[]>,
  S,
  X,
  M,
>(): Component<(props: PropsOf<P, E, M>) => Handle<S, X, E>>;

type PropsOf<P, E extends Record<string, unknown[]>, M> = P &
  M &
  EmitsToProps<E> &
  Omit<HTMLAttributes, keyof P | keyof M | keyof EmitsToProps<E>> &
  ReservedProps;

// A WritableComputedRef is also a ComputedRef, so it is checked first.
type IsWritable<V, K, L> = K extends L
  ? true
  : V extends WritableComputedRef<any, any>
    ? true
    : V extends ComputedRef
      ? false
      : V extends Ref
        ? true
        : false;

// S appears only in the setter, so it is inferred only from the same interface. ShallowRef and
// ModelRef fall back to the getter type, which their setters take.
type Setter<V> =
  V extends WritableComputedRef<any, infer S>
    ? S
    : V extends Ref<infer T, infer S>
      ? unknown extends S
        ? T
        : S
      : V;

type Writable<S, L extends keyof S> = {
  -readonly [K in keyof S as IsWritable<S[K], K, L> extends true ? K : never]: K extends L
    ? S[K]
    : Setter<S[K]>;
} & {
  readonly [
    K in keyof S as IsWritable<S[K], K, L> extends true ? never : K
  ]: ShallowUnwrapRef<S>[K];
};

throw vibeError('VIBE5900');
