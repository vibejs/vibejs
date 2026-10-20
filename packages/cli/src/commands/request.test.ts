import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyApp, testCtx } from '../../test/app.ts';
import { writeLock } from '../dev/lock.ts';
import { main } from '../main.ts';
import { exitCode } from '../output.ts';
import { lookup } from './explain.ts';
import { request, type RequestResult } from './request.ts';

vi.mock('vite', async (original) => (await import('../../test/app.ts')).sourceVite(original));
vi.setConfig({ testTimeout: 30_000 });

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  Reflect.deleteProperty(globalThis, 'fixtureShutdowns');
});

// Every route answers JSON, except where the test says otherwise.
const ITEMS = `
import { defineContract, get, post } from '@vibejs-org/contract';
import { Controller, Handle, inject, Logger, Module } from '@vibejs-org/server';

const any = { '~standard': { version: 1, vendor: 'fixture', validate: (value) => ({ value }) } };
const items = defineContract('/items', {
  list: get('/', { response: any }),
  create: post('/', { body: any, response: any, status: 201 }),
  missing: get('/missing', { errors: { ITEM_NOT_FOUND: 404 } }),
  coded: get('/coded', { errors: { VIBE9503: 500 } }),
  big: get('/big', { response: any }),
  noisy: get('/noisy', { response: any }),
});

@Controller(items)
class ItemsController {
  logger = inject(Logger);
  @Handle(items.list) list() { return [{ id: 1 }]; }
  @Handle(items.create) create(ctx) { return { id: 2, ...ctx.body, header: ctx.req.headers.get('x-test') }; }
  @Handle(items.missing) missing(ctx) { ctx.fail('ITEM_NOT_FOUND', 'No item'); }
  @Handle(items.coded) coded(ctx) { ctx.fail('VIBE9503'); }
  @Handle(items.big) big() { return { data: 'x'.repeat(30 * 1024) }; }
  @Handle(items.noisy) noisy() {
    for (let i = 0; i < 60; i++) this.logger.warn('warning ' + i);
    this.logger.info('not reported');
    return [];
  }
}

@Module({ controllers: [ItemsController] })
export class AppModule {
  onApplicationShutdown() {
    globalThis.fixtureShutdowns = (globalThis.fixtureShutdowns ?? 0) + 1;
  }
}

export const appOptions = { basePath: '/api' };
`;

function app(source = ITEMS): string {
  const root = copyApp();
  roots.push(root);
  writeFileSync(join(root, 'server/src/app.module.ts'), source);
  return root;
}

const run = (
  root: string,
  positionals: string[],
  values: Record<string, string | string[]> = {},
  agent = true,
) => request.run({ values, positionals }, testCtx(root, agent).ctx);

