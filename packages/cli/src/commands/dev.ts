import { setTimeout as sleep } from 'node:timers/promises';
import { dirname } from 'node:path';
import { isVibeError } from '@vibejs-org/errors';
import { projectAgentFiles, syncAgentFiles } from '../agents.ts';
import type { CommandDef } from '../command.ts';
import { SSR_OPTIONS } from '../dev/app-module.ts';
import { createDevLog, LOG_FILE, type LogEntry } from '../dev/log.ts';
import { claimLock, readLiveLock, removeLock, writeLock } from '../dev/lock.ts';
import { vibeError } from '../errors.gen.ts';
import { envelopeError, type JsonEnvelope } from '../output.ts';
import { fullstackRoot } from '../project.ts';

export type DevEvent =
  | { event: 'ready'; url: string; pid: number; api?: string; logFile: string; reused?: true }
  | { event: 'restart'; ms: number; ok: boolean }
  | ({ event: 'log' } & LogEntry);

export interface DevResult extends JsonEnvelope {
  url?: string;
  pid?: number;
  reused?: true;
}

const PORT = /^(?:0|[1-9]\d{0,4})$/;

/** How long `ready` waits for the first backend start to report the API. */
const API_WAIT = 10_000;

export const dev: CommandDef<DevResult> = {
  name: 'dev',
  summary: 'Serve the UI and the backend on one port, restarting the backend on server changes.',
  usage: 'vibejs dev [--port N]',
  examples: ['vibejs dev', 'vibejs dev --port 5173'],
  options: {
    port: {
      type: 'string',
      description: 'Listen on exactly this port (default: a free one from 5173).',
    },
  },
  positionals: [],
  async run({ values }, ctx) {
    const base = { ok: true, command: 'dev', version: ctx.version };
    const port = typeof values.port === 'string' ? values.port : undefined;
    if (port !== undefined && !(PORT.test(port) && Number(port) <= 65_535)) {
      const error = envelopeError(vibeError('VIBE8004', { name: `--port ${port}` }));
      return { ...base, ok: false, next: ['vibejs dev --help'], error };
    }
    const found = fullstackRoot(ctx.cwd, 'dev');
    if (typeof found !== 'string') return { ...base, ok: false, error: envelopeError(found) };
    const root = found;

    // NDJSON on stdout for agents (C9); text for people, after Vite's own output.
    const stream = values.json === true || ctx.agent.active;
    const emit = (e: DevEvent) => {
      if (stream) ctx.out(`${JSON.stringify(e)}\n`);
    };

    const { pid } = process;
    let lock = await readLiveLock(root);
    // Another vibejs dev may be starting: wait until it is ready (and reuse it) or gone.
    while (!lock && !claimLock(root, pid)) {
      await sleep(100);
      lock = await readLiveLock(root);
    }
    if (lock) {
      const { url } = lock;
      emit({ event: 'ready', url, pid: lock.pid, logFile: LOG_FILE, reused: true });
      return { ...base, url, pid: lock.pid, reused: true };
    }
    try {
      return await serve();
    } finally {
      removeLock(root, pid);
    }

    async function serve(): Promise<DevResult> {
      // Loaded here, so the other commands start without Vite.
      const { createLogger, createServer } = await import('vite');
      const { viteLogger, vibejsDev } = await import('../dev/plugin.ts');
      const log = createDevLog(root, {
        onEntry(e) {
          if (e.level !== 'warn' && e.level !== 'error') return;
          if (stream) emit({ event: 'log', ...e });
          // Vite prints its own and the browser's messages.
          else if (e.source === 'server' || e.source === 'vibejs')
            ctx.err(`[${e.source}] ${e.msg}\n`);
        },
      });
      // The agent files never stop dev: a malformed AGENTS.md (VIBE8601) or .mcp.json (VIBE8602)
      // stays as it is.
      try {
        syncAgentFiles(root, projectAgentFiles(root, dirname(ctx.docsDir)), true);
      } catch (error) {
        const coded = isVibeError(error) ? { msg: error.message, code: error.code } : undefined;
        log.write({ level: 'warn', source: 'vibejs', ...(coded ?? { msg: String(error) }) });
      }
      const plugin = vibejsDev({
        root,
        log,
        onRestart(ms, ok) {
          emit({ event: 'restart', ms, ok });
          if (!stream) ctx.out(`Backend ${ok ? 'restarted' : 'failed to restart'} in ${ms} ms\n`);
        },
      });
      const sigterm = process.listenerCount('SIGTERM');
      const server = await createServer({
        root: `${root}/ui`,
        customLogger: viteLogger(root, log, createLogger(stream ? 'silent' : 'info')),
        server: {
          port: port === undefined ? undefined : Number(port),
          strictPort: port !== undefined,
          forwardConsole: { unhandledErrors: true, logLevels: ['error', 'warn'] },
        },
        plugins: [plugin],
        ssr: SSR_OPTIONS,
      });
      // Vite exits on SIGTERM by itself; vibejs dev stops it and reports, as on SIGINT.
      for (const listener of process.listeners('SIGTERM').slice(sigterm)) {
        process.off('SIGTERM', listener);
      }
      try {
        await server.listen();
      } catch (error) {
        await server.close();
        log.close();
        if (!String(error).includes('already in use')) throw error;
        return { ...base, ok: false, error: envelopeError(vibeError('VIBE8204', { port: port! })) };
      }

      const url = server.resolvedUrls!.local[0];
      // A backend that is slow to start (such as a hanging onModuleInit) delays ready only so long.
      const apiPrefix = await Promise.race([
        plugin.api(),
        sleep(API_WAIT, undefined, { ref: false }),
      ]);
      const api = apiPrefix === undefined ? undefined : new URL(apiPrefix, url).href;
      writeLock(root, {
        pid,
        url,
        port: Number(new URL(url).port),
        apiPrefix,
        logFile: LOG_FILE,
        startedAt: new Date().toISOString(),
        version: ctx.version,
      });
      emit({ event: 'ready', url, pid, api, logFile: LOG_FILE });
      if (!stream) {
        server.printUrls();
        ctx.out(
          `vibejs dev is ready at ${url} (API ${api ?? 'not started'}). Stop it with Ctrl+C.\n`,
        );
      }

      await ctx.untilSignal();
      await server.close();
      log.close();
      return { ...base, url, pid };
    }
  },
  human: (r) =>
    r.reused
      ? `vibejs dev is already running at ${r.url} (pid ${r.pid}). Stop it with: kill ${r.pid}`
      : 'vibejs dev stopped.',
};
