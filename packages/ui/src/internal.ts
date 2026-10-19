// The runtime ABI between compiled .vibe modules and @vibejs-org/ui (CONTRACTS C3), v1. A change
// lands in the compiler and the runtime together, with the compiled twins in test/abi. It carries
// no semver promise. The JSDoc of each helper states what codegen emits for it.
import type { SetupContext } from './component.ts';
import type { Block } from './runtime/block.ts';

export type { Slot } from './component.ts';
export type { Block, Fragment } from './runtime/block.ts';
export { createIf, createKeyed, insert } from './runtime/block.ts';
export { createComponent, createDynamicComponent } from './runtime/component.ts';
export {
  child,
  next,
  nthChild,
  setAttr,
  setClass,
  setDynamicProps,
  setHtml,
  setProp,
  setStyle,
  setText,
  template,
  toDisplayString,
  txt,
} from './runtime/dom.ts';
export { on, withKeys, withModifiers } from './runtime/events.ts';
export { createFor } from './runtime/for.ts';
export type { ComponentInstance } from './runtime/instance.ts';
export { useModel } from './runtime/props.ts';
export type { RawProps } from './runtime/props.ts';
export { renderEffect } from './runtime/renderEffect.ts';
export { createSlot } from './runtime/slots.ts';
export type { RawSlots } from './runtime/slots.ts';
export { setRef } from './runtime/templateRef.ts';
export {
  applyCheckboxModel,
  applyRadioModel,
  applySelectModel,
  applyTextModel,
  applyVShow,
} from './runtime/vModel.ts';

/** A component as the compiler emits it: the object a `.vibe` module exports by default. */
export interface ComponentDef {
  /** Set in dev, and always when `defineOptions({ name })` sets it. */
  name?: string;
  /** Dev only: the source file, for warnings and devtools. */
  __file?: string;
  /** Dev only: the HMR record id. */
  __hmrId?: string;
  /** The scope attribute of `<style scoped>`: `data-vb-<8hex>`. */
  __scopeId?: string;
  /** The declared prop keys; every other attribute falls through. */
  __propKeys?: readonly string[];
  /** The declared event names. */
  __emits?: readonly string[];
  /** The prop defaults, as factories. */
  __defaults?: Readonly<Record<string, () => unknown>>;
  /** `false` keeps fallthrough attributes off the root element. */
  inheritAttrs?: boolean;
  /**
   * Runs once per instance. Returns every setup-local binding except props, prop aliases and
   * imports; `let` bindings are returned as get/set accessors.
   */
  setup?(props: Record<string, unknown>, ctx: SetupContext): Record<string, unknown> | void;
  /** Builds the DOM. `$setup` holds the setup bindings with refs unwrapped. */
  render(
    $setup: Record<string, unknown>,
    $props: Record<string, unknown>,
    $ctx: SetupContext,
  ): Block;
}