describe('in process', () => {
  it('answers with the JSON body and closes the app', async () => {
    const r = await run(app(), ['get', '/api/items']);
    expect(r).toEqual({
      ok: true,
      command: 'request',
      version: '1.2.3',
      mode: 'in-process',
      request: { method: 'GET', url: 'http://localhost/api/items' },
      response: {
        status: 200,
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
        body: [{ id: 1 }],
      },
      logs: [],
    });
    expect(Object.keys(r)).toEqual([
      'ok',
      'command',
      'version',
      'next',
      'mode',
      'request',
      'response',
      'problem',
      'logs',
    ]);
    expect(Reflect.get(globalThis, 'fixtureShutdowns')).toBe(1);
    expect(exitCode(r)).toBe(0);
  });

  it('sends --data as JSON, inline or from @file, with -H headers', async () => {
    const root = app();
    writeFileSync(join(root, 'item.json'), '{"name":"from file"}');
    const inline = await run(root, ['POST', '/api/items'], {
      data: '{"name":"inline"}',
      header: ['X-Test: yes'],
    });
    expect(inline.response).toMatchObject({
      status: 201,
      body: { id: 2, name: 'inline', header: 'yes' },
    });
    const file = await run(root, ['POST', '/api/items'], { data: '@item.json' });
    expect(file.response).toMatchObject({ status: 201, body: { id: 2, name: 'from file' } });
    // A content type from -H is kept: the server rejects it.
    const typed = await run(root, ['POST', '/api/items'], {
      data: '{}',
      header: ['content-type: text/plain'],
    });
    expect(typed.response).toMatchObject({ status: 415 });
  });

  it('returns a contract error as a result, with no problem entry', async () => {
    const r = await run(app(), ['GET', '/api/items/missing']);
    expect(r).toMatchObject({
      ok: true,
      response: { status: 404, body: { code: 'ITEM_NOT_FOUND', detail: 'No item' } },
    });
    expect(r.problem).toBeUndefined();
    expect(r.next).toBeUndefined();
    expect(exitCode(r)).toBe(0);
  });

  it('attaches the docs and fixes of a catalog code', async () => {
    const r = await run(app(), ['GET', '/api/items/coded']);
    expect(r).toMatchObject({
      ok: true,
      next: ['vibejs explain VIBE9503'],
      response: { status: 500, body: { code: 'VIBE9503' } },
      problem: {
        code: 'VIBE9503',
        docs: 'https://vibejs.org/v0/errors/VIBE9503',
        fixes: lookup('VIBE9503')!.fixes,
      },
    });
  });

  it('cuts a body over 20 KB in agent mode and keeps it as text', async () => {
    const root = app();
    const r = await run(root, ['GET', '/api/items/big']);
    expect(r.response!.truncated).toEqual({ shown: 20 * 1024, total: 30 * 1024 + 11 });
    expect(r.response!.body).toBe(`{"data":"${'x'.repeat(20 * 1024 - 9)}`);
    const full = await run(root, ['GET', '/api/items/big'], {}, false);
    expect(full.response).toMatchObject({ body: { data: 'x'.repeat(30 * 1024) } });
    expect(full.response!.truncated).toBeUndefined();
  });

  it('reports the last 50 server warnings and errors', async () => {
    const r = await run(app(), ['GET', '/api/items/noisy']);
    expect(r.logs).toHaveLength(50);
    expect(r.logs![0]).toEqual({
      t: expect.any(String),
      level: 'warn',
      source: 'server',
      msg: 'warning 10',
      code: undefined,
      stack: undefined,
    });
  });

  it('answers HEAD with a null body', async () => {
    const r = await run(app(), ['HEAD', '/api/items']);
    expect(r.response).toMatchObject({ status: 200, body: null });
  });

  it.each([
    ['a syntax error', 'export class AppModule {', 'VIBE8501'],
    ['wrong exports', 'export const x = 1;', 'VIBE8202'],
    [
      'a provider that fails',
      "import { Module } from '@vibejs-org/server';\nclass Bad { constructor() { throw new Error('no'); } }\n@Module({ providers: [Bad] })\nexport class AppModule {}\nexport const appOptions = { basePath: '/api' };",
      'VIBE9105',
    ],
  ])('reports %s as its code', async (_, source, code) => {
    const r = await run(app(source), ['GET', '/api/items']);
    expect(r).toEqual({
      ok: false,
      command: 'request',
      version: '1.2.3',
      error: expect.objectContaining({ code }),
    });
    expect(exitCode(r)).toBe(1);
  });
});

