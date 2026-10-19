import { vibeError } from '../errors.gen.ts';
import type { BindingKind } from '../script/analyze.ts';
import type { SimpleExpressionNode } from '../template/ast.ts';
import { GLOBALS, isAllowedGlobal } from './index.ts';
import {
  parseExpression,
  parseHandler,
  parseParams as parseParamList,
  report,
  type ExprContext,
} from './parse.ts';
import { walk, type Identifier } from './walk.ts';

export type { BindingKind } from '../script/analyze.ts';

/** One v-for or v-slot scope. Its identity tells codegen which preludes an expression needs. */
export interface LocalScope {
  readonly names: ReadonlySet<string>;
}

export interface ExprScope {
  bindings: ReadonlyMap<string, BindingKind>;
  /** alias -> prop key */
  propAliases: ReadonlyMap<string, string>;
  /** outer to inner */
  locals: readonly LocalScope[];
}

/** Strings are generated text; objects are user text at a file offset. */
export type ExprPart = string | { code: string; offset: number };

export interface ExprIR {
  /** `path`, `function` and `statements` come only from handler mode. */
  kind: 'expression' | 'path' | 'function' | 'statements';
  parts: ExprPart[];
  /** The template scopes the expression references. */
  scopes: Set<LocalScope>;
}

/** Instance-only names. Their replacements are listed in the fixes of VIBE2008. */
const INSTANCE = new Set([
  '$el',
  '$refs',
  '$parent',
  '$root',
  '$options',
  '$data',
  '$nextTick',
  '$watch',
  '$forceUpdate',
]);
const CONTEXT: ReadonlyMap<string, string> = new Map([
  ['$attrs', '$ctx.attrs'],
  ['$slots', '$ctx.slots'],
  ['$emit', '$ctx.emit'],
  ['$props', '$props'],
]);
/** The render parameters (C3), which a template local must not shadow. */
const RESERVED = new Set(['$setup', '$props', '$ctx']);

/** The Levenshtein distance of `a` and `b`, or 3 once it is known to be above 2. */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

/** The closest other name within edit distance 2, the first one on a tie. */
function closest(name: string, names: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const candidate of names) {
    const d = distance(name, candidate);
    if (d > 0 && d < bestDistance) [best, bestDistance] = [candidate, d];
  }
  return best;
}

/**
 * Parses a template expression and rewrites its free identifiers for the render function
 * `($setup, $props, $ctx)`. Returns null after a syntax error (VIBE1201, VIBE1202); unknown names
 * (VIBE2007), instance access (VIBE2008) and reserved locals (VIBE2010) are reported and the
 * name is kept as written.
 */
export function rewriteExpr(
  exp: SimpleExpressionNode,
  mode: 'expression' | 'handler',
  scope: ExprScope,
  ctx: ExprContext,
): ExprIR | null {
  const { content } = exp;
  const base = exp.loc.start.offset;
  const parsed = mode === 'handler' ? parseHandler(content) : parseExpression(content);
  if ('reason' in parsed) {
    const { reason, start, end } = parsed;
    const code = mode === 'handler' ? 'VIBE1202' : 'VIBE1201';
    report(ctx, vibeError(code, { reason }), base + start, base + end);
    return null;
  }
  const { kind, node, prefix } = parsed;
  // Decoded entities (`&amp;`) make the content shorter than its source: its offsets are then
  // in bounds but not exact, so user text is emitted unmapped.
  const mapped = content === exp.loc.source;
  const user = (from: number, to: number): ExprPart => {
    const code = content.slice(from, to);
    return mapped ? { code, offset: base + from } : code;
  };
  const scopes = new Set<LocalScope>();
  const edits: { start: number; end: number; parts: ExprPart[] }[] = [];
  const at = (id: { start: number; end: number }) =>
    [base + id.start - prefix, base + id.end - prefix] as const;

  /** The replacement parts of a free name, whose user text is `original`, or undefined to keep it. */
  const resolve = (
    id: Identifier,
    original: ExprPart,
    visible: readonly Set<string>[],
  ): ExprPart[] | undefined => {
    const { name } = id;
    switch (scope.bindings.get(name)) {
      case 'prop':
        return ['$props.', original];
      case 'prop-alias':
        return [`$props.${scope.propAliases.get(name)}`];
      case 'import':
        return undefined;
      case 'const':
      case 'maybe-ref':
      case 'let':
        return ['$setup.', original];
      case undefined:
        break;
    }
    const context = CONTEXT.get(name);
    if (context !== undefined) return context === name ? undefined : [context];
    if (isAllowedGlobal(name)) return undefined;
    if (INSTANCE.has(name)) {
      report(ctx, vibeError('VIBE2008', { name }), ...at(id));
      return undefined;
    }
    const d = report(ctx, vibeError('VIBE2007', { name }), ...at(id));
    const names = [
      ...scope.bindings.keys(),
      ...scope.locals.flatMap((local) => [...local.names]),
      ...visible.flatMap((local) => [...local]),
      ...CONTEXT.keys(),
      ...GLOBALS,
    ];
    const suggestion = closest(name, names);
    if (suggestion !== undefined) {
      d.fixes = [`Write \`${suggestion}\`, the closest name in scope.`, ...d.fixes];
    }
    return undefined;
  };

  walk(
    node,
    {
      ref(id, { local }, shorthand, visible) {
        if (local) return;
        const hit = scope.locals.findLast((s) => s.names.has(id.name));
        if (hit) {
          scopes.add(hit);
          return;
        }
        const [start, end] = [id.start - prefix, id.end - prefix];
        const parts = resolve(id, user(start, end), visible);
        // A shorthand property `{ a }` becomes `{ a: <replacement> }`.
        if (parts)
          edits.push({ start, end, parts: shorthand ? [user(start, end), ': ', ...parts] : parts });
      },
      bind(id) {
        if (RESERVED.has(id.name)) report(ctx, vibeError('VIBE2010', { name: id.name }), ...at(id));
      },
      this(expression) {
        report(ctx, vibeError('VIBE2008', { name: 'this' }), ...at(expression));
      },
    },
    kind === 'statements' ? ['$event'] : [],
  );

  const parts: ExprPart[] = [];
  let done = 0;
  for (const edit of edits.toSorted((a, b) => a.start - b.start)) {
    if (edit.start > done) parts.push(user(done, edit.start));
    parts.push(...edit.parts);
    done = edit.end;
  }
  if (done < content.length) parts.push(user(done, content.length));
  return { kind, parts, scopes };
}

/**
 * Parses the parameter list of a v-for alias or of v-slot props into the template scope it
 * declares. Returns null after VIBE1203; a reserved name (VIBE2010) is reported and kept.
 */
export function parseParams(exp: SimpleExpressionNode, ctx: ExprContext): LocalScope | null {
  const base = exp.loc.start.offset;
  const parsed = parseParamList(exp.content);
  if ('reason' in parsed) {
    const { reason, start, end } = parsed;
    report(ctx, vibeError('VIBE1203', { reason }), base + start, base + end);
    return null;
  }
  const names = new Set<string>();
  const shift = base - parsed.prefix;
  walk(parsed.node, {
    ref() {},
    bind({ name, start, end }) {
      names.add(name);
      if (name.startsWith('_') || RESERVED.has(name)) {
        report(ctx, vibeError('VIBE2010', { name }), shift + start, shift + end);
      }
    },
  });
  return { names };
}
