// The typecheck corpus and the demo: the pinned TypeScript 7.1 (catalog:ts-next) runs the built
// content mapper through `tsc -b --runExternalCode` on temp copies of test/fixtures/typecheck.
// Every run passes --force: tsc caches mapper output by package version, which stays the same
// while the mapper changes in this repository.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const TSC = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const FIXTURES = fileURLToPath(new URL('../test/fixtures/typecheck', import.meta.url));
const PACKAGES = fileURLToPath(new URL('../..', import.meta.url));
/** The line format that `vibejs check` parses (CONTRACTS C6). */
const C6 = /^(.+?)\((\d+),(\d+)\): (error|warning) ([A-Z]+\d+): (.*)/;
const VIRTUAL = 'virtual code produced by the content mapper';

// The child must not see the Vitest worker that runs this test.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')),
);

// A temp copy with the mapper and ui linked as direct dependencies (a junction on Windows).
const root = mkdtempSync(join(tmpdir(), 'vibejs-typecheck-'));
cpSync(FIXTURES, root, { recursive: true });
mkdirSync(join(root, 'node_modules/@vibejs-org'), { recursive: true });
for (const name of ['language-tools', 'ui']) {
  symlinkSync(join(PACKAGES, name), join(root, 'node_modules/@vibejs-org', name), 'junction');
}
afterAll(() => rmSync(root, { recursive: true, force: true }));

function tsc(cwd: string, ...args: string[]) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [TSC, '-b', ...args, '--runExternalCode', '--pretty', 'false', '--force'],
    { cwd, env, encoding: 'utf8' },
  );
  expect(stderr).toBe('');
  // An indented line continues the diagnostic above it.
  const diagnostics = stdout.split(/\r?\n(?! )/).filter(Boolean);
  return { status, diagnostics };
}

/** The `_fail_` case of a diagnostic line. */
const failing = (d: string) => /^cases\/(_fail_[^/]+)\//.exec(d)?.[1];

/** The 1-based line and UTF-16 column of `offset`. */
function position(text: string, offset: number): string {
  const before = text.slice(0, offset).split('\n');
  return `${before.length},${before.at(-1)!.length + 1}`;
}

describe('corpus', () => {
  const cases = readdirSync(join(root, 'cases')).toSorted();
  const { status, diagnostics } = tsc(root, ...cases.map((c) => `cases/${c}`));

  it('has at least 20 cases, one tsc project each', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(status).not.toBe(0);
  });

  it('reports errors only in _fail_ cases, at least one in each', () => {
    expect(diagnostics.filter((d) => !failing(d))).toEqual([]);
    const reported = new Set(diagnostics.map(failing));
    expect(cases.filter((c) => c.startsWith('_fail_') && !reported.has(c))).toEqual([]);
  });

  it('never reports a location in generated code', () => {
    for (const d of diagnostics) expect(d).not.toContain(VIRTUAL);
  });

  it('forwards an HTML parse error as a VIBE11xx code that the C6 pattern extracts', () => {
    const [line] = diagnostics.filter((d) => d.startsWith('cases/_fail_html-parse/'));
    expect(C6.exec(line)?.slice(1, 6)).toEqual([
      'cases/_fail_html-parse/App.vibe',
      '6',
      '17',
      'error',
      'VIBE1102',
    ]);
  });

  it('reports every error at its .vibe or .ts position', async () => {
    await expect(`${diagnostics.toSorted().join('\n')}\n`).toMatchFileSnapshot(
      './__snapshots__/typecheck.corpus.txt',
    );
  });
});

describe('demo', () => {
  const demo = join(root, 'demo');
  const app = join(demo, 'src/App.vibe');
  const clean = readFileSync(app, 'utf8');

  it('type-checks clean, fails at the seeded template error, and passes again', () => {
    expect(tsc(demo)).toEqual({ status: 0, diagnostics: [] });

    // A number bound to a string attribute.
    const seeded = clean.replace('placeholder="What next?"', ':placeholder="left"');
    expect(seeded).not.toBe(clean);
    writeFileSync(app, seeded);
    const at = position(seeded, seeded.indexOf(':placeholder') + 1);
    const { status, diagnostics } = tsc(demo);
    expect(status).not.toBe(0);
    expect(diagnostics).toEqual([
      `src/App.vibe(${at}): error TS2322: Type 'number' is not assignable to type 'string'.`,
    ]);

    writeFileSync(app, clean);
    expect(tsc(demo)).toEqual({ status: 0, diagnostics: [] });
  }, 60_000);
});
