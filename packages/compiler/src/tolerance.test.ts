import { describe, expect, it } from 'vitest';
import { fixtures, locations } from '../test/walk.ts';
import { LineIndex, type Position } from './diagnostics.ts';
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

const withTemplate = fixtures
  .filter(([, source]) => parse(source, { filename: 'input.vibe' }).descriptor.template)
  .slice(0, 10);

describe('tolerance', () => {
  it.each(fixtures)('%s cut at every 7th character', (_, source) => {
    const bad: string[] = [];
    for (let end = 0; end <= source.length; end += 7) bad.push(...problems(source.slice(0, end)));
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
});
