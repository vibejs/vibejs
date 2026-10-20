import { parseSync } from 'oxc-parser';
import {
  moduleOnly,
  PARSE_OPTIONS,
  parseExpression,
  parseSimpleHandler,
  parseStatements,
} from './parse.ts';
import { children, walk, type Node, type RefInfo } from './walk.ts';

type Ref = [name: string, start: number, end: number, info: RefInfo];

/** The globals a template reads by their bare name. */
export const GLOBALS: ReadonlySet<string> = new Set(
  'Infinity undefined NaN isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent encodeURI encodeURIComponent Math Number Date Array Object Boolean String RegExp Map Set JSON Intl BigInt console Error Symbol'.split(
    ' ',
  ),
);

/** Whether a template reads `name` as a global. */
export function isAllowedGlobal(name: string): boolean {
  return GLOBALS.has(name);
}

/**
 * Calls `cb` for each identifier reference of `expr`, parsed as an expression or else as
 * statements, in source order. `offset` is the file offset of `expr[0]`; `start` and `end` are
 * file offsets. `local` means bound inside `expr`; `writeRoot` means the root of an assignment or
 * update target. On a syntax error it calls nothing.
 */
export function forEachIdentifier(
  expr: string,
  offset: number,
  cb: (
    name: string,
    start: number,
    end: number,
    info: { local: boolean; writeRoot: boolean },
  ) => void,
): void {
  const expression = parseExpression(expr);
  const parsed = 'reason' in expression ? parseStatements(expr) : expression;
  if ('reason' in parsed) return;
  for (const ref of references(parsed.node, parsed.prefix - offset)) cb(...ref);
}

/** The references under `node` in source order, at its offsets minus `shift`. */
function references(node: Node, shift: number): Ref[] {
  const refs: Ref[] = [];
  walk(node, { ref: (id, info) => refs.push([id.name, id.start - shift, id.end - shift, info]) });
  return refs.toSorted((a, b) => a[1] - b[1]);
}

/**
 * The identifier references of each text, from one parse of all of them: `refs[i]` lists texts[i]'s
 * references in source order with offsets relative to texts[i], exactly as
 * `forEachIdentifier(texts[i], 0, cb)` reports them; `[]` where texts[i] does not parse.
 */
export function identifiersOf(texts: readonly string[]): Ref[][] {
  const refs: Ref[][] = texts.map(() => []);
  /** The texts that need a parse of their own. */
  const alone = new Set<number>();
  let batch = texts.map((_, i) => i);
  while (batch.length > 0) {
    // Each text is a statement `(text);`, wrapped as `forEachIdentifier` wraps it, one per line.
    const starts: number[] = [];
    let code = '';
    for (const i of batch) {
      starts.push(code.length);
      code += `(${texts[i]});\n`;
    }
    const { program, errors, module } = parseSync('e.ts', code, PARSE_OPTIONS);
    const root: Node = { ...program };
    const body = children(root, 'body');
    // Module code parses some texts differently (strict code, no HTML comments): the texts with an
    // error or module syntax, or else all of them, are parsed alone and the others again together.
    if (errors.length > 0 || module.hasModuleSyntax) {
      // oxc reports every error with a primary label; the default keeps a label-less one in bounds.
      const at =
        errors.length > 0
          ? errors.map((e) => Object.assign({ start: code.length }, e.labels[0]).start)
          : body.filter((s) => moduleOnly(s)).map((s) => s.start);
      const bad =
        at.length === 0
          ? batch
          : at.map((offset) => batch[starts.findLastIndex((start) => start <= offset)]);
      for (const i of bad) alone.add(i);
      batch = batch.filter((i) => !alone.has(i));
      continue;
    }
    // A text is placed when its slot holds only its own statement. An expression that starts at
    // the slot escapes the wrapper, as in `a), (b`.
    const placed = new Map<number, Node | undefined>();
    let slot = 0;
    for (const statement of body) {
      while (starts[slot + 1] <= statement.start) slot++;
      const whole =
        !placed.has(slot) &&
        statement.start === starts[slot] &&
        statement.end === starts[slot] + texts[batch[slot]].length + 3;
      const node = whole ? children(statement, 'expression')[0] : undefined;
      placed.set(slot, node && node.start > starts[slot] ? node : undefined);
    }
    batch.forEach((i, k) => {
      const node = placed.get(k);
      if (node) refs[i] = references(node, starts[k] + 1);
      else alone.add(i);
    });
    break;
  }
  for (const i of alone) forEachIdentifier(texts[i], 0, (...ref) => refs[i].push(ref));
  return refs;
}

/** Whether a v-on value is a member path (`a`, `a.b`, `a['b']`, `a?.b`) or a function or arrow. */
export function isSimpleHandler(expr: string): boolean {
  return parseSimpleHandler(expr) !== undefined;
}

/** `'foo-bar'` -> `'fooBar'` */
export function camelize(s: string): string {
  return s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}

/** `'fooBar'` -> `'foo-bar'` */
export function hyphenate(s: string): string {
  return s.replace(/\B([A-Z])/g, '-$1').toLowerCase();
}

/** `'foo'` -> `'Foo'` */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
