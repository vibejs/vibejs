import { expect } from 'vitest';
import { LineIndex, type Diagnostic } from '../src/diagnostics.ts';
import {
  parseParams,
  rewriteExpr,
  type BindingKind,
  type ExprIR,
  type ExprPart,
  type ExprScope,
  type LocalScope,
} from '../src/expr/rewrite.ts';
import type { ExprContext } from '../src/expr/parse.ts';
import { parse } from '../src/sfc/parse.ts';
import {
  NodeTypes,
  type DirectiveNode,
  type InterpolationNode,
  type SimpleExpressionNode,
} from '../src/template/ast.ts';
import { objects } from './walk.ts';

/** An `ExprScope` from plain objects; `locals` lists the names of each scope, outer to inner. */
export function scopeOf(
  bindings: Record<string, BindingKind> = {},
  locals: string[][] = [],
  propAliases: Record<string, string> = {},
): ExprScope {
  return {
    bindings: new Map(Object.entries(bindings)),
    propAliases: new Map(Object.entries(propAliases)),
    locals: locals.map((names): LocalScope => ({ names: new Set(names) })),
  };
}

export interface TemplateExpression {
  exp: SimpleExpressionNode;
  /** The directive of a directive value or a dynamic argument; none for an interpolation. */
  directive?: DirectiveNode;
}

const isInterpolation = (node: object): node is InterpolationNode =>
  'type' in node && node.type === NodeTypes.INTERPOLATION;
const isDirective = (node: object): node is DirectiveNode =>
  'type' in node && node.type === NodeTypes.DIRECTIVE;

/** The interpolations, directive values and dynamic directive arguments of a file's template. */
export function templateExpressions(source: string): TemplateExpression[] {
  const ast = parse(source, { filename: 'A.vibe' }).descriptor.template?.ast;
  return [...objects(ast)].flatMap((node): TemplateExpression[] => {
    if (isInterpolation(node)) return [{ exp: node.content }];
    if (!isDirective(node)) return [];
    const directive = node;
    const { arg, exp } = directive;
    return [arg && !arg.isStatic ? arg : undefined, exp]
      .filter((e) => e !== undefined)
      .map((e) => ({ exp: e, directive }));
  });
}

/** The generated text of `parts`. */
const joined = (parts: ExprPart[]): string =>
  parts.map((p) => (typeof p === 'string' ? p : p.code)).join('');

/** A rewrite context for `source`, collecting into a fresh diagnostics array. */
export const contextOf = (source: string): ExprContext => ({
  file: 'A.vibe',
  lines: new LineIndex(source),
  diagnostics: [],
});

/** Asserts that every mapped part of `ir` is the user text at its offset in `source`. */
function expectMapped(source: string, ir: ExprIR | null): void {
  for (const part of ir?.parts ?? []) {
    if (typeof part !== 'string') {
      expect(source.slice(part.offset, part.offset + part.code.length)).toBe(part.code);
    }
  }
}

/**
 * Rewrites the `nth` expression of `<template>${template}</template>`: v-on values in handler
 * mode, everything else in expression mode. Checks the source mapping of the result.
 */
export function rewrite(
  template: string,
  scope: ExprScope = scopeOf(),
  nth = 0,
): { ir: ExprIR | null; code: string | null; diagnostics: Diagnostic[] } {
  const source = `<template>${template}</template>`;
  const { exp, directive } = templateExpressions(source)[nth];
  const ctx = contextOf(source);
  const handler = directive?.name === 'on' && exp === directive.exp;
  const ir = rewriteExpr(exp, handler ? 'handler' : 'expression', scope, ctx);
  expectMapped(source, ir);
  return { ir, code: ir && joined(ir.parts), diagnostics: ctx.diagnostics };
}

/**
 * Runs every expression of a file the way the template transform calls it: v-for aliases and
 * v-slot values through `parseParams`, v-on values as handlers, everything else as expressions.
 */
export function compileExpressions(source: string, scope: ExprScope): Diagnostic[] {
  const ctx = contextOf(source);
  for (const { exp, directive } of templateExpressions(source)) {
    const forParts = directive?.name === 'for' ? directive.forParseResult : undefined;
    if (forParts) {
      for (const alias of [forParts.value, forParts.key, forParts.index]) {
        if (alias) parseParams(alias, ctx);
      }
      expectMapped(source, rewriteExpr(forParts.source, 'expression', scope, ctx));
    } else if (directive?.name === 'slot' && exp === directive.exp) {
      parseParams(exp, ctx);
    } else {
      const mode = directive?.name === 'on' && exp === directive.exp ? 'handler' : 'expression';
      expectMapped(source, rewriteExpr(exp, mode, scope, ctx));
    }
  }
  return ctx.diagnostics;
}
