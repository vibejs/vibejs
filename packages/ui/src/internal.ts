// The runtime ABI between compiled .vibe modules and @vibejs-org/ui (CONTRACTS C3). It carries no
// semver promise.
import type { SetupContext } from './component.ts';

/** What a render function returns and `insert()` places: a node or a list of blocks. */
export type Block = Node | Block[];

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
