import { Client } from '@modelcontextprotocol/client';
import type { Transport } from '@modelcontextprotocol/server';
import { expect, it, vi } from 'vitest';
import { testCtx } from '../../test/app.ts';
import { main } from '../main.ts';
import { mcp } from './mcp.ts';

const sdk = vi.hoisted(() => ({ loaded: false, client: undefined as Transport | undefined }));

vi.mock('@modelcontextprotocol/server', async (original) => {
  sdk.loaded = true;
  return original();
});

// The stdio transport of the process becomes one end of an in-memory pair; the test is the client.
vi.mock('@modelcontextprotocol/server/stdio', async () => {
  const { InMemoryTransport } = await import('@modelcontextprotocol/server');
  return {
    StdioServerTransport: function StdioServerTransport() {
      const [client, server] = InMemoryTransport.createLinkedPair();
      sdk.client = client;
      return server;
    },
  };
});

/** Starts `vibejs mcp` and connects a client to it. */
async function start(readOnly = false) {
  const t = testCtx(process.cwd());
  const done = mcp.run({ values: { 'read-only': readOnly }, positionals: [] }, t.ctx);
  await vi.waitFor(() => expect(sdk.client).toBeDefined());
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(sdk.client!);
  sdk.client = undefined;
  return { t, done, client };
}

// First, before any test loads the MCP server.
it('does not load the MCP SDK for other commands', async () => {
  const t = testCtx(process.cwd());
  expect(await main(['explain', 'VIBE8003'], t.ctx)).toBe(0);
  expect(await main(['mcp', '--help', '--json'], t.ctx)).toBe(0);
  expect(JSON.parse(t.out[1])).toMatchObject({ ok: true, command: 'help' });
  expect(sdk.loaded).toBe(false);
});

it('serves the tools until stdin closes', async () => {
  const { done, client } = await start();
  expect((await client.listTools()).tools).toHaveLength(6);
  await client.close();
  expect(await done).toEqual({
    ok: true,
    command: 'mcp',
    version: '1.2.3',
    tools: ['get_errors', 'get_logs', 'get_di_graph', 'check', 'request', 'explain'],
  });
  expect(sdk.loaded).toBe(true);
});

it('stops on a signal, and passes --read-only on', async () => {
  const { t, done, client } = await start(true);
  const { tools } = await client.listTools();
  const request = tools.find((tool) => tool.name === 'request')!;
  expect(Object(request.inputSchema.properties).method.enum).toEqual(['GET', 'HEAD', 'OPTIONS']);
  t.stop();
  expect(await done).toMatchObject({ ok: true });
});

it('sends console output to stderr while it serves', async () => {
  const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const { done, client } = await start();
  // oxlint-disable-next-line eslint/no-console -- what app code run in process may do
  console.log('app output');
  await client.close();
  await done;
  expect(write).toHaveBeenCalledWith('app output\n', expect.any(Function));
  write.mockRestore();
});

it('lists the tools for people', () => {
  const r = { ok: true, command: 'mcp', version: '1.2.3', tools: ['get_errors', 'explain'] };
  expect(mcp.human(r)).toBe('Served the MCP tools get_errors, explain.');
});
