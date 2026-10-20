import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { expect, it } from 'vitest';
import type { DiResult } from './commands/di.ts';
import type { DocsResult } from './output.ts';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const TODO = fileURLToPath(new URL('../../../examples/todo', import.meta.url));
const ENV = { ...process.env, VIBEJS_AGENT: '1' };

type ToolResult = Partial<DiResult & DocsResult>;

/** The parsed text of a tool result. */
function parse(r: { content: unknown }): ToolResult {
  const [{ text }]: { text: string }[] = Object(r).content;
  return JSON.parse(text);
}

it('serves the todo project over stdio to an MCP client', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BIN, 'mcp'],
    cwd: TODO,
    env: ENV,
    stderr: 'ignore',
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
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
  const explain = await client.callTool({ name: 'explain', arguments: { query: 'VIBE8502' } });
  expect(parse(explain)).toMatchObject({ ok: true, entry: { code: 'VIBE8502' } });
  const di = await client.callTool({ name: 'get_di_graph', arguments: {} });
  expect(parse(di).modules?.length).toBeGreaterThan(0);
  await client.close();
}, 60_000);

it('writes only JSON-RPC frames to stdout and exits 0 when stdin closes', async () => {
  const child = spawn(process.execPath, [BIN, 'mcp'], { cwd: TODO, env: ENV });
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', (s: string) => (stdout += s));
  const send = (message: object) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const answered = async (count: number) =>
    await expect
      .poll(() => stdout.split('\n').filter(Boolean).length, { timeout: 30_000 })
      .toBe(count);

  send({
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    },
  });
  await answered(1);
  send({ method: 'notifications/initialized' });
  // In process, or through the dev server that introspect.integration.test.ts may run in
  // examples/todo at the same time; that file asserts each mode.
  send({
    id: 2,
    method: 'tools/call',
    params: { name: 'request', arguments: { method: 'GET', path: '/api/todos' } },
  });
  send({ id: 3, method: 'tools/call', params: { name: 'check', arguments: { only: ['format'] } } });
  await answered(3);
  child.stdin.end();
  const [code] = await once(child, 'exit');
  expect(code).toBe(0);

  const lines = stdout
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
  // The closing envelope of `vibejs mcp --json` follows the session.
  expect(lines.pop()).toMatchObject({ ok: true, command: 'mcp' });
  // The two tool calls run concurrently, so they may answer in either order.
  lines.sort((a, b) => a.id - b.id);
  expect(lines.map((m) => [m.jsonrpc, m.id])).toEqual([
    ['2.0', 1],
    ['2.0', 2],
    ['2.0', 3],
  ]);
  expect(parse(lines[1].result)).toMatchObject({ ok: true, response: { status: 200 } });
}, 60_000);

it('answers mcp --help --json', () => {
  const { status, stdout } = spawnSync(process.execPath, [BIN, 'mcp', '--help', '--json'], {
    cwd: TODO,
    encoding: 'utf8',
  });
  expect(status).toBe(0);
  expect(JSON.parse(stdout)).toMatchObject({ ok: true, command: 'help' });
});
