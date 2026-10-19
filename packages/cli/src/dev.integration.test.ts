import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { afterEach, expect, it, vi } from 'vitest';
import { copyApp, edit, portOf } from '../test/app.ts';
import type { DevEvent } from './commands/dev.ts';
import { readLog } from './dev/log.ts';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const ENV = { ...process.env, VIBEJS_AGENT: '1' };

const roots: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function app(): string {
  const root = copyApp();
  roots.push(root);
  return root;
}

/** Every stdout line must be one JSON document without colors. */
function ndjson(stdout: string): unknown[] {
  expect(stdout).not.toContain('\u001b[');
  expect(stdout.endsWith('\n')).toBe(true);
  return stdout
    .slice(0, -1)
    .split('\n')
    .map((line) => JSON.parse(line));
}

/** Starts `vibejs dev` in agent mode and waits for its ready event. */
async function dev(root: string) {
  const child = spawn(process.execPath, [BIN, 'dev', '--port', '0'], { cwd: root, env: ENV });
  children.push(child);
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', (s: string) => (stdout += s));
  const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));
  const events = () =>
    stdout
      .split('\n')
      .filter(Boolean)
      .map((line): DevEvent => JSON.parse(line));
  await vi.waitFor(
    () => expect(events()).toContainEqual(expect.objectContaining({ event: 'ready' })),
    {
      timeout: 20_000,
      interval: 50,
    },
  );
  const ready = events().find(
    (e): e is Extract<DevEvent, { event: 'ready' }> => e.event === 'ready',
  )!;
  return { child, ready, events, exited, stdout: () => stdout };
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, () => {
      const port = portOf(server);
      server.close(() => resolve(port));
    });
  });

it('serves one port, is reused by a second dev, restarts the backend and stops on SIGTERM', async () => {
  const root = app();
  const running = await dev(root);
  const { url, pid } = running.ready;
  expect(running.ready).toEqual({
    event: 'ready',
    url,
    pid,
    api: `${url}api`,
    logFile: '.vibejs/dev.log',
  });
  expect(await (await fetch(`${url}api/health`)).text()).toBe('ok');

  const at = performance.now();
  const second = spawnSync(process.execPath, [BIN, 'dev'], {
    cwd: root,
    env: ENV,
    encoding: 'utf8',
  });
  expect(performance.now() - at).toBeLessThan(1000);
  expect(second.status).toBe(0);
  expect(ndjson(second.stdout)).toEqual([
    { event: 'ready', url, pid, logFile: '.vibejs/dev.log', reused: true },
    { ok: true, command: 'dev', version: expect.any(String), url, pid, reused: true },
  ]);

  const edited = performance.now();
  edit(root, 'server/src/app.module.ts', "'ok'", "'v2'");
  await vi.waitFor(async () => expect(await (await fetch(`${url}api/health`)).text()).toBe('v2'), {
    timeout: 5000,
    interval: 20,
  });
  expect(performance.now() - edited).toBeLessThan(1000);
  expect(running.events()).toContainEqual({ event: 'restart', ms: expect.any(Number), ok: true });

  running.child.kill('SIGTERM');
  expect(await running.exited).toBe(0);
  const lines = ndjson(running.stdout());
  expect(lines.at(-1)).toEqual({ ok: true, command: 'dev', version: expect.any(String), url, pid });
  expect(existsSync(join(root, '.vibejs/dev.lock'))).toBe(false);
  // The log outlives the server: errors reads it after the process is gone.
  const errors = spawnSync(process.execPath, [BIN, 'errors'], {
    cwd: root,
    env: ENV,
    encoding: 'utf8',
  });
  expect(ndjson(errors.stdout)).toEqual([expect.objectContaining({ ok: true, build: [] })]);
}, 60_000);

it('records the browser console and unhandled rejections in dev.log', async () => {
  const root = app();
  const running = await dev(root);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${running.ready.url}?error&reject`);
    await page.waitForFunction("document.body.textContent === 'ok'");
    await vi.waitFor(
      () => {
        const browserEntries = readLog(root).filter((e) => e.source === 'browser');
        expect(browserEntries).toContainEqual(
          expect.objectContaining({ level: 'error', msg: '[console.error] fixture' }),
        );
        expect(browserEntries).toContainEqual(
          expect.objectContaining({
            level: 'error',
            msg: expect.stringMatching(/^\[Unhandled rejection\] Error: fixture rejection/),
          }),
        );
      },
      { timeout: 10_000, interval: 100 },
    );
  } finally {
    await browser.close();
  }
}, 60_000);

it('builds a UI and a server that runs under plain node', async () => {
  const root = app();
  const build = spawnSync(process.execPath, [BIN, 'build'], {
    cwd: root,
    env: ENV,
    encoding: 'utf8',
  });
  expect(build.status).toBe(0);
  expect(ndjson(build.stdout)).toEqual([
    expect.objectContaining({
      ok: true,
      command: 'build',
      ui: expect.anything(),
      server: expect.anything(),
    }),
  ]);
  expect(existsSync(join(root, 'ui/dist/index.html'))).toBe(true);

  const port = await freePort();
  const server = spawn(process.execPath, ['server/dist/main.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
  });
  children.push(server);
  await vi.waitFor(
    async () => {
      const res = await fetch(`http://localhost:${port}/api/health`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('ok');
    },
    { timeout: 10_000, interval: 100 },
  );
}, 60_000);
