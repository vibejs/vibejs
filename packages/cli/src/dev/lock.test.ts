import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { portOf } from '../../test/app.ts';
import { readLiveLock, removeLock, writeLock, type DevLock } from './lock.ts';

let root: string;
let server: Server | undefined;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibejs-lock-'));
});
afterEach(() => {
  server?.close();
  server = undefined;
  rmSync(root, { recursive: true, force: true });
});

const LOCK = () => join(root, '.vibejs/dev.lock');

const lock = (pid: number, url = 'http://localhost:1/'): DevLock => ({
  pid,
  url,
  port: 1,
  apiPrefix: '/api',
  logFile: '.vibejs/dev.log',
  startedAt: '2026-10-19T10:00:00.000Z',
  version: '1.2.3',
});

/** A server whose `/__vibejs/health` answers with `pid`; resolves with its URL. */
async function health(pid: number): Promise<string> {
  server = createServer((req, res) => {
    res.end(req.url === '/__vibejs/health' ? JSON.stringify({ name: 'vibejs-dev', pid }) : '');
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${portOf(server)}/`;
}

describe('readLiveLock', () => {
  it('returns undefined without a lock', async () => {
    expect(await readLiveLock(root)).toBeUndefined();
  });

  it('returns the lock of a live server that answers with the same pid', async () => {
    const live = lock(process.pid, await health(process.pid));
    writeLock(root, live);
    expect(await readLiveLock(root)).toEqual(live);
    expect(existsSync(LOCK())).toBe(true);
  });

  it('deletes a lock whose health check answers another pid', async () => {
    writeLock(root, lock(process.pid, await health(process.pid + 1)));
    expect(await readLiveLock(root)).toBeUndefined();
    expect(existsSync(LOCK())).toBe(false);
  });

  it('deletes a lock whose process has exited', async () => {
    const { pid } = spawnSync(process.execPath, ['-e', '']);
    writeLock(root, lock(pid, await health(pid)));
    expect(await readLiveLock(root)).toBeUndefined();
    expect(existsSync(LOCK())).toBe(false);
  });

  it('deletes an unreadable lock', async () => {
    mkdirSync(join(root, '.vibejs'));
    writeFileSync(LOCK(), '{');
    expect(await readLiveLock(root)).toBeUndefined();
    expect(existsSync(LOCK())).toBe(false);
  });
});

describe('writeLock', () => {
  it('writes the C9 keys in order', () => {
    writeLock(root, lock(7));
    expect(Object.keys(JSON.parse(readFileSync(LOCK(), 'utf8')))).toEqual([
      'pid',
      'url',
      'port',
      'apiPrefix',
      'logFile',
      'startedAt',
      'version',
    ]);
  });

  it('never exposes a partial file to a concurrent reader', async () => {
    // Another process rewrites a large lock 300 times while this one reads it.
    const big = { ...lock(1), version: 'x'.repeat(256 * 1024) };
    const script = `import { writeLock } from ${JSON.stringify(new URL('lock.ts', import.meta.url).href)};
for (let i = 0; i < 300; i++) writeLock(${JSON.stringify(root)}, { ...${JSON.stringify(big)}, pid: i });`;
    const writer = spawn(process.execPath, ['--input-type=module', '-e', script]);
    const exited = new Promise((resolve) => writer.on('exit', resolve));
    const lengths: number[] = [];
    while (writer.exitCode === null) {
      await new Promise((resolve) => setImmediate(resolve));
      let text: string;
      try {
        text = readFileSync(LOCK(), 'utf8');
      } catch {
        continue; // not written yet
      }
      // A partial file would not parse.
      lengths.push(JSON.parse(text).version.length);
    }
    expect(await exited).toBe(0);
    expect(lengths.length).toBeGreaterThan(0);
    expect(new Set(lengths)).toEqual(new Set([big.version.length]));
  });
});

describe('removeLock', () => {
  it('removes only a lock that holds the pid', () => {
    writeLock(root, lock(7));
    removeLock(root, 8);
    expect(existsSync(LOCK())).toBe(true);
    removeLock(root, 7);
    expect(existsSync(LOCK())).toBe(false);
    removeLock(root, 7);
  });
});
