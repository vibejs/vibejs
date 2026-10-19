import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { testCtx } from '../../test/app.ts';
import type { LogEntry } from '../dev/log.ts';
import { exitCode } from '../output.ts';
import { logs, type LogsResult } from './logs.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibejs-logs-'));
  writeFileSync(join(root, 'package.json'), '{"devDependencies":{"@vibejs-org/cli":"0.0.0"}}');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;

const entries: LogEntry[] = [
  { t: ago(3 * 60 * MIN), level: 'debug', source: 'server', msg: 'request' },
  { t: ago(30 * MIN), level: 'info', source: 'vite', msg: 'Page reload' },
  { t: ago(2 * MIN), level: 'warn', source: 'browser', msg: '[console.warn] careful' },
  { t: ago(10_000), level: 'error', source: 'server', msg: 'Handler FAILED', code: 'VIBE9503' },
  { t: ago(1000), level: 'info', source: 'vibejs', msg: 'The backend started.' },
];

function writeLog(list: LogEntry[]): void {
  mkdirSync(join(root, '.vibejs'), { recursive: true });
  writeFileSync(join(root, '.vibejs/dev.log'), list.map((e) => `${JSON.stringify(e)}\n`).join(''));
}

const run = async (values: Record<string, string> = {}, agent = true, cwd = root) =>
  logs.run({ values, positionals: [] }, testCtx(cwd, agent).ctx);
const msgs = async (values: Record<string, string>) =>
  (await run(values)).entries.map((e) => e.msg);

beforeEach(() => writeLog(entries));

it('returns every entry, oldest first, by default', async () => {
  const r = await run();
  expect(r).toEqual({ ok: true, command: 'logs', version: '1.2.3', entries } satisfies LogsResult);
});

it('filters by minimum level, source, text and time', async () => {
  expect(await msgs({ level: 'warn' })).toEqual(['[console.warn] careful', 'Handler FAILED']);
  expect(await msgs({ source: 'server' })).toEqual(['request', 'Handler FAILED']);
  expect(await msgs({ grep: 'failed' })).toEqual(['Handler FAILED']);
  expect(await msgs({ since: '5m' })).toEqual([
    '[console.warn] careful',
    'Handler FAILED',
    'The backend started.',
  ]);
  expect(await msgs({ since: '5s' })).toEqual(['The backend started.']);
  expect(await msgs({ since: '1h' })).toHaveLength(4);
  expect(await msgs({ since: ago(15 * MIN) })).toHaveLength(3);
});

it('keeps the newest entries within --limit', async () => {
  const r = await run({ limit: '2' });
  expect(r.entries.map((e) => e.msg)).toEqual(['Handler FAILED', 'The backend started.']);
  expect(r.truncated).toEqual({ shown: 2, total: 5 });
});

it('caps agent output at 50 entries, but not output for people', async () => {
  const many = Array.from({ length: 60 }, (_, i): LogEntry => ({
    t: ago(0),
    level: 'info',
    source: 'vite',
    msg: `m${i}`,
  }));
  writeLog(many);
  const agent = await run({ limit: '100' });
  expect(agent.entries).toEqual(many.slice(10));
  expect(agent.truncated).toEqual({ shown: 50, total: 60 });
  const people = await run({ limit: '100' }, false);
  expect(people.entries).toHaveLength(60);
  expect(people.truncated).toBeUndefined();
});

it('rejects bad values with VIBE8004', async () => {
  for (const [name, value] of [
    ['limit', '0'],
    ['level', 'fatal'],
    ['source', 'ui'],
    ['since', 'yesterday'],
    ['since', '5d'],
    ['since', '2026-13-45'],
  ]) {
    const r = await run({ [name]: value });
    expect(r).toMatchObject({ ok: false, next: ['vibejs logs --help'], entries: [] });
    expect(r.error).toMatchObject({
      code: 'VIBE8004',
      message: `Unknown command or option \`--${name} ${value}\`.`,
    });
    expect(exitCode(r)).toBe(2);
  }
});

it('runs only in a project and is empty without a log', async () => {
  const outside = await run({}, true, tmpdir());
  expect(outside.error?.code).toBe('VIBE8001');
  rmSync(join(root, '.vibejs'), { recursive: true });
  expect((await run()).entries).toEqual([]);
});

it('prints one line per entry for people', async () => {
  const r = await run({ level: 'error' });
  expect(logs.human(r)).toBe(`${entries[3].t}  server  VIBE9503  Handler FAILED`);
});
