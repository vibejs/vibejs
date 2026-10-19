import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';
import { fixtureFile, fixtures, locations } from '../test/walk.ts';
import { formatDiagnostic } from './diagnostics.ts';
import { analyze } from './script/analyze.ts';
import { compileScript } from './script/compile.ts';
import { parse } from './sfc/parse.ts';

const parsed = fixtures.map(([name, source]) => {
  const { descriptor, diagnostics } = parse(source, { filename: `${name}/input.vibe` });
  const analysis = analyze(descriptor);
  const all = [...diagnostics, ...analysis.diagnostics];
  return {
    name,
    source,
    descriptor,
    analysis,
    diagnostics: all.toSorted((a, b) => a.start.offset - b.start.offset),
  };
});
const snapshot = (name: string) => fileURLToPath(fixtureFile(name, 'diagnostics.txt'));
const scriptSnapshot = (name: string) => fileURLToPath(fixtureFile(name, 'script.ts'));

/** The codes and every `line:column` of a source's descriptor, AST and diagnostics. */
function linesOf(source: string) {
  const { descriptor, diagnostics } = parse(source, { filename: 'input.vibe' });
  const positions = [...locations(descriptor), ...diagnostics].flatMap(({ start, end }) => [
    `${start.line}:${start.column}`,
    `${end.line}:${end.column}`,
  ]);
  return { descriptor, diagnostics: diagnostics.map((d) => d.code), positions };
}

describe('fixtures', () => {
  it.each(parsed.filter((f) => f.diagnostics.length > 0).map((f) => [f.name, f] as const))(
    '%s matches diagnostics.txt',
    async (_, { name, source, diagnostics }) => {
      const text = diagnostics.map((d) => formatDiagnostic(d, source)).join('\n\n');
      await expect(`${text}\n`).toMatchFileSnapshot(snapshot(name));
    },
  );

  it.each(parsed.filter((f) => f.diagnostics.length === 0).map((f) => f.name))(
    '%s is clean and has no diagnostics.txt',
    (name) => {
      expect(existsSync(snapshot(name))).toBe(false);
    },
  );

  const compiled = parsed.filter((f) => f.diagnostics.length === 0 && f.descriptor.scriptSetup);

  it.each(compiled.map((f) => [f.name, f] as const))(
    '%s compiles its script to script.ts',
    async (_, { name, descriptor, analysis }) => {
      const code = compileScript(descriptor, analysis).s.toString();
      expect(parseSync('script.ts', code, { lang: 'ts' }).errors).toStrictEqual([]);
      await expect(code).toMatchFileSnapshot(scriptSnapshot(name));
    },
  );

  it.each(parsed.filter((f) => !compiled.includes(f)).map((f) => f.name))(
    '%s has no script.ts',
    (name) => {
      expect(existsSync(scriptSnapshot(name))).toBe(false);
    },
  );

  // A twin pair is found by name: `<case>` plus `<case>-crlf`.
  const twins = fixtures.filter(([name]) => name.endsWith('-crlf'));

  it.each(twins)('%s has the line:column of its LF twin', (name, crlf) => {
    const lf = fixtures.find(([other]) => `${other}-crlf` === name)![1];
    const a = linesOf(lf);
    const b = linesOf(crlf);
    expect(b.positions).toStrictEqual(a.positions);
    expect(b.diagnostics).toStrictEqual(a.diagnostics);
    expect(b.descriptor.scriptSetup!.content).toBe(
      a.descriptor.scriptSetup!.content.replaceAll('\n', '\r\n'),
    );
  });
});
