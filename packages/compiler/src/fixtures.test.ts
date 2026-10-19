import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';
import { fixtureFile, fixtures, locations } from '../test/walk.ts';
import { compile } from './compile.ts';
import { formatDiagnostic } from './diagnostics.ts';
import { analyze } from './script/analyze.ts';
import { compileScript } from './script/compile.ts';
import { parse } from './sfc/parse.ts';

const parsed = fixtures.map(([name, source]) => {
  const result = compile(source, { filename: `${name}/input.vibe`, id: '0a1b2c3d', dev: false });
  const { descriptor, diagnostics } = result;
  const analysis = analyze(descriptor);
  const parseClean = parse(source, { filename: name }).diagnostics.length === 0;
  const scriptClean = parseClean && analysis.diagnostics.length === 0;
  return { name, source, descriptor, analysis, result, scriptClean, diagnostics };
});
const snapshot = (name: string) => fileURLToPath(fixtureFile(name, 'diagnostics.txt'));
const scriptSnapshot = (name: string) => fileURLToPath(fixtureFile(name, 'script.ts'));
const outputSnapshot = (name: string, file = 'output.ts') => fileURLToPath(fixtureFile(name, file));

/** Asserts that generated code parses as TypeScript. */
const expectParses = (code: string) =>
  expect(
    parseSync('output.ts', code, { lang: 'ts', showSemanticErrors: true }).errors,
  ).toStrictEqual([]);

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

  const clean = parsed.filter((f) => f.diagnostics.length === 0);

  it.each(clean.map((f) => [f.name, f] as const))(
    '%s compiles to output.ts',
    async (_, { name, result }) => {
      expectParses(result.code);
      await expect(result.code).toMatchFileSnapshot(outputSnapshot(name));
    },
  );

  it.each(parsed.filter((f) => !clean.includes(f)).map((f) => f.name))(
    '%s has no output.ts',
    (name) => {
      expect(existsSync(outputSnapshot(name))).toBe(false);
    },
  );

  it('compiles template/todo-list in dev mode to output.dev.ts', async () => {
    const name = 'template/todo-list';
    const { source } = clean.find((f) => f.name === name)!;
    const { code } = compile(source, { filename: `${name}/input.vibe`, id: '0a1b2c3d', dev: true });
    expectParses(code);
    await expect(code).toMatchFileSnapshot(outputSnapshot(name, 'output.dev.ts'));
  });

  it('has at least 10 output.ts fixtures', () => {
    expect(clean.length).toBeGreaterThanOrEqual(10);
  });

  // A fixture with output.ts shows its script there; script.ts covers files whose script
  // compiles while the template reports diagnostics.
  const scripts = parsed.filter(
    (f) => f.scriptClean && f.descriptor.scriptSetup && !clean.includes(f),
  );

  it.each(scripts.map((f) => [f.name, f] as const))(
    '%s compiles its script to script.ts',
    async (_, { name, descriptor, analysis }) => {
      const code = compileScript(descriptor, analysis).s.toString();
      expectParses(code);
      await expect(code).toMatchFileSnapshot(scriptSnapshot(name));
    },
  );

  it.each(parsed.filter((f) => !scripts.includes(f)).map((f) => f.name))(
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
