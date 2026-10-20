import { describe, expect, it } from 'vitest';
import { codegen, compiler, typecheck } from '../test/fixtures.ts';
import { invariantErrors } from '../test/invariants.ts';
import { generate } from './generate.ts';

/** The prefix lengths: 20 evenly spaced, and before and after every `<`, `"` and `{{`. */
function cuts(source: string): number[] {
  const at = new Set(Array.from({ length: 20 }, (_, i) => Math.floor((source.length * i) / 19)));
  for (const m of source.matchAll(/<|"|\{\{/g)) at.add(m.index).add(m.index + m[0].length);
  return [...at].toSorted((a, b) => a - b);
}

// Every state a user passes through while typing a file.
describe.each([codegen, typecheck, compiler].flat())('%s', (name, source) => {
  it('generates every prefix, keeping the invariants', () => {
    const broken = cuts(source).flatMap((end) => {
      const prefix = source.slice(0, end);
      return invariantErrors(prefix, generate(name, prefix)).map((error) => `${end}: ${error}`);
    });
    expect(broken).toEqual([]);
  });
});
