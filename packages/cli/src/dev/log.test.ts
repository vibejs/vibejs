import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDevLog, readLog, unresolved, type LogEntry } from './log.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibejs-log-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const lines = (name = 'dev.log') =>
  readFileSync(join(root, '.vibejs', name), 'utf8')
    .split('\n')
    .slice(0, -1);

const entry = (e: Partial<LogEntry>): LogEntry => ({
  t: '2026-10-19T10:00:00.000Z',
  level: 'error',
  source: 'vite',
  msg: 'm',
  ...e,
});

describe('createDevLog', () => {
  it('starts an empty log, dropping the previous session, and appends one JSON line per entry', () => {
    mkdirSync(join(root, '.vibejs'));
    writeFileSync(join(root, '.vibejs/dev.log'), 'old\n');
    writeFileSync(join(root, '.vibejs/dev.log.1'), 'older\n');
    const onEntry = vi.fn<(e: LogEntry) => void>();
    const log = createDevLog(root, { onEntry });
    expect(lines()).toEqual([]);
    expect(readLog(root)).toEqual([]);

    log.write({ level: 'info', source: 'vibejs', msg: 'started' });
    const [line] = lines();
    const written: LogEntry = JSON.parse(line);
    expect(Object.keys(written)).toEqual(['t', 'level', 'source', 'msg']);
    expect(new Date(written.t).toISOString()).toBe(written.t);
    expect(onEntry).toHaveBeenCalledWith(written);
  });

  it('creates .vibejs and works without options', () => {
    const log = createDevLog(root);
    log.write({ level: 'debug', source: 'server', msg: 'request' });
    expect(lines()).toHaveLength(1);
  });

  it('moves the file to dev.log.1 once it exceeds maxBytes', () => {
    const log = createDevLog(root, { maxBytes: 200 });
    for (let i = 0; i < 5; i++) log.write({ level: 'info', source: 'vite', msg: `entry ${i}` });
    // Each line is about 80 bytes: the third one passes 200.
    expect(lines('dev.log.1')).toHaveLength(3);
    expect(lines()).toHaveLength(2);
    expect(readLog(root).map((e) => e.msg)).toEqual([0, 1, 2, 3, 4].map((i) => `entry ${i}`));
  });

  it('tracks the files with an unresolved coded entry', () => {
    const log = createDevLog(root);
    log.write({ level: 'error', source: 'vite', msg: 'x', code: 'VIBE1001', file: 'ui/a.ts' });
    log.write({ level: 'error', source: 'vite', msg: 'no file', code: 'VIBE1001' });
    expect([...log.failed]).toEqual(['ui/a.ts']);
    log.write({ level: 'info', source: 'vite', msg: 'ok', resolved: 'ui/a.ts' });
    expect([...log.failed]).toEqual([]);
  });

  it('drops writes after close', () => {
    const log = createDevLog(root);
    log.close();
    log.write({ level: 'info', source: 'vite', msg: 'late' });
    expect(lines()).toEqual([]);
  });
});

describe('readLog', () => {
  it('returns [] without a log', () => {
    expect(readLog(root)).toEqual([]);
  });

  it('reads dev.log.1 before dev.log and skips unparsable lines', () => {
    mkdirSync(join(root, '.vibejs'));
    const a = entry({ msg: 'a' });
    const b = entry({ msg: 'b' });
    writeFileSync(join(root, '.vibejs/dev.log.1'), `${JSON.stringify(a)}\n{"t":`);
    writeFileSync(join(root, '.vibejs/dev.log'), `not json\n${JSON.stringify(b)}\n`);
    expect(readLog(root)).toEqual([a, b]);
  });
});

describe('unresolved', () => {
  it('keeps coded entries with a file and no later resolution, oldest first', () => {
    const a1 = entry({ code: 'VIBE1001', file: 'a.ts', msg: 'a1' });
    const b = entry({ code: 'VIBE1002', file: 'b.ts' });
    const fixed = entry({ level: 'info', resolved: 'a.ts' });
    const a2 = entry({ code: 'VIBE1001', file: 'a.ts', msg: 'a2' });
    const uncoded = entry({ file: 'c.ts' });
    const unplaced = entry({ code: 'VIBE1003' });
    expect(unresolved([a1, b, fixed, a2, uncoded, unplaced])).toEqual([b, a2]);
  });
});
