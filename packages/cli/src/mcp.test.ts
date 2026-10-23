import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { copyApp, installCompiler, testCtx } from '../test/app.ts';
import type { LogsResult } from './commands/logs.ts';
import type { RequestResult } from './commands/request.ts';
import type { Ctx } from './ctx.ts';
import { writeLock } from './dev/lock.ts';
import type { LogEntry } from './dev/log.ts';
import { main } from './main.ts';
import { buildServer, TOOLS } from './mcp.ts';
import type { JsonEnvelope } from './output.ts';

vi.mock('vite', async (original) => (await import('../test/app.ts')).sourceVite(original));
vi.setConfig({ testTimeout: 60_000 });

declare global {
  // The fixture's POST handler counts its calls here.
  var fixtureCreates: number | undefined;
}

const ITEMS = `
import { defineContract, get, post } from '@usevibejs/contract';
import { Controller, Handle, Module } from '@usevibejs/server';

const any = { '~standard': { version: 1, vendor: 'fixture', validate: (value) => ({ value }) } };
const items = defineContract('/items', {
  list: get('/', { response: any }),
  create: post('/', { body: any, response: any, status: 201 }),
  big: get('/big', { response: any }),
});

@Controller(items)
class ItemsController {
  @Handle(items.list) list() {
    console.log('app output');
    return [{ id: 1 }];
  }
  @Handle(items.create) create(ctx) {
    globalThis.fixtureCreates = (globalThis.fixtureCreates ?? 0) + 1;
    return { id: 2, ...ctx.body, header: ctx.req.headers.get('x-test') };
  }
  @Handle(items.big) big() { return { data: 'x'.repeat(30 * 1024) }; }
}

@Module({ controllers: [ItemsController] })
export class AppModule {}

export const appOptions = { basePath: '/api' };
`;

const ITEM = `<script setup lang="ts">
const { label } = defineProps<{ label: string }>();
</script>

<template><li>{{ label }}</li></template>
`;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const LOG: LogEntry[] = [
  { t: ago(5000), level: 'error', source: 'vite', msg: 'Bad', code: 'VIBE3005', file: 'a.vibe' },
  { t: ago(4000), level: 'error', source: 'server', msg: 'Handler failed', code: 'VIBE9503' },
  ...Array.from({ length: 60 }, (_, i) => ({
    t: ago(3000 - i),
    level: 'warn' as const,
    source: 'browser' as const,
    msg: `warning ${i}`,
  })),
];

let root: string;
beforeAll(() => {
  root = copyApp();
  writeFileSync(join(root, 'server/src/app.module.ts'), ITEMS);
  installCompiler(root);
  writeFileSync(join(root, 'ui/src/Item.vibe'), ITEM);
  mkdirSync(join(root, '.vibejs'));
  writeFileSync(join(root, '.vibejs/dev.log'), LOG.map((e) => `${JSON.stringify(e)}\n`).join(''));
  mkdirSync(join(root, 'docs/server'), { recursive: true });
  writeFileSync(
    join(root, 'docs/server/di.md'),
    '# Dependency injection\n\nA quokka provides the modules.\n',
  );
  return () => rmSync(root, { recursive: true, force: true });
});
afterEach(() => {
  globalThis.fixtureCreates = undefined;
});

/** A context for the fixture that records stdout and stderr, with the fixture's docs. */
function fixtureCtx(): ReturnType<typeof testCtx> {
  const t = testCtx(root, false);
  t.ctx.docsDir = join(root, 'docs');
  return t;
}

/** A client connected to `buildServer` over an in-memory transport pair. */
async function connect(ctx: Ctx, readOnly = false): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await buildServer(ctx, { readOnly }).connect(serverSide);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
  return client;
}

/** Any result of the tools, for reading the fields a test checks. */
type ToolResult = JsonEnvelope & Partial<LogsResult & RequestResult>;

/** Calls a tool; returns its parsed text and `isError`. */
async function call(client: Client, name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  const [content] = r.content;
  const result: ToolResult = JSON.parse(content.type === 'text' ? content.text : '');
  return { result, isError: r.isError };
}

