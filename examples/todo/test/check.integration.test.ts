import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { copyApp, edit, lineColumn, vibejs } from './app.ts';

const root = copyApp();

it('passes vibejs check with no diagnostics and 100% coverage per file', () => {
  const r = vibejs(root, 'check', '--json');
  const result = JSON.parse(r.stdout);
  expect(result).toMatchObject({
    ok: true,
    diagnostics: [],
    steps: {
      types: { status: 'passed' },
      lint: { status: 'passed' },
      format: { status: 'passed' },
      tests: { status: 'passed', failed: 0 },
      coverage: { status: 'passed', filesBelow100: 0 },
    },
  });
  expect(result.steps.tests.passed).toBeGreaterThan(0);
  expect(r.status).toBe(0);
}, 300_000);

it('reports a type error seeded in the App.vibe template at its line and column', () => {
  edit(root, 'ui/src/App.vibe', '<RouterLink to="/">', '<RouterLink :to="1">');
  const source = readFileSync(join(root, 'ui/src/App.vibe'), 'utf8');
  const r = vibejs(root, 'check', '--only', 'types', '--json');
  expect(JSON.parse(r.stdout).diagnostics).toEqual([
    expect.objectContaining({
      source: 'tsc',
      code: 'TS2322',
      file: 'ui/src/App.vibe',
      // The error is on the bound attribute's name.
      loc: `ui/src/App.vibe:${lineColumn(source, 'to="1"')}`,
    }),
  ]);
  expect(r.status).toBe(1);
}, 120_000);
