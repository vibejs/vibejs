// The tool contract: the pinned real tools (tsc from catalog:ts-next, oxlint, oxfmt, vitest with
// coverage-v8) run through the built bin on copies of test/fixtures/broken and clean.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { parseCoverage, parseOxfmt, parseOxlint, parseTsc, parseVitest } from './check/parse.ts';
import type { CheckDiagnostic, CheckResult } from './output.ts';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const MODULES = fileURLToPath(new URL('../node_modules', import.meta.url));
const tool = (name: string) =>
  readFileSync(new URL(`../test/fixtures/tools/${name}`, import.meta.url), 'utf8');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A temp copy of a fixture project with node_modules linked to the CLI's (a junction on Windows). */
function copy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `vibejs-${name}-`));
  dirs.push(dir);
  cpSync(new URL(`../test/fixtures/${name}`, import.meta.url), dir, { recursive: true });
  symlinkSync(MODULES, join(dir, 'node_modules'), 'junction');
  return dir;
}

// The child tools must not see the Vitest worker that runs this test.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')),
);

function check(cwd: string, ...args: string[]): { status: number | null; r: CheckResult } {
  const { status, stdout } = spawnSync(process.execPath, [BIN, 'check', '--json', ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });
  return { status, r: JSON.parse(stdout) };
}

/** Diagnostics without the enrichment (docs, fixes), in a stable order. */
const plain = (ds: CheckDiagnostic[]) =>
  ds
    .map(({ docs: _docs, fixes: _fixes, ...d }) => d)
    .toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const out = (stdout: string, code: number) => ({ code, stdout, stderr: '' });

it('parses the real output on broken/ to the recorded diagnostics', { timeout: 60_000 }, () => {
  const recorded = [
    ...parseTsc(out(tool('tsc.txt'), 2), '/project')!,
    ...parseOxlint(out(tool('oxlint.json'), 1), '/project')!,
    ...parseOxfmt(out(tool('oxfmt.txt'), 1), '/project')!,
    ...parseVitest(tool('vitest.json'), '/project')!.diagnostics,
    ...parseCoverage(tool('coverage-final.json'), '/project')!.diagnostics,
  ];
  const { status, r } = check(copy('broken'));
  expect(status).toBe(1);
  expect(r.ok).toBe(false);
  expect(plain(r.diagnostics)).toEqual(plain(recorded));
  expect(r.diagnostics.find((d) => d.code === 'TS1241')!.docs).toMatch(/\/server\/handlers$/);
});

it('passes clean/ with full coverage', { timeout: 60_000 }, () => {
  const { status, r } = check(copy('clean'));
  expect(r.diagnostics).toEqual([]);
  expect(status).toBe(0);
  expect(r.ok).toBe(true);
  expect(r.steps.coverage).toMatchObject({ status: 'passed', filesBelow100: 0, branches: 100 });
});

it(
  'keeps coverage below 100% a warning when the thresholds opt-in fails vitest',
  {
    timeout: 60_000,
  },
  () => {
    const dir = copy('clean');
    const edit = (file: string, from: string, to: string) => {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text).toContain(from);
      writeFileSync(join(dir, file), text.replace(from, to));
    };
    edit('src/app.test.ts', '  expect(sign(-2)).toBe(-1);\n', '');
    edit('vitest.config.ts', '// thresholds', 'thresholds');
    const { status, r } = check(dir);
    expect(status).toBe(0);
    expect(r.ok).toBe(true);
    expect(r.diagnostics.map((d) => [d.code, d.severity, d.file])).toEqual([
      ['VIBE8302', 'warning', 'src/math.ts'],
    ]);
    expect(r.steps.coverage.filesBelow100).toBe(1);
  },
);

it('--fix leaves no format and no fixable lint diagnostics', { timeout: 60_000 }, () => {
  const dir = copy('broken');
  check(dir, '--fix');
  const { r } = check(dir);
  expect(r.diagnostics.filter((d) => d.source === 'oxfmt' || d.source === 'oxlint')).toEqual([]);
  expect(r.steps).toMatchObject({ lint: { status: 'passed' }, format: { status: 'passed' } });
});
