import { readFileSync } from 'node:fs';
import { STATUS_CODES } from 'node:http';
import { resolve } from 'node:path';
import type { ErrorCode, VibeError } from '@vibejs-org/errors';
import type { CommandDef } from '../command.ts';
import { loadAppModule, loadError, withServerRunner } from '../dev/app-module.ts';
import { readLiveLock } from '../dev/lock.ts';
import type { DevLog, LogEntry } from '../dev/log.ts';
import { vibeError } from '../errors.gen.ts';
import { envelopeError, type JsonEnvelope } from '../output.ts';
import { fullstackRoot } from '../project.ts';
import { lookup } from './explain.ts';

export interface RequestResult extends JsonEnvelope {
  mode?: 'http' | 'in-process';
  request?: { method: string; url: string };
  response?: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
    truncated?: { shown: number; total: number };
  };
  /** For a problem+json response whose `code` is in the catalog. */
  problem?: { code: ErrorCode; docs: string; fixes: string[] };
  /** In process only: the server's warn and error entries, at most 50. */
  logs?: LogEntry[];
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
/** The agent-mode caps (C9): body characters and log entries. */
const AGENT_BODY = 20 * 1024;
const MAX_LOGS = 50;

/** The headers and body of the request, or why the input is invalid. */
function requestInit(
  method: string,
  path: string,
  values: Record<string, unknown>,
  cwd: string,
): RequestInit | string {
  // `//host/...` would name another host.
  if (!/^\/(?!\/)/.test(path)) return `the path \`${path}\` does not start with one /`;
  const headers = new Headers();
  for (const header of [values.header ?? []].flat().map(String)) {
    const at = header.indexOf(':');
    const bad = `the header \`${header}\` is not \`Name: value\``;
    if (at < 1) return bad;
    try {
      headers.append(header.slice(0, at).trim(), header.slice(at + 1).trim());
    } catch {
      return bad;
    }
  }
  const data = values.data;
  if (typeof data !== 'string') return { method, headers };
  if (method === 'GET' || method === 'HEAD') return `a ${method} request has no body`;
  let text = data;
  if (data.startsWith('@')) {
    try {
      text = readFileSync(resolve(cwd, data.slice(1)), 'utf8');
    } catch (error) {
      return `cannot read \`${data.slice(1)}\` (${Object(error).code})`;
    }
  }
  try {
    JSON.parse(text);
  } catch {
    return '`--data` is not JSON';
  }
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return { method, headers, body: text };
}

/** The response as C9 reports it; the body is cut to `max` characters. */
async function read(res: Response, max: number): Promise<NonNullable<RequestResult['response']>> {
  const text = await res.text();
  const headers = Object.fromEntries(res.headers);
  const truncated = text.length > max ? { shown: max, total: text.length } : undefined;
  let body: unknown = truncated ? text.slice(0, max) : text;
  if (text === '') body = null;
  else if (!truncated && /json/.test(headers['content-type'] ?? '')) {
    try {
      body = JSON.parse(text);
    } catch {
      // Kept as text.
    }
  }
  return { status: res.status, headers, body, truncated };
}

export const request: CommandDef<RequestResult> = {
  name: 'request',
  summary: 'Call an API route: through the running dev server, or in process when none runs.',
  usage: "vibejs request <METHOD> <path> [--data JSON|@file] [-H 'Name: value']...",
  examples: [
    'vibejs request GET /api/todos',
    `vibejs request POST /api/todos --data '{"title":"Write docs"}'`,
  ],
  options: {
    data: { type: 'string', description: 'The JSON body, inline or as @file.' },
    header: {
      type: 'string',
      short: 'H',
      multiple: true,
      description: "A request header, 'Name: value'; repeatable.",
    },
  },
  positionals: [
    { name: 'METHOD', required: true, values: METHODS, example: 'vibejs request GET /api/health' },
    { name: 'path', required: true, example: 'vibejs request GET /api/health' },
  ],
  async run({ values, positionals: [input, path] }, ctx) {
    const base = { ok: true, command: 'request', version: ctx.version };
    const fail = (e: VibeError, next?: string[]): RequestResult => ({
      ...base,
      ok: false,
      next,
      error: envelopeError(e),
    });
    const method = input.toUpperCase();
    if (!METHODS.includes(method)) {
      return fail(vibeError('VIBE8004', { name: `METHOD ${input}` }), ['vibejs request --help']);
    }
    const init = requestInit(method, path, values, ctx.cwd);
    if (typeof init === 'string') {
      return fail(vibeError('VIBE8503', { reason: init }), ['vibejs request --help']);
    }
    const root = fullstackRoot(ctx.cwd, 'request');
    if (typeof root !== 'string') return fail(root);

    const max = ctx.agent.active ? AGENT_BODY : Infinity;
    const lock = await readLiveLock(root);
    const url = new URL(path, lock?.url ?? 'http://localhost').href;
    let response: NonNullable<RequestResult['response']>;
    let logs: LogEntry[] | undefined;
    if (lock) {
      let res: Response;
      try {
        res = await fetch(url, init);
      } catch (error) {
        const reason = String(error).split('\n', 1)[0];
        return fail(vibeError('VIBE8502', { url, reason }, { cause: error }), ['vibejs dev']);
      }
      response = await read(res, max);
    } else {
      const entries: LogEntry[] = [];
      const log: Pick<DevLog, 'write'> = {
        write(e) {
          if (e.level === 'warn' || e.level === 'error') {
            entries.push({ t: new Date().toISOString(), ...e });
          }
        },
      };
      try {
        response = await withServerRunner(root, async (runner) => {
          const { server, AppModule, appOptions } = await loadAppModule(runner, root);
          const { serverLogger } = await import('../dev/plugin.ts');
          const logger = serverLogger(server.Logger, log);
          const app = await server.VibeFactory.create(AppModule, { ...appOptions, logger });
          try {
            return await read(await app.request(url, init), max);
          } finally {
            await app.close();
          }
        });
      } catch (error) {
        return fail(loadError(error));
      }
      logs = entries.slice(-MAX_LOGS);
    }

    const next: string[] = [];
    const type = response.headers['content-type'] ?? '';
    const code: unknown = Object(response.body).code;
    const entry =
      type.startsWith('application/problem+json') && typeof code === 'string'
        ? lookup(code)
        : undefined;
    if (entry) next.push(`vibejs explain ${entry.code}`);
    if (lock && response.status >= 500) next.push('vibejs logs --source server --level warn');
    return {
      ...base,
      next: next.length ? next : undefined,
      mode: lock ? 'http' : 'in-process',
      request: { method, url },
      response,
      problem: entry && { code: entry.code, docs: entry.docs, fixes: [...entry.fixes] },
      logs,
    };
  },
  human: (r) => {
    const { status, body } = r.response!;
    const text =
      typeof body === 'string' ? body : body === null ? '' : JSON.stringify(body, null, 2);
    const problem = r.problem
      ? [`Docs: ${r.problem.docs}`, ...r.problem.fixes.map((f) => `Fix: ${f}`)]
      : [];
    return [`${status} ${STATUS_CODES[status] ?? ''}`.trimEnd(), text, ...problem].join('\n');
  },
};
