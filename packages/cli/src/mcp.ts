import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { CommandDef } from './command.ts';
import { check } from './commands/check.ts';
import { di } from './commands/di.ts';
import { docs } from './commands/docs.ts';
import { errors } from './commands/errors.ts';
import { logs } from './commands/logs.ts';
import { request } from './commands/request.ts';
import type { Ctx } from './ctx.ts';
import { dispatch } from './main.ts';

export { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

export interface McpOptions {
  readOnly: boolean;
}

interface Tool {
  name: string;
  command: string;
  description: string;
  input: z.ZodObject;
  argv: (input: Record<string, unknown>) => string[];
}

const limit = z.int().min(1).optional();
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;

/** `--name=value` for each input field; a list is joined with commas. */
const flags: Tool['argv'] = (input) =>
  Object.entries(input).map(([name, value]) => `--${name}=${[value].flat().join(',')}`);

const tool = (
  def: CommandDef,
  name: string,
  when: string,
  input: z.ZodObject,
  argv: Tool['argv'] = flags,
): Tool => ({ name, command: def.name, description: `${def.summary}\n${when}`, input, argv });

const requestInput = (methods: readonly string[]) =>
  z.object({
    method: z.enum(methods),
    path: z.string().describe('The URL path, starting with the API prefix, e.g. /api/todos.'),
    body: z.unknown().optional().describe('The JSON body.'),
    headers: z.record(z.string(), z.string()).optional(),
  });

// Positionals follow `--`, so a value that starts with `-` is never read as an option.
const requestArgv: Tool['argv'] = ({ method, path, body, headers = {} }) => [
  ...(body === undefined ? [] : [`--data=${JSON.stringify(body)}`]),
  ...Object.entries(Object(headers)).map(([name, value]) => `--header=${name}: ${String(value)}`),
  '--',
  String(method),
  String(path),
];

/** One tool per row, in C9 order; `argv` maps the tool input to the command line. */
export const TOOLS: readonly Tool[] = [
  tool(
    errors,
    'get_errors',
    'Call it first when something is broken, and again after a fix to confirm.',
    z.object({ limit }),
  ),
  tool(
    logs,
    'get_logs',
    'Call it to see what the dev server, the browser and the backend printed.',
    z.object({
      limit,
      level: z.enum(['error', 'warn', 'info', 'debug']).optional(),
      source: z.enum(['vite', 'browser', 'server', 'vibejs']).optional(),
      grep: z.string().optional(),
      since: z.string().optional().describe('An ISO time, or <n>s, <n>m, <n>h ago.'),
    }),
  ),
  tool(
    di,
    'get_di_graph',
    'Call it before adding or wiring a provider, a module or an injection.',
    z.object({ module: z.string().optional(), token: z.string().optional() }),
  ),
  tool(
    check,
    'check',
    'Call it after every change; it reports diagnostics with docs links and fixes.',
    z.object({
      only: z
        .array(z.enum(['types', 'lint', 'format', 'test']))
        .min(1)
        .optional(),
      max: limit,
    }),
  ),
  tool(
    request,
    'request',
    'Call it to try a route after changing a handler or a contract.',
    requestInput(METHODS),
    requestArgv,
  ),
  tool(
    docs,
    'explain',
    'Call it with a VIBE code from any result, a docs path, or words to search the docs.',
    z.object({ query: z.string().describe('A VIBE code, a docs path or search words.') }),
    ({ query }) => ['--', String(query)],
  ),
];

/** The vibejs MCP server: the tools of TOOLS, in order, each answering like its `--json` command. */
export function buildServer(ctx: Ctx, options: McpOptions): McpServer {
  const server = new McpServer({ name: 'vibejs', version: ctx.version });
  // Agent caps apply, and nothing but protocol frames may reach stdout.
  const agentCtx: Ctx = { ...ctx, agent: { ...ctx.agent, active: true }, out: ctx.err.bind(ctx) };
  for (const { name, command, description, input, argv } of TOOLS) {
    const inputSchema: z.ZodObject =
      options.readOnly && name === 'request' ? requestInput(SAFE_METHODS) : input;
    server.registerTool(name, { description, inputSchema }, async (args) => {
      const [result] = await dispatch([command, '--json', ...argv(args)], agentCtx);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.ok };
    });
  }
  return server;
}