describe('through the dev server', () => {
  const DEV_URL = 'http://127.0.0.1:5999/';

  /** A live lock for `root`, with `fetch` answering the health check and then `answer`. */
  function live(root: string, answer: (url: string, init: RequestInit) => Promise<Response>) {
    writeLock(root, {
      pid: process.pid,
      url: DEV_URL,
      port: 5999,
      apiPrefix: '/api',
      logFile: '.vibejs/dev.log',
      startedAt: new Date().toISOString(),
      version: '1.2.3',
    });
    const fetch = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async (input, init = {}) =>
        String(input).endsWith('/__vibejs/health')
          ? Response.json({ name: 'vibejs-dev', pid: process.pid })
          : answer(String(input), init),
    );
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  it('sends the request to the running server', async () => {
    const root = app();
    const fetch = live(root, async () => Response.json([{ id: 7 }]));
    const r = await run(root, ['POST', '/api/items'], { data: '{"a":1}' });
    expect(r).toMatchObject({
      ok: true,
      mode: 'http',
      request: { method: 'POST', url: `${DEV_URL}api/items` },
      response: { status: 200, body: [{ id: 7 }] },
    });
    expect(r.logs).toBeUndefined();
    const init: RequestInit = fetch.mock.calls[1][1] ?? {};
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('adds the logs command to a 5xx and the docs of a catalog code', async () => {
    const root = app();
    const body = { type: 'x', title: 'Service Unavailable', status: 503, code: 'VIBE8203' };
    live(root, async () =>
      Response.json(body, { status: 503, headers: { 'content-type': 'application/problem+json' } }),
    );
    const r = await run(root, ['GET', '/api/items']);
    expect(r).toMatchObject({
      ok: true,
      next: ['vibejs explain VIBE8203', 'vibejs logs --source server --level warn'],
      response: { status: 503, body },
      problem: { code: 'VIBE8203', docs: 'https://vibejs.org/v0/errors/VIBE8203' },
    });
    expect(exitCode(r)).toBe(0);
  });

  it('keeps a JSON body that does not parse as text', async () => {
    const root = app();
    live(root, async () => new Response('{', { headers: { 'content-type': 'application/json' } }));
    expect((await run(root, ['GET', '/api/items'])).response).toMatchObject({ body: '{' });
  });

  it('reports every set-cookie header', async () => {
    const root = app();
    const headers = new Headers([
      ['set-cookie', 'a=1'],
      ['set-cookie', 'b=2'],
    ]);
    live(root, async () => new Response(null, { headers }));
    const r = await run(root, ['GET', '/api/items']);
    expect(r.response!.headers).toEqual({ 'set-cookie': ['a=1', 'b=2'] });
  });

  it('cuts the body by UTF-8 bytes without splitting a character', async () => {
    const root = app();
    // U+00E9 is 2 bytes and U+1F600 is 4: byte 20 KB falls inside a character.
    const text = 'a' + '\u00e9'.repeat(10 * 1024 - 1) + '\u{1F600}'.repeat(10);
    live(root, async () => new Response(text));
    const r = await run(root, ['GET', '/api/items']);
    expect(r.response!.truncated).toEqual({ shown: 20 * 1024 - 1, total: 20 * 1024 - 1 + 40 });
    expect(r.response!.body).toBe(text.slice(0, 10 * 1024));
  });

  it('keeps a body without a content type as text', async () => {
    const root = app();
    live(root, async () => new Response(new TextEncoder().encode('bytes')));
    const r = await run(root, ['GET', '/api/items']);
    expect(r.response).toEqual({ status: 200, headers: {}, body: 'bytes' });
    expect(r.problem).toBeUndefined();
  });

  it('reports a server that stops answering with VIBE8502', async () => {
    const root = app();
    live(root, () => Promise.reject(new TypeError('fetch failed')));
    const r = await run(root, ['GET', '/api/items']);
    expect(r).toMatchObject({
      ok: false,
      next: ['vibejs dev'],
      error: {
        code: 'VIBE8502',
        message: `The request to \`${DEV_URL}api/items\` could not be made: TypeError: fetch failed.`,
      },
    });
    expect(exitCode(r)).toBe(1);
  });
});

describe('input errors', () => {
  it.each([
    [['GET', 'api/items'], {}, 'the path `api/items` does not start with one /'],
    [['GET', '//example.com/x'], {}, 'the path `//example.com/x` does not start with one /'],
    [['POST', '/api/items'], { data: '{' }, '`--data` is not JSON'],
    [['POST', '/api/items'], { data: '@missing.json' }, 'cannot read `missing.json` (ENOENT)'],
    [['GET', '/api/items'], { data: '{}' }, 'a GET request has no body'],
    [['GET', '/api/items'], { header: ['no colon'] }, 'the header `no colon` is not `Name: value`'],
    [['GET', '/api/items'], { header: [': x'] }, 'the header `: x` is not `Name: value`'],
    [
      ['GET', '/api/items'],
      { header: ['bad name: x'] },
      'the header `bad name: x` is not `Name: value`',
    ],
  ])('rejects %o %o with VIBE8503', async (positionals, values, reason) => {
    const r = await run(process.cwd(), positionals, values);
    expect(r).toMatchObject({
      ok: false,
      next: ['vibejs request --help'],
      error: { code: 'VIBE8503', message: `Invalid request input: ${reason}.` },
    });
    expect(exitCode(r)).toBe(2);
  });

  it('rejects an unknown method with VIBE8004', async () => {
    const r = await run(process.cwd(), ['FETCH', '/api']);
    expect(r).toMatchObject({
      ok: false,
      error: { code: 'VIBE8004', message: expect.stringContaining('METHOD FETCH') },
    });
    expect(exitCode(r)).toBe(2);
  });

  it.each([[['request']], [['request', 'GET']]])(
    'answers %o with VIBE8003 and the missing input',
    async (argv) => {
      const t = testCtx(process.cwd());
      expect(await main(argv, t.ctx)).toBe(2);
      const r: RequestResult = JSON.parse(t.out.join(''));
      expect(r.error).toMatchObject({
        code: 'VIBE8003',
        missing: [{ name: argv[1] ? 'path' : 'METHOD' }],
      });
    },
  );

  it('reports VIBE8001 outside a project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibejs-request-'));
    roots.push(dir);
    const r = await run(dir, ['GET', '/api']);
    expect(r).toMatchObject({ ok: false, error: { code: 'VIBE8001' } });
    expect(r.next).toBeUndefined();
  });
});

