import { Console } from 'node:console';
import type { CommandDef } from '../command.ts';
import type { JsonEnvelope } from '../output.ts';

export interface McpResult extends JsonEnvelope {
  /** The registered tools, in order. */
  tools: string[];
}

export const mcp: CommandDef<McpResult> = {
  name: 'mcp',
  summary: 'Serve the --json commands to coding agents as MCP tools over stdio.',
  usage: 'vibejs mcp [--read-only]',
  examples: ['vibejs mcp', 'vibejs mcp --read-only'],
  options: {
    'read-only': {
      type: 'boolean',
      description: 'Allow only GET, HEAD and OPTIONS requests through the request tool.',
    },
  },
  positionals: [],
  async run({ values }, ctx) {
    // Loaded here, so the other commands start without the MCP SDK.
    const { buildServer, StdioServerTransport, TOOLS } = await import('../mcp.ts');
    const server = buildServer(ctx, { readOnly: values['read-only'] === true });
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- the SDK has only this hook
    const closed = new Promise<void>((resolve) => (server.server.onclose = resolve));
    // Stdout carries only protocol frames: app code run in process logs to stderr.
    const { console } = globalThis;
    globalThis.console = new Console(process.stderr);
    try {
      await server.connect(new StdioServerTransport());
      await Promise.race([closed, ctx.untilSignal()]);
    } finally {
      globalThis.console = console;
      await server.close();
    }
    return { ok: true, command: 'mcp', version: ctx.version, tools: TOOLS.map((t) => t.name) };
  },
  human: (r) => `Served the MCP tools ${r.tools.join(', ')}.`,
};
