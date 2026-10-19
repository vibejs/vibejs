import type { ExprIR, ExprPart, LocalScope } from '../expr/rewrite.ts';

/** A node or block variable; codegen names it `_n<id>`. */
export type Ref = number;

/**
 * The render IR of a template. Generated expression parts call ABI helpers by their `_` import
 * names (`_toDisplayString`); `abi` lists every C3 helper the IR uses.
 */
export interface RootIR {
  templates: { html: string; ns?: 'svg' | 'math' }[];
  block: BlockIR;
  abi: Set<string>;
}

/** More than one return renders as a `Block[]`. */
export interface BlockIR {
  ops: Op[];
  returns: Ref[];
}

/** `child(n)`, `next(n)`, `txt(n)`, or `nthChild(n, i)` for a number. */
export type Step = 'child' | 'next' | 'txt' | number;

/** `loc`: the file offset of the node a `tpl` or `walk` reaches, none for an anchor. */
export type Op =
  | { op: 'tpl'; id: Ref; tpl: number; loc?: number }
  | { op: 'walk'; id: Ref; from: Ref; steps: Step[]; loc?: number }
  /** A `renderEffect`; `loc` is the file offset of the binding. */
  | { op: 'effect'; call: CallIR; loc: number }
  | { op: 'once'; call: CallIR }
  /** Inserts a subtree split off by the nesting rule. */
  | { op: 'insert'; id: Ref; parent: Ref; anchor: Ref }
  /** A dynamic block, inserted before `anchor` in `parent`, or returned when `parent` is null. */
  | { op: 'block'; id: Ref; parent: Ref | null; anchor: Ref | null; make: MakeIR };

/** `fn` is a C3 export name. */
export interface CallIR {
  fn: string;
  args: ArgIR[];
}

/**
 * `expr` is evaluated in place, `getter` and `handler` become closures, `value` is a literal, and
 * `object` is an object literal of other arguments (such as the checkbox `values` getters).
 */
export type ArgIR =
  | { ref: Ref }
  | { expr: ExprIR }
  | { getter: ExprIR }
  | { handler: HandlerIR }
  | { value: unknown }
  | { object: Record<string, ArgIR> };

export interface HandlerIR {
  expr: ExprIR;
  mods: string[];
  keys: string[];
  options: { once?: true; capture?: true; passive?: true };
}

/** `value`: a string is static text and `true` a valueless attribute. */
export interface PropIR {
  key: string;
  value: ExprIR | HandlerIR | string | true;
  loc: number;
}

/** Prop groups in source order: a run of props, or the object of one `v-bind` or `:[key]`. */
export type SpreadIR = (PropIR[] | ExprIR)[];

/** `params`: the user's parameter pattern; `test`: the condition of a conditional slot. */
export interface SlotIR {
  name: string;
  scope: LocalScope | null;
  params: ExprPart | null;
  block: BlockIR;
  test: ExprIR | null;
}

export type MakeIR =
  | { k: 'if'; branches: { test: ExprIR | null; block: BlockIR }[] }
  /** `params`: the value, key and index patterns; `key` null: a numeric source (`v => v`). */
  | {
      k: 'for';
      source: ExprIR;
      scope: LocalScope;
      params: (ExprPart | null)[];
      key: ExprIR | null;
      block: BlockIR;
    }
  | { k: 'keyed'; key: ExprIR; block: BlockIR }
  /** `is`: a resolved reference (`Item`, `$setup.Item`, `_sfc`), or the `:is` of `<component>`. */
  | {
      k: 'component';
      is: string | ExprIR;
      props: PropIR[];
      spread: SpreadIR | null;
      slots: SlotIR[];
      singleRoot: boolean;
    }
  | { k: 'slot'; name: string; props: PropIR[]; spread: SpreadIR | null; fallback: BlockIR | null };