/** What `vibejs <cmd> --json ...argv` prints in agent mode for the tool and input. */
async function cli(name: string, args: Record<string, unknown>): Promise<JsonEnvelope> {
  const t = fixtureCtx();
  t.ctx.agent = { active: true };
  const { command, argv } = TOOLS.find((tool) => tool.name === name)!;
  await main([command, '--json', ...argv(args)], t.ctx);
  return JSON.parse(t.out.join(''));
}

it('lists the tools in C9 order, each with its input schema', async () => {
  const client = await connect(fixtureCtx().ctx);
  expect(client.getServerVersion()).toMatchObject({ name: 'vibejs', version: '1.2.3' });
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name)).toEqual([
    'get_errors',
    'get_logs',
    'get_routes',
    'get_di_graph',
    'get_component_tree',
    'check',
    'request',
    'explain',
  ]);
  expect(tools).toMatchSnapshot();
});

describe('mirror: each tool answers like its --json command', () => {
  const cases: [string, Record<string, unknown>, boolean][] = [
    ['get_errors', {}, true],
    ['get_errors', { limit: 1 }, true],
    ['get_logs', { level: 'error', source: 'server' }, true],
    ['get_logs', { grep: '-warning 5', since: '1h', limit: 3 }, true],
    ['get_logs', { since: 'yesterday' }, false],
    ['get_routes', {}, true],
    ['get_routes', { kind: 'ui' }, true],
    ['get_di_graph', {}, true],
    ['get_di_graph', { module: 'Nope', token: 'X' }, true],
    ['get_component_tree', {}, true],
    ['get_component_tree', { name: 'Nope' }, true],
    ['check', { only: ['types', 'lint'], max: 5 }, false],
    ['request', { method: 'GET', path: '/api/items' }, true],
    [
      'request',
      { method: 'POST', path: '/api/items', body: { a: 1 }, headers: { 'x-test': 'yes' } },
      true,
    ],
    ['request', { method: 'GET', path: 'api' }, false],
    ['request', { method: 'GET', path: '/api/items', body: null }, false],
    ['request', { method: 'GET', path: '-h' }, false],
    ['explain', { query: 'VIBE8502' }, true],
    ['explain', { query: 'VIBE0000' }, false],
    ['explain', { query: 'server/di' }, true],
    ['explain', { query: 'quokka modules' }, true],
    ['explain', { query: '--read-only' }, true],
    ['explain', { query: '--version' }, true],
  ];

  it.for(cases)('%s %j', async ([name, args, ok]) => {
    const t = fixtureCtx();
    const client = await connect(t.ctx);
    const { result, isError } = await call(client, name, args);
    expect(result.ok).toBe(ok);
    expect(isError).toBe(!ok);
    // Each response has its own request id.
    const id = /"x-request-id":"[^"]+"/g;
    const text = (r: JsonEnvelope) => JSON.stringify(r).replaceAll(id, '');
    expect(text(result)).toEqual(text(await cli(name, args)));
    // Command output goes to stderr only; stdout is for protocol frames.
    expect(t.out).toEqual([]);
  });

  it('gives each failure its VIBE code', async () => {
    const client = await connect(fixtureCtx().ctx);
    const code = async (name: string, args: Record<string, unknown>) =>
      (await call(client, name, args)).result.error?.code;
    expect(await code('explain', { query: 'VIBE0000' })).toBe('VIBE8008');
    expect(await code('request', { method: 'GET', path: 'api' })).toBe('VIBE8503');
    expect(await code('get_logs', { since: 'yesterday' })).toBe('VIBE8004');
    // A value that starts with `-` stays a value.
    expect(await code('request', { method: 'GET', path: '-h' })).toBe('VIBE8503');
  });

  it('reads an explain query that starts with - as a query, not an option', async () => {
    const client = await connect(fixtureCtx().ctx);
    for (const query of ['--version', '-h', '--read-only']) {
      const { result } = await call(client, 'explain', { query });
      expect(result).toMatchObject({ ok: true, command: 'docs', mode: 'search' });
    }
  });

  it('rejects an empty check.only list before the command runs', async () => {
    const client = await connect(fixtureCtx().ctx);
    const r = await client.callTool({ name: 'check', arguments: { only: [] } });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).not.toContain('VIBE8004');
  });

  it('answers explain with the catalog entry, the page or the search hits', async () => {
    const client = await connect(fixtureCtx().ctx);
    const docs = async (query: string) => (await call(client, 'explain', { query })).result;
    expect(await docs('VIBE8502')).toMatchObject({ mode: 'code', entry: { code: 'VIBE8502' } });
    expect(await docs('server/di')).toMatchObject({ mode: 'page', page: { path: 'server/di' } });
    expect(await docs('quokka')).toMatchObject({
      mode: 'search',
      hits: [{ path: 'server/di' }],
    });
  });
});

