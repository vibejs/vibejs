import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyApp, edit, portOf, testCtx, type TestCtx } from '../../test/app.ts';
import { readLog, type LogEntry } from '../dev/log.ts';
import type { DevLock } from '../dev/lock.ts';
import { exitCode } from '../output.ts';
import { dev, type DevEvent, type DevResult } from './dev.ts';
import { errors } from './errors.ts';

const APP_MODULE = 'server/src/app.module.ts';
// Generous: the full suite runs these next to every other test file, with coverage.
const WAIT = { timeout: 10_000, interval: 20 };
vi.setConfig({ testTimeout: 30_000 });

interface Running {
  root: string;
  url: string;
  t: TestCtx;
  events(): DevEvent[];
  stop(): Promise<DevResult>;
}

let running: Running | undefined;
const roots: string[] = [];

afterEach(async () => {
  await running?.stop();
  running = undefined;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function app(prepare?: (root: string) => void): string {
  const root = copyApp();
  roots.push(root);
  prepare?.(root);
  return root;
}

/** The dev server, as the fixture's Vite plugin exposes it. */
const fixtureServer = (): ViteDevServer => Reflect.get(globalThis, 'fixtureServer');

const readLock = (root: string): DevLock =>
  JSON.parse(readFileSync(join(root, '.vibejs/dev.lock'), 'utf8'));

/** Runs `vibejs dev` in the copy until it is ready. */
async function start(
  root = app(),
  {
    values = { port: '0' },
    agent = true,
  }: { values?: Record<string, string>; agent?: boolean } = {},
): Promise<Running> {
  const t = testCtx(root, agent);
  const result = dev.run({ values, positionals: [] }, t.ctx);
  const events = () => t.out.filter((s) => s.startsWith('{')).map((s): DevEvent => JSON.parse(s));
  await vi.waitFor(() => expect(t.out.join('')).toContain('ready'), WAIT);
  let stopped: Promise<DevResult> | undefined;
  const stop = () => {
    t.stop();
    return (stopped ??= result);
  };
  running = { root, url: readLock(root).url, t, events, stop };
  return running;
}

const get = (r: Running, path: string) => fetch(new URL(path, r.url));
const text = async (r: Running, path: string) => (await get(r, path)).text();
const log = (r: Running) => readLog(r.root);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const restarts = (r: Running) => r.events().filter((e) => e.event === 'restart');

/** Waits for the restart event after the ones seen so far. */
async function restarted(r: Running, seen = restarts(r).length) {
  await vi.waitFor(() => expect(restarts(r).length).toBeGreaterThan(seen), WAIT);
  return restarts(r)[seen];
}

describe('one port', () => {
  it('serves the UI, the backend under its base path and the health check', async () => {
    const r = await start();
    expect(await text(r, '/')).toContain('<script type="module" src="/src/main.ts">');
    const api = await get(r, '/api/health');
    expect(api.status).toBe(200);
    expect(await api.text()).toBe('ok');
    expect(await (await get(r, '/__vibejs/health?x=1')).json()).toEqual({
      name: 'vibejs-dev',
      pid: process.pid,
    });
    // Not the backend, which would answer a 404 problem.
    const other = await get(r, '/apix');
    expect(other.headers.get('content-type')).toContain('text/html');
    expect(log(r)).toContainEqual(
      expect.objectContaining({ level: 'debug', source: 'server', msg: 'request' }),
    );
  });

  it('rejects an empty base path with VIBE8205 and keeps serving the UI', async () => {
    const r = await start(app((at) => edit(at, APP_MODULE, "basePath: '/api'", "basePath: ''")));
    expect(r.events()[0]).toMatchObject({ event: 'log', code: 'VIBE8205', file: APP_MODULE });
    expect(await text(r, '/')).toContain('<script type="module" src="/src/main.ts">');
    expect(await problem(r)).toMatchObject({ code: 'VIBE8205' });
    expect(readLock(r.root)).not.toHaveProperty('apiPrefix');
  });
});

describe('lock', () => {
  it('writes the C9 lock when ready and removes it on the signal', async () => {
    // Loading Vite adds a listener that re-raises a signal only when it is the last one.
    await import('vite');
    const sigterm = process.listenerCount('SIGTERM');
    const r = await start();
    // Vite's own SIGTERM listener, which would exit before the lock is removed, is gone.
    expect(process.listenerCount('SIGTERM')).toBe(sigterm);
    expect(readLock(r.root)).toEqual({
      pid: process.pid,
      url: r.url,
      port: Number(new URL(r.url).port),
      apiPrefix: '/api',
      logFile: '.vibejs/dev.log',
      startedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      version: '1.2.3',
    });
    expect(r.events()).toEqual([
      {
        event: 'ready',
        url: r.url,
        pid: process.pid,
        api: `${r.url}api`,
        logFile: '.vibejs/dev.log',
      },
    ]);
    expect(await r.stop()).toEqual({
      ok: true,
      command: 'dev',
      version: '1.2.3',
      url: r.url,
      pid: process.pid,
    });
    expect(existsSync(join(r.root, '.vibejs/dev.lock'))).toBe(false);
  });
});

describe('reuse', () => {
  it('reports the running server within 1 s instead of starting another', async () => {
    const r = await start();
    for (const agent of [true, false]) {
      const t = testCtx(r.root, agent);
      const at = performance.now();
      const result = await dev.run({ values: {}, positionals: [] }, t.ctx);
      expect(performance.now() - at).toBeLessThan(1000);
      expect(result).toEqual({
        ok: true,
        command: 'dev',
        version: '1.2.3',
        url: r.url,
        pid: process.pid,
        reused: true,
      });
      expect(exitCode(result)).toBe(0);
      const ready = { event: 'ready', url: r.url, pid: process.pid, logFile: '.vibejs/dev.log' };
      expect(t.out).toEqual(agent ? [`${JSON.stringify({ ...ready, reused: true })}\n`] : []);
    }
    expect(
      dev.human({ ok: true, command: 'dev', version: '', url: r.url, pid: 7, reused: true }),
    ).toBe(`vibejs dev is already running at ${r.url} (pid 7). Stop it with: kill 7`);
  });
  it('starts one server when two start at the same time', async () => {
    const root = app();
    const ctxs = [testCtx(root), testCtx(root)];
    const runs = ctxs.map((t) => dev.run({ values: { port: '0' }, positionals: [] }, t.ctx));
    try {
      // The one that waited for the other returns first.
      const reused = await Promise.race(runs);
      expect(reused).toMatchObject({ ok: true, reused: true, url: readLock(root).url });
    } finally {
      for (const t of ctxs) t.stop();
    }
    const results = await Promise.all(runs);
    expect(results.filter((r) => r.reused)).toHaveLength(1);
    expect(existsSync(join(root, '.vibejs/dev.lock'))).toBe(false);
  });
});

describe('ready', () => {
  it('does not wait more than 10 s for a backend that is slow to start', async () => {
    let release!: () => void;
    Reflect.set(globalThis, 'hold', new Promise<void>((resolve) => (release = resolve)));
    const root = app((at) =>
      edit(
        at,
        APP_MODULE,
        'class HealthController {',
        "class HealthController {\n  onModuleInit() {\n    return Reflect.get(globalThis, 'hold');\n  }",
      ),
    );
    const t = testCtx(root);
    const result = dev.run({ values: { port: '0' }, positionals: [] }, t.ctx);
    try {
      await vi.waitFor(() => expect(t.out.join('')).toContain('ready'), { timeout: 20_000 });
      const { url } = readLock(root);
      expect(readLock(root)).not.toHaveProperty('apiPrefix');
      expect(JSON.parse(t.out[0])).toEqual({
        event: 'ready',
        url,
        pid: process.pid,
        logFile: '.vibejs/dev.log',
      });
      release();
      // Requests wait for the start.
      expect(await (await fetch(new URL('/api/health', url))).text()).toBe('ok');
    } finally {
      release();
      t.stop();
    }
    expect(await result).toMatchObject({ ok: true });
  });
});

describe('restart', () => {
  it('restarts only the backend on a server change, and requests wait for it', async () => {
    const r = await start();
    const vite = fixtureServer();
    expect(await text(r, '/src/main.ts')).toContain('fixture');
    const main = join(r.root, 'ui/src/main.ts');

    edit(r.root, APP_MODULE, "'ok'", "'v2'");
    await vi.waitFor(() => expect(JSON.stringify(log(r))).toContain('Restarting'), WAIT);
    // Sent while the backend restarts: it waits and gets the new response.
    expect(await text(r, '/api/health')).toBe('v2');
    const restart = await restarted(r, 0);
    // The integration test on the built bin measures the time.
    expect(restart).toEqual({ event: 'restart', ms: expect.any(Number), ok: true });
    // The same Vite server, with its UI module graph.
    expect(fixtureServer()).toBe(vite);
    expect(vite.environments.client.moduleGraph.getModulesByFile(main)?.size).toBe(1);
    expect(r.events().filter((e) => e.event === 'ready')).toHaveLength(1);

    // A UI-only change does not restart the backend.
    edit(r.root, 'ui/src/main.ts', 'fixture', 'fixture2');
    await sleep(300);
    expect(restarts(r)).toHaveLength(1);
  });

  it('restarts once for a burst of changes', async () => {
    const r = await start();
    const { watcher } = fixtureServer();
    const file = join(r.root, APP_MODULE);
    // Emitted by hand: file system events arrive with an unpredictable delay.
    watcher.emit('all', 'change', file);
    await sleep(20);
    watcher.emit('all', 'change', file);
    watcher.emit('all', 'addDir', join(r.root, 'server'));
    await restarted(r, 0);
    await sleep(200);
    expect(restarts(r)).toHaveLength(1);
  });
});

const buildErrors = async (r: Running) =>
  (await errors.run({ values: {}, positionals: [] }, testCtx(r.root).ctx)).build;

async function problem(r: Running): Promise<Record<string, unknown>> {
  const res = await get(r, '/api/health');
  expect(res.status).toBe(503);
  expect(res.headers.get('content-type')).toBe('application/problem+json');
  return Object(await res.json());
}

describe('a broken backend', () => {
  it('answers 503 with VIBE8203, is listed by errors, and recovers when fixed', async () => {
    const r = await start();
    edit(r.root, APP_MODULE, "return 'ok';", "return 'ok'; }}");
    expect(await restarted(r)).toMatchObject({ ok: false });
    expect(await problem(r)).toEqual({
      type: 'https://vibejs.org/v0/errors/VIBE8203',
      title: 'Service Unavailable',
      status: 503,
      code: 'VIBE8203',
      detail: expect.stringMatching(/^The backend failed to start: .+\.$/),
      requestId: expect.stringMatching(/^[\da-f-]{36}$/),
    });
    expect(await buildErrors(r)).toEqual([
      expect.objectContaining({
        level: 'error',
        source: 'vibejs',
        code: 'VIBE8203',
        file: APP_MODULE,
        stack: expect.any(String),
      }),
    ]);
    expect(r.events()).toContainEqual(expect.objectContaining({ event: 'log', code: 'VIBE8203' }));

    // While it is broken, a UI change does not restart it and a new server file does.
    edit(r.root, 'ui/src/main.ts', 'fixture', 'fixture2');
    await sleep(300);
    expect(restarts(r)).toHaveLength(1);
    writeFileSync(join(r.root, 'server/src/other.ts'), 'export {};\n');
    expect(await restarted(r)).toMatchObject({ ok: false });

    edit(r.root, APP_MODULE, "return 'ok'; }}", "return 'ok';");
    expect(await restarted(r)).toMatchObject({ ok: true });
    expect(await text(r, '/api/health')).toBe('ok');
    expect(await buildErrors(r)).toEqual([]);
    expect(log(r)).toContainEqual(expect.objectContaining({ resolved: APP_MODULE }));
  });

  it('answers 503 with VIBE8202 for a module without AppModule or appOptions', async () => {
    const r = await start();
    edit(r.root, APP_MODULE, 'export const appOptions', 'const appOptions');
    expect(await restarted(r)).toMatchObject({ ok: false });
    expect(await problem(r)).toMatchObject({
      code: 'VIBE8202',
      detail: expect.stringContaining('found the exports AppModule.'),
    });
    for (const [source, found] of [
      ['export {};\n', 'no exports'],
      ['export const AppModule = 1;\nexport const appOptions = {};\n', 'AppModule, appOptions'],
      ['export class AppModule {}\nexport const appOptions = null;\n', 'AppModule, appOptions'],
    ]) {
      writeFileSync(join(r.root, APP_MODULE), source);
      expect(await restarted(r)).toMatchObject({ ok: false });
      expect(await problem(r)).toMatchObject({
        code: 'VIBE8202',
        detail: expect.stringContaining(
          `found ${found === 'no exports' ? '' : 'the exports '}${found}.`,
        ),
      });
    }
  });

  it('reports a thrown non-Error value without a stack, from the first start', async () => {
    const root = app((at) => writeFileSync(join(at, APP_MODULE), "throw 'boom';\n"));
    const r = await start(root);
    expect(r.events()).toEqual([
      expect.objectContaining({
        event: 'log',
        code: 'VIBE8203',
        msg: 'The backend failed to start: boom.',
      }),
      { event: 'ready', url: r.url, pid: process.pid, logFile: '.vibejs/dev.log' },
    ]);
    expect(log(r).find((e) => e.code === 'VIBE8203')).not.toHaveProperty('stack');
    expect(readLock(root)).not.toHaveProperty('apiPrefix');
    // Until a first successful start, the template's /api is the backend's.
    expect((await problem(r)).code).toBe('VIBE8203');
  });
});

describe('logs', () => {
  it('starts a fresh NDJSON log of C9 entries', async () => {
    const r = await start();
    const lines = readFileSync(join(r.root, '.vibejs/dev.log'), 'utf8').split('\n');
    expect(lines.pop()).toBe('');
    expect(lines.length).toBeGreaterThan(0);
    const keys = [
      't',
      'level',
      'source',
      'msg',
      'code',
      'file',
      'line',
      'column',
      'stack',
      'resolved',
    ];
    for (const line of lines) {
      const e: LogEntry = JSON.parse(line);
      expect(keys).toEqual(expect.arrayContaining(Object.keys(e)));
    }
  });

  it('records a VIBE error of a Vite plugin with its location, then its resolution', async () => {
    const r = await start();
    writeFileSync(join(r.root, 'ui/src/bad.ts'), 'export const a = 1;\n// FIXTURE_ERROR\n');
    expect((await get(r, '/src/bad.ts')).status).toBe(500);
    expect(log(r).find((e) => e.code === 'VIBE1001')).toMatchObject({
      level: 'error',
      source: 'vite',
      file: 'ui/src/bad.ts',
      line: expect.any(Number),
      column: expect.any(Number),
    });
    expect(r.events()).toContainEqual(expect.objectContaining({ event: 'log', code: 'VIBE1001' }));

    writeFileSync(join(r.root, 'ui/src/bad.ts'), 'export const a = 1;\n');
    expect((await get(r, '/src/bad.ts')).status).toBe(200);
    expect(log(r).at(-1)).toMatchObject({ source: 'vite', resolved: 'ui/src/bad.ts' });
  });

  it('records a backend error with its code and stack', async () => {
    const r = await start();
    edit(r.root, APP_MODULE, "return 'ok';", "throw new Error('handler failed');");
    await restarted(r);
    expect((await get(r, '/api/health')).status).toBe(500);
    expect(log(r)).toContainEqual(
      expect.objectContaining({
        level: 'error',
        source: 'server',
        code: 'VIBE9503',
        stack: expect.stringContaining('handler failed'),
      }),
    );
  });

  it('loads server/.env before the first start', async () => {
    const root = app((at) => writeFileSync(join(at, 'server/.env'), 'VIBEJS_FIXTURE_ENV=loaded\n'));
    try {
      await start(root);
      expect(process.env.VIBEJS_FIXTURE_ENV).toBe('loaded');
    } finally {
      delete process.env.VIBEJS_FIXTURE_ENV;
    }
  });
});

describe('human mode', () => {
  it("prints Vite's output, the ready line, restarts and backend errors", async () => {
    const printed = vi.spyOn(console, 'log');
    const r = await start(app(), { values: {}, agent: false });
    expect(r.events()).toEqual([]);
    expect(r.t.out.join('')).toContain(`vibejs dev is ready at ${r.url} (API ${r.url}api)`);
    expect(printed.mock.calls.flat().join('\n')).toContain('Local');

    // Vite prints its own errors; vibejs prints those of the backend.
    writeFileSync(join(r.root, 'ui/src/bad.ts'), "export const m = 'FIXTURE_ERROR';\n");
    expect((await get(r, '/src/bad.ts')).status).toBe(500);
    edit(r.root, APP_MODULE, "return 'ok';", "throw new Error('handler failed');");
    await vi.waitFor(() => expect(r.t.out.join('')).toMatch(/Backend restarted in \d+ ms/), WAIT);
    expect((await get(r, '/api/health')).status).toBe(500);
    expect(r.t.err.join('')).toMatch(/^\[server\] \[VIBE9503\] A request failed/);

    edit(r.root, APP_MODULE, "throw new Error('handler failed');", "return 'ok'; }}");
    await vi.waitFor(
      () => expect(r.t.out.join('')).toMatch(/Backend failed to restart in \d+ ms/),
      WAIT,
    );
    expect(r.t.err.join('')).toContain('[vibejs] The backend failed to start');
    edit(r.root, APP_MODULE, "return 'ok'; }}", "return 'ok';");
    await vi.waitFor(() => expect(r.t.out.join('')).toMatch(/(Backend restarted.*){2}/s), WAIT);
    expect(dev.human(await r.stop())).toBe('vibejs dev stopped.');
  });

  it('says when the backend did not start', async () => {
    const root = app((at) => writeFileSync(join(at, APP_MODULE), 'export {};\n'));
    const r = await start(root, { agent: false });
    expect(r.t.out.join('')).toContain('(API not started)');
  });
});

const run = (cwd: string, values: Record<string, string> = {}) =>
  dev.run({ values, positionals: [] }, testCtx(cwd).ctx);

describe('errors', () => {
  it('needs a project with the full-stack layout', async () => {
    const outside = await run(app((at) => rmSync(join(at, 'package.json'))));
    expect(outside.error?.code).toBe('VIBE8001');
    expect(exitCode(outside)).toBe(2);
    for (const file of ['ui/index.html', APP_MODULE, 'server/src/main.ts']) {
      const r = await run(app((at) => rmSync(join(at, file))));
      expect(r.error).toMatchObject({
        code: 'VIBE8201',
        message: `\`${file}\` is missing; \`vibejs dev\` expects \`ui/index.html\`, \`server/src/app.module.ts\` and \`server/src/main.ts\`.`,
      });
      expect(exitCode(r)).toBe(2);
    }
  });

  it('rejects an invalid port with VIBE8004', async () => {
    for (const port of ['abc', '-1', '65536', '01']) {
      const r = await run(app(), { port });
      expect(r).toMatchObject({
        ok: false,
        next: ['vibejs dev --help'],
        error: { code: 'VIBE8004' },
      });
      expect(exitCode(r)).toBe(2);
    }
  });

  it('fails with VIBE8204 when --port is busy, and writes no lock', async () => {
    const busy = createNetServer();
    // The host Vite binds by default.
    await new Promise<void>((resolve) => busy.listen(0, 'localhost', resolve));
    try {
      const port = portOf(busy);
      const root = app();
      const r = await run(root, { port: String(port) });
      expect(r.error).toMatchObject({
        code: 'VIBE8204',
        message: `Port ${port} is already in use.`,
      });
      expect(exitCode(r)).toBe(2);
      expect(existsSync(join(root, '.vibejs/dev.lock'))).toBe(false);
    } finally {
      busy.close();
    }
  });

  it('rethrows any other listen error', async () => {
    const root = app((at) =>
      edit(
        at,
        'ui/vite.config.ts',
        'plugins: [marker],',
        "plugins: [marker],\n  server: { host: 'host.invalid' },",
      ),
    );
    await expect(run(root, { port: '0' })).rejects.toBeInstanceOf(Error);
  });
});
