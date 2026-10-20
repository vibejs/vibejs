import { parseExpression, parseSimpleHandler, parseStatements } from './parse.ts';
import { walk, type Identifier, type RefInfo } from './walk.ts';

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
  const refs: [Identifier, RefInfo][] = [];
  walk(parsed.node, { ref: (id, info) => refs.push([id, info]) });
  const shift = offset - parsed.prefix;
  for (const [id, info] of refs.toSorted(([a], [b]) => a.start - b.start)) {
    cb(id.name, id.start + shift, id.end + shift, info);
  }
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
