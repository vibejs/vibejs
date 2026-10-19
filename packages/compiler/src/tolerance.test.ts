import { describe, expect, it } from 'vitest';
import { contextOf, scopeOf, templateExpressions } from '../test/expr.ts';
import { fixtures, locations } from '../test/walk.ts';
import { LineIndex, type Position } from './diagnostics.ts';
import { forEachIdentifier } from './expr/index.ts';
import { parseParams, rewriteExpr } from './expr/rewrite.ts';
import { analyze } from './script/analyze.ts';
import { compileScript } from './script/compile.ts';
import { parse } from './sfc/parse.ts';

/** Parses `source` and lists every location of the descriptor, the AST or the diagnostics that is wrong. */
function problems(source: string): string[] {
  const { descriptor, diagnostics } = parse(source, { filename: 'input.vibe' });
  const lines = new LineIndex(source);
  const bad: string[] = [];
  const position = (p: Position) => {
    const { line, column } = lines.position(p.offset);
    if (p.line !== line || p.column !== column)
      bad.push(`${p.offset} is not ${p.line}:${p.column}`);
  };
  for (const loc of [...locations(descriptor), ...diagnostics]) {
    const { start, end } = loc;
    if (!(start.offset >= 0 && start.offset <= end.offset && end.offset <= source.length)) {
      bad.push(`${start.offset}-${end.offset} is out of bounds`);
    }
    if ('source' in loc && loc.source !== source.slice(start.offset, end.offset)) {
      bad.push(`${start.offset}-${end.offset} has the source ${JSON.stringify(loc.source)}`);
    }
    position(start);
    position(end);
  }
  return bad.map((b) => `${JSON.stringify(source)}: ${b}`);
}

/** Analyzes and compiles the script of `source` and lists every range that is out of bounds. */
function scriptProblems(source: string): string[] {
  const { descriptor } = parse(source, { filename: 'input.vibe' });
  const a = analyze(descriptor);
  compileScript(descriptor, a).s.toString();
  const ranges: [number, number][] = [
    ...[...a.bindings.values()].map((b) => b.decl),
    ...a.propKeys.map((k) => k.decl),
    ...[a.macros.props, a.macros.emits, a.macros.slots].flatMap((m) => (m ? [m.typeArg] : [])),
    ...a.templateRefs.flatMap((r): [number, number][] => [
      r.keyLoc,
      [r.typeArgInsertAt ?? 0, r.typeArgInsertAt ?? 0],
    ]),
    ...a.importRanges,
    ...a.edits.map((e): [number, number] => [e.start, e.end]),
    ...a.diagnostics.map((d): [number, number] => [d.start.offset, d.end.offset]),
  ];
  return ranges
    .filter(([start, end]) => !(start >= 0 && start <= end && end <= source.length))
    .map(([start, end]) => `${JSON.stringify(source)}: ${start}-${end} is out of bounds`);
}

const scripts = fixtures.filter(([name]) => name.startsWith('script/')).slice(0, 5);

const withTemplate = fixtures
  .filter(([name]) => !name.startsWith('script/'))
  .filter(([, source]) => parse(source, { filename: 'input.vibe' }).descriptor.template)
  .slice(0, 10);

describe('tolerance', () => {
  it.each(fixtures)('%s cut at every 7th character', (_, source) => {
    const bad: string[] = [];
    for (let end = 0; end <= source.length; end += 7) bad.push(...problems(source.slice(0, end)));
    expect(bad).toStrictEqual([]);
  });

  it.each(fixtures)('%s: the script cut at every 7th character', (_, source) => {
    const bad: string[] = [];
    for (let end = 0; end <= source.length; end += 7)
      bad.push(...scriptProblems(source.slice(0, end)));
    expect(bad).toStrictEqual([]);
  });

  it.each(scripts)('%s without one character of its script', (_, source) => {
    const { loc } = parse(source, { filename: 'input.vibe' }).descriptor.scriptSetup!;
    const bad: string[] = [];
    for (let i = loc.start.offset; i < loc.end.offset; i++) {
      bad.push(...scriptProblems(source.slice(0, i) + source.slice(i + 1)));
    }
    expect(bad).toStrictEqual([]);
  });

  it.each(withTemplate)('%s without one character of its template', (_, source) => {
    const { loc } = parse(source, { filename: 'input.vibe' }).descriptor.template!;
    const bad: string[] = [];
    for (let i = loc.start.offset; i < loc.end.offset; i++) {
      bad.push(...problems(source.slice(0, i) + source.slice(i + 1)));
    }
    expect(bad).toStrictEqual([]);
  });

  it.each(fixtures)('%s: every prefix of every template expression', (_, source) => {
    const bad: string[] = [];
    for (const { exp } of templateExpressions(source)) {
      const start = exp.loc.start.offset;
      for (let length = 0; length <= exp.content.length; length++) {
        const content = exp.content.slice(0, length);
        const end = start + length;
        const cut = {
          ...exp,
          content,
          loc: { ...exp.loc, source: exp.loc.source.slice(0, length) },
        };
        const ctx = contextOf(source);
        rewriteExpr(cut, 'expression', scopeOf(), ctx);
        rewriteExpr(cut, 'handler', scopeOf(), ctx);
        parseParams(cut, ctx);
        forEachIdentifier(content, start, (name, from, to) => {
          if (from < start || to > end)
            bad.push(`${JSON.stringify(content)}: ${name} at ${from}-${to}`);
        });
        for (const d of ctx.diagnostics) {
          if (!(start <= d.start.offset && d.start.offset <= d.end.offset && d.end.offset <= end)) {
            bad.push(`${JSON.stringify(content)}: ${d.code} at ${d.start.offset}-${d.end.offset}`);
          }
        }
      }
    }
    expect(bad).toStrictEqual([]);
  });
});
