import type { VibeError } from '@vibejs-org/errors';
import { parseSync, visitorKeys } from 'oxc-parser';
import { toDiagnostic, type Diagnostic, type LineIndex } from '../diagnostics.ts';
import { children, FUNCTIONS, type Node } from './walk.ts';

export interface ExprContext {
  file: string;
  lines: LineIndex;
  diagnostics: Diagnostic[];
}

/** A parse result. Node spans minus `prefix` (the wrapper text before the content) are content indexes. */
export interface Parsed {
  kind: 'expression' | 'path' | 'function' | 'statements';
  node: Node;
  prefix: number;
}

/** A syntax error, at content indexes. */
export interface Failure {
  reason: string;
  start: number;
  end: number;
}

const TYPE_CHECKED = new Set(['VIBE1201', 'VIBE1202', 'VIBE1203', 'VIBE2001', 'VIBE2007']);

/** Pushes `error` at the file range [start, end) and returns the diagnostic. */
export function report(ctx: ExprContext, error: VibeError, start: number, end: number): Diagnostic {
  const { file, lines, diagnostics } = ctx;
  const d = toDiagnostic(error, file, lines.position(start), lines.position(end));
  if (TYPE_CHECKED.has(d.code)) d.typeChecked = true;
  diagnostics.push(d);
  return d;
}

/** `await a` or `await using x = a`. */
const isAwait = (node: Node) => node.type === 'AwaitExpression' || node.kind === 'await using';

/**
 * The first node under `node`, outside nested functions, that is valid only in a module:
 * `await`, an `import` or an `export`.
 */
function moduleOnly(node: Node): Node | undefined {
  if (isAwait(node) || node.type === 'ImportDeclaration' || /^(TS)?Export/.test(node.type)) {
    return node;
  }
  if (FUNCTIONS.has(node.type)) return undefined;
  for (const key of visitorKeys[node.type]) {
    for (const child of children(node, key)) {
      const found = moduleOnly(child);
      if (found) return found;
    }
  }
  return undefined;
}

/** Parses `text`, whose content of `length` starts at `prefix`. */
function parseProgram(text: string, prefix: number, length: number): { root: Node } | Failure {
  const { program, errors, module } = parseSync('e.ts', text, {
    lang: 'ts',
    preserveParens: false,
  });
  const clamp = (offset: number) => Math.min(Math.max(offset - prefix, 0), length);
  if (errors.length === 0) {
    const root: Node = { ...program };
    // Templates render in a plain function, where module syntax is invalid.
    const found = module.hasModuleSyntax ? moduleOnly(root) : undefined;
    if (!found) return { root };
    const what = isAwait(found) ? '`await`' : '`import` and `export`';
    const reason = `${what} cannot be used outside a function in a template`;
    return { reason, start: clamp(found.start), end: clamp(found.end) };
  }
  // oxc reports every error with a primary label; the defaults keep a label-less one in bounds.
  const label = Object.assign({ start: prefix, end: prefix + length }, errors[0].labels[0]);
  return { reason: errors[0].message, start: clamp(label.start), end: clamp(label.end) };
}

/**
 * The expression of the first statement of `root` when that statement is an expression statement
 * spanning all `length` characters. The wrapper's `(` always starts a statement.
 */
function single(root: Node, length: number): Node | undefined {
  const [statement] = children(root, 'body');
  return statement.type === 'ExpressionStatement' && statement.end === length
    ? children(statement, 'expression')[0]
    : undefined;
}

/** Parses a template expression. */
export function parseExpression(content: string): Parsed | Failure {
  const text = `(${content})`;
  const parsed = parseProgram(text, 1, content.length);
  if ('reason' in parsed) return parsed;
  const node = single(parsed.root, text.length);
  // Without preserved parentheses, an expression inside the wrapper starts after its `(`. One that
  // starts at 0 escapes it, as in `a), (b`.
  return node && node.start > 0
    ? { kind: 'expression', node, prefix: 1 }
    : { reason: 'Expected a single expression', start: 0, end: content.length };
}

/** Parses a statement list. */
export function parseStatements(content: string): Parsed | Failure {
  const parsed = parseProgram(content, 0, content.length);
  return 'reason' in parsed ? parsed : { kind: 'statements', node: parsed.root, prefix: 0 };
}

/** Parses an event handler: a member path, a function or arrow, or else a statement list. */
export function parseHandler(content: string): Parsed | Failure {
  return parseSimpleHandler(content) ?? parseStatements(content);
}

/** Parses an event handler that is a member path or a function or arrow. */
export function parseSimpleHandler(content: string): Parsed | undefined {
  const parsed = parseExpression(content);
  if ('reason' in parsed) return undefined;
  const { node } = parsed;
  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    return { ...parsed, kind: 'function' };
  }
  const path = node.type === 'ChainExpression' ? children(node, 'expression')[0].type : node.type;
  if (path === 'Identifier' || path === 'MemberExpression') return { ...parsed, kind: 'path' };
  return undefined;
}

/** Parses a parameter list (v-for aliases, v-slot props) into an arrow function node. */
export function parseParams(content: string): Parsed | Failure {
  const text = `(${content}) => {}`;
  const parsed = parseProgram(text, 1, content.length);
  if ('reason' in parsed) return parsed;
  const node = single(parsed.root, text.length);
  // The body must be the wrapper's own `{}`: `a) => (b` would otherwise parse as a curried arrow.
  return node?.type === 'ArrowFunctionExpression' &&
    children(node, 'body')[0].start === text.length - 2
    ? { kind: 'expression', node, prefix: 1 }
    : { reason: 'Expected a parameter list', start: 0, end: content.length };
}
