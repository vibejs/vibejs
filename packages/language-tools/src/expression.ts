import { forEachIdentifier, isAllowedGlobal } from '@vibejs-org/compiler';
import { Preset, type CodeBuilder } from './builder.ts';

/** The names a template reads from outside, and the ones it used. */
export interface Names {
  /** Setup bindings, which the template block shadows: name -> declaration. */
  setup: ReadonlyMap<string, [number, number]>;
  /** Props without a setup binding and `$attrs`, `$slots`, `$emit`, `$props`: name -> declaration. */
  ctx: ReadonlyMap<string, [number, number] | null>;
  usedSetup: Set<string>;
  usedCtx: Set<string>;
  /** Names that are none of these nor an allowed global: name -> its first use. */
  unknown: Map<string, [number, number]>;
  /** Whether the template writes to a setup binding. */
  writes: boolean;
}

type Ref = [name: string, start: number, end: number, info: { local: boolean; writeRoot: boolean }];
/**
 * The identifier references of each text walked while one file is generated: a handler or a
 * `v-model` value is walked up to three times, and a file repeats paths such as `item.id`.
 */
const walkedTexts = new Map<string, Ref[]>();

/** Starts a file: the cache holds only the texts of one file. */
export function resetWalks(): void {
  walkedTexts.clear();
}

const ID = '[A-Za-z_$][\\w$]*';
/**
 * A member path (`a.b`): plain, as an assignment target `(a.b) = 0` and as an array pattern
 * `[a.b] = []`. Its root is its only reference, a write root when wrapped.
 */
const PATHS: [RegExp, boolean][] = [
  [new RegExp(`^\\s*(${ID})(?:\\.${ID})*\\s*$`), false],
  [new RegExp(`^\\(\\s*(${ID})(?:\\.${ID})*\\s*\\) = 0$`), true],
  [new RegExp(`^\\[\\s*(${ID})(?:\\.${ID})*\\s*\\] = \\[\\]$`), true],
];
/** The reserved words of strict code: a path starting with one is left to the parser. */
const RESERVED = new Set(
  'await break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield'.split(
    ' ',
  ),
);

/** The reference of a member path, without parsing it: most template expressions are one. */
export function pathRef(text: string): Ref | undefined {
  for (const [re, writeRoot] of PATHS) {
    const root = re.exec(text)?.[1];
    if (root === undefined) continue;
    if (RESERVED.has(root)) return undefined;
    // Only whitespace, `(` or `[` precede the root.
    const start = text.indexOf(root);
    return [root, start, start + root.length, { local: false, writeRoot }];
  }
  return undefined;
}

/** `forEachIdentifier(text, offset, cb)`, parsing each text at most once per file. */
function eachIdentifier(text: string, offset: number, cb: (...ref: Ref) => void): void {
  let refs = walkedTexts.get(text);
  if (!refs) {
    const ref = pathRef(text);
    const list: Ref[] = ref ? [ref] : [];
    if (!ref) forEachIdentifier(text, 0, (...r) => list.push(r));
    walkedTexts.set(text, (refs = list));
  }
  for (const [name, start, end, info] of refs) cb(name, start + offset, end + offset, info);
}

/** How `expression` walks and maps its range. */
export interface Mode {
  /** The range is a v-for alias: only names read by its default values are bound. */
  pattern?: boolean;
  /** The range is an assignment target (a `v-model` value): its root is a write root. */
  target?: boolean;
  /** The features of every span, instead of EXPR and BOUND. */
  features?: number;
}

/**
 * Emits the template expression at the original range [start, end), verbatim. Names bound to setup
 * bindings or props get BOUND spans; write roots among them are written through `__vibe_w` (setup)
 * or `__vibe_ctx` (props), so readonly targets fail at the template. `locals` are template-local
 * names (v-for aliases, `$event`). Other names that are not allowed globals are collected in
 * `unknown`. An expression that does not parse is emitted as it is.
 */
export function expression(
  b: CodeBuilder,
  names: Names,
  source: string,
  [start, end]: [number, number],
  locals: ReadonlySet<string>,
  { pattern = false, target = false, features }: Mode = {},
): void {
  const expr = features ?? Preset.EXPR;
  let at = start;
  const text = source.slice(start, end);
  // A pattern (a v-for alias) is walked as an assignment target; the names it declares stay as they are.
  const walked = pattern
    ? ([`[${text}] = []`, start - 1] as const)
    : target
      ? ([`(${text}) = 0`, start - 1] as const)
      : ([text, start] as const);
  eachIdentifier(...walked, (name, from, to, { local, writeRoot }) => {
    if (local || locals.has(name) || (pattern && writeRoot)) return;
    const setup = names.setup.has(name);
    if (!setup && !names.ctx.has(name)) {
      if (!isAllowedGlobal(name) && !names.unknown.has(name)) names.unknown.set(name, [from, to]);
      return;
    }
    (setup ? names.usedSetup : names.usedCtx).add(name);
    b.verbatim(at, from, expr);
    if (writeRoot) {
      // An Atom on the empty range before the name, so an assignment error lands on the name.
      b.atom(setup ? '__vibe_w.' : '__vibe_ctx.', from, from, Preset.NONE);
      names.writes ||= setup;
    }
    b.verbatim(from, to, features ?? Preset.BOUND);
    at = to;
  });
  b.verbatim(at, end, expr);
  // A line comment would swallow the synthesized code that follows.
  if (text.includes('//')) b.add('\n');
}

/** Whether the expression at [start, end) is an assignment target: a name or a member path. */
export function assignable(source: string, [start, end]: [number, number]): boolean {
  let found = false;
  eachIdentifier(`(${source.slice(start, end)}) = 0`, 0, (_, __, ___, { writeRoot }) => {
    found ||= writeRoot;
  });
  return found;
}

/** Whether the inline handler at [start, end) reads `$event`. */
export function readsEvent(source: string, [start, end]: [number, number]): boolean {
  let found = false;
  eachIdentifier(source.slice(start, end), start, (name, _, __, { local }) => {
    found ||= name === '$event' && !local;
  });
  return found;
}

/** The names that a v-for alias (`item`, `{ id, name }`, `[a, b]`) declares. */
export function aliasNames(source: string, [start, end]: [number, number]): string[] {
  const names: string[] = [];
  // As an assignment target, every name the pattern declares is a write root.
  eachIdentifier(`[${source.slice(start, end)}] = []`, start - 1, (name, _, __, info) => {
    if (info.writeRoot) names.push(name);
  });
  return names;
}