describe('--read-only', () => {
  it('allows only GET, HEAD and OPTIONS requests and leaves the other tools as they are', async () => {
    const all = await (await connect(fixtureCtx().ctx)).listTools();
    const client = await connect(fixtureCtx().ctx, true);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(all.tools.map((t) => t.name));
    const methods = (list: typeof tools) =>
      Object(list.find((t) => t.name === 'request')!.inputSchema.properties).method.enum;
    expect(methods(tools)).toEqual(['GET', 'HEAD', 'OPTIONS']);
    expect(methods(all.tools)).toEqual([
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ]);
    expect(tools.filter((t) => t.name !== 'request')).toEqual(
      all.tools.filter((t) => t.name !== 'request'),
    );

    const post = await client.callTool({
      name: 'request',
      arguments: { method: 'POST', path: '/api/items', body: {} },
    });
    expect(post.isError).toBe(true);
    expect(globalThis.fixtureCreates).toBeUndefined();
    const get = await call(client, 'request', { method: 'GET', path: '/api/items' });
    expect(get.result).toMatchObject({ ok: true, response: { status: 200, body: [{ id: 1 }] } });
  });

  it('is off by default: a POST reaches the app', async () => {
    const client = await connect(fixtureCtx().ctx);
    const r = await call(client, 'request', { method: 'POST', path: '/api/items', body: {} });
    expect(r.result).toMatchObject({ ok: true, response: { status: 201 } });
    expect(globalThis.fixtureCreates).toBe(1);
  });
});

describe('agent caps', () => {
  it('cuts a response body to 20 KB, even for a client of a person', async () => {
    const t = fixtureCtx();
    expect(t.ctx.agent.active).toBe(false);
    const client = await connect(t.ctx);
    const { result } = await call(client, 'request', { method: 'GET', path: '/api/items/big' });
    const { response } = result;
    expect(response!.truncated).toEqual({ shown: 20 * 1024, total: 30 * 1024 + 11 });
    expect(String(response!.body)).toHaveLength(20 * 1024);
  });

  it('keeps get_logs to 50 entries', async () => {
    const client = await connect(fixtureCtx().ctx);
    const { result } = await call(client, 'get_logs', { limit: 100 });
    expect(result.entries).toHaveLength(50);
  });
});

it('finds the running dev server through .vibejs/dev.lock', async () => {
  writeLock(root, {
    pid: process.pid,
    url: 'http://127.0.0.1:5999/',
    port: 5999,
    apiPrefix: '/api',
    logFile: '.vibejs/dev.log',
    startedAt: new Date().toISOString(),
    version: '1.2.3',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) =>
      String(input).endsWith('/__vibejs/health')
        ? Response.json({ name: 'vibejs-dev', pid: process.pid })
        : Response.json([{ id: 7 }]),
    ),
  );
  try {
    const client = await connect(fixtureCtx().ctx);
    const { result } = await call(client, 'request', { method: 'GET', path: '/api/items' });
    expect(result).toMatchObject({ mode: 'http', response: { body: [{ id: 7 }] } });
  } finally {
    rmSync(join(root, '.vibejs/dev.lock'), { force: true });
  }
});
