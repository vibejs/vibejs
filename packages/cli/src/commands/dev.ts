import { realpathSync } from 'node:fs';
import { createLogger, createServer } from 'vite';
import type { CommandDef } from '../command.ts';
import { createDevLog, LOG_FILE, type LogEntry } from '../dev/log.ts';
import { readLiveLock, removeLock, writeLock } from '../dev/lock.ts';
import { viteLogger, vibejsDev } from '../dev/plugin.ts';
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
    const root = realpathSync(found);

    // NDJSON on stdout for agents (C9); text for people, after Vite's own output.
    const stream = values.json === true || ctx.agent.active;
    const emit = (e: DevEvent) => {
      if (stream) ctx.out(`${JSON.stringify(e)}\n`);
    };

    const lock = await readLiveLock(root);
    if (lock) {
      const { url, pid } = lock;
      emit({ event: 'ready', url, pid, logFile: LOG_FILE, reused: true });
      return { ...base, url, pid, reused: true };
    }

    const log = createDevLog(root, {
      onEntry(e) {
        if (e.level !== 'warn' && e.level !== 'error') return;
        if (stream) emit({ event: 'log', ...e });
        // Vite prints its own and the browser's messages.
        else if (e.source === 'server' || e.source === 'vibejs')
          ctx.err(`[${e.source}] ${e.msg}\n`);
      },
    });
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
    const apiPrefix = await plugin.api();
    const api = apiPrefix === undefined ? undefined : new URL(apiPrefix, url).href;
    const { pid } = process;
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
    removeLock(root, pid);
    log.close();
    return { ...base, url, pid };
  },
  human: (r) =>
    r.reused
      ? `vibejs dev is already running at ${r.url} (pid ${r.pid}). Stop it with: kill ${r.pid}`
      : 'vibejs dev stopped.',
};
