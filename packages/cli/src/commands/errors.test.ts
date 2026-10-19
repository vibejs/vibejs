import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { testCtx } from '../../test/app.ts';
import type { LogEntry } from '../dev/log.ts';
import { exitCode } from '../output.ts';
import { entryLine, errors, type ErrorsResult } from './errors.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibejs-errors-'));
  writeFileSync(join(root, 'package.json'), '{"devDependencies":{"@vibejs-org/cli":"0.0.0"}}');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const T = '2026-10-19T10:00:00.000Z';
const e = (fields: Partial<LogEntry>): LogEntry => ({
  t: T,
  level: 'error',
  source: 'server',
  msg: 'm',
  ...fields,
});

/** A log as a killed dev server leaves it: no lock, a truncated last line. */
function writeLog(entries: LogEntry[]): void {
  mkdirSync(join(root, '.vibejs'), { recursive: true });
  const text = entries.map((entry) => JSON.stringify(entry)).join('\n');
  writeFileSync(join(root, '.vibejs/dev.log'), `${text}\n{"t":"2026`);
}

const run = (values: Record<string, string> = {}, cwd = root) =>
  errors.run({ values, positionals: [] }, testCtx(cwd).ctx);

it('splits unresolved build errors from the latest runtime errors', async () => {
  const fixed = e({ source: 'vite', code: 'VIBE1001', file: 'ui/a.ts', msg: 'fixed' });
  const open = e({ source: 'vibejs', code: 'VIBE8203', file: 'server/src/app.module.ts' });
  const runtime = Array.from({ length: 25 }, (_, i) =>
    e({ source: i % 2 ? 'browser' : 'server', msg: `r${i}` }),
  );
  writeLog([
    fixed,
    e({ level: 'info', source: 'vite', msg: 'ok', resolved: 'ui/a.ts' }),
    open,
    e({ source: 'vite', msg: 'not runtime' }),
    e({ level: 'warn', msg: 'a warning' }),
    e({ msg: 'coded runtime', code: 'VIBE9503' }),
    ...runtime,
  ]);
  const r = await run();
  expect(r).toEqual({
    ok: true,
    command: 'errors',
    version: '1.2.3',
    next: ['vibejs explain VIBE8203'],
    build: [open],
    runtime: runtime.slice(5),
    truncated: { shown: 20, total: 26 },
  } satisfies ErrorsResult);
  expect(Object.keys(r)).toEqual([
    'ok',
    'command',
    'version',
    'next',
    'build',
    'runtime',
    'truncated',
  ]);
  expect((await run({ limit: '3' })).runtime).toEqual(runtime.slice(22));
});

it('suggests explain for a coded runtime error, and nothing without codes', async () => {
  writeLog([e({ msg: 'coded', code: 'VIBE9503' })]);
  expect((await run()).next).toEqual(['vibejs explain VIBE9503']);
  writeLog([e({})]);
  const r = await run();
  expect(r.next).toBeUndefined();
  expect(r.truncated).toBeUndefined();
});

it('returns empty lists and suggests vibejs dev without a log', async () => {
  const r = await run();
  expect(r).toEqual({
    ok: true,
    command: 'errors',
    version: '1.2.3',
    next: ['vibejs dev'],
    build: [],
    runtime: [],
  });
  expect(exitCode(r)).toBe(0);
});

it('rejects a bad --limit and runs only in a project', async () => {
  for (const limit of ['0', 'x', '-1']) {
    const r = await run({ limit });
    expect(r.error).toMatchObject({
      code: 'VIBE8004',
      message: `Unknown command or option \`--limit ${limit}\`.`,
    });
    expect(exitCode(r)).toBe(2);
  }
  const outside = await run({}, tmpdir());
  expect(outside.error?.code).toBe('VIBE8001');
  expect(exitCode(outside)).toBe(2);
});

it('prints one line per entry for people', () => {
  const r: ErrorsResult = {
    ok: true,
    command: 'errors',
    version: '1',
    build: [
      e({
        source: 'vite',
        code: 'VIBE1001',
        file: 'ui/a.ts',
        line: 2,
        column: 5,
        msg: 'bad\nframe',
      }),
    ],
    runtime: [e({ source: 'browser', msg: 'boom' })],
  };
  expect(errors.human(r)).toBe(
    [
      'Build errors: 1',
      `${T}  ui/a.ts:2:5  VIBE1001  bad`,
      'Runtime errors: 1',
      `${T}  browser  boom`,
    ].join('\n'),
  );
  expect(entryLine(e({ file: 'server/x.ts', msg: 'm' }))).toBe(`${T}  server/x.ts  m`);
});