describe('output', () => {
  it('prints one JSON document in agent mode', async () => {
    const t = testCtx(app());
    expect(await main(['request', 'GET', '/api/items'], t.ctx)).toBe(0);
    expect(t.out).toHaveLength(1);
    expect(t.out[0]).not.toContain('\u001b[');
    expect(JSON.parse(t.out[0])).toMatchObject({ ok: true, mode: 'in-process' });
  });

  it('prints the status, the body and the docs for people', async () => {
    const root = app();
    const lines = async (argv: string[]) => {
      const t = testCtx(root, false);
      await main(['request', ...argv], t.ctx);
      return t.out.join('');
    };
    expect(await lines(['GET', '/api/items'])).toBe('200 OK\n[\n  {\n    "id": 1\n  }\n]\n');
    expect(await lines(['HEAD', '/api/items'])).toBe('200 OK\n\n');
    expect(await lines(['GET', '/api/items/coded', '-H', 'x-request-id: r1'])).toMatchSnapshot();
  });

  it('prints a text body and an unknown status as they are', () => {
    const text = request.human({
      ok: true,
      command: 'request',
      version: '1',
      response: { status: 599, headers: {}, body: 'plain' },
    });
    expect(text).toBe('599\nplain');
  });

  it('answers --help as JSON and as text', async () => {
    const json = testCtx(process.cwd());
    expect(await main(['request', '--help', '--json'], json.ctx)).toBe(0);
    expect(JSON.parse(json.out.join(''))).toMatchObject({ ok: true, command: 'help' });
    const text = testCtx(process.cwd(), false);
    await main(['request', '--help'], text.ctx);
    expect(text.out.join('')).toMatchSnapshot();
  });
});
