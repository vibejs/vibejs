import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join, relative } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { isVibeError, type ErrorCode, type VibeError } from '@vibejs-org/errors';
import type * as Server from '@vibejs-org/server';
import type { NodeHttp1Handler } from 'srvx';
import { toNodeHandler } from 'srvx/node';
import {
  createServerModuleRunner,
  normalizePath,
  type LogErrorOptions,
  type Logger,
  type Plugin,
  type Rollup,
} from 'vite';
import { vibeError } from '../errors.gen.ts';
import { envelopeError } from '../output.ts';
import type { DevHealth } from './lock.ts';
import type { DevLog, LogEntry } from './log.ts';

const APP_MODULE = 'server/src/app.module.ts';

const isCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && /^VIBE\d{4}$/.test(value);

/** `file` (an absolute path or a Vite id) relative to `root`, with `/` separators. */
const rel = (root: string, file: string) =>
  relative(root, file.split('?', 1)[0]).replaceAll('\\', '/');

/** Messages Vite forwards from the browser console (`server.forwardConsole`). */
const BROWSER = /^\[(?:console\.\w+|Unhandled (?:error|rejection))\]/;

/** The code and location of a C2 error (a Vite error with a VIBE code and an `id`). */
function located(root: string, error?: Rollup.RollupError | null): Partial<LogEntry> {
  if (!error?.id || !isCode(error.code)) return {};
  const { code, id, loc } = error;
  return { code, file: rel(root, id), line: loc?.line, column: loc?.column };
}

/**
 * Prints through `base` and writes each message to the dev log: `source: 'browser'` for messages
 * forwarded from the browser, `'vite'` otherwise, with the location of a C2 error that has a VIBE code.
 */
export function viteLogger(root: string, log: DevLog, base: Logger): Logger {
  const tee =
    (level: LogEntry['level'], print: (msg: string, options?: LogErrorOptions) => void) =>
    (msg: string, options?: LogErrorOptions) => {
      print(msg, options);
      const text = stripVTControlCharacters(msg).trim();
      const source = BROWSER.test(text) ? 'browser' : 'vite';
      log.write({ level, source, msg: text, ...located(root, options?.error) });
    };
  return {
    ...base,
    info: tee('info', (msg, options) => base.info(msg, options)),
    warn: tee('warn', (msg, options) => base.warn(msg, options)),
    warnOnce: tee('warn', (msg, options) => base.warnOnce(msg, options)),
    error: tee('error', (msg, options) => base.error(msg, options)),
  };
}

/** A logger of the project's `@vibejs-org/server` that writes `source: 'server'` entries. */
export function serverLogger(
  Base: typeof Server.Logger,
  log: DevLog,
  fields: Server.LogFields = {},
): Server.Logger {
  const write = (level: LogEntry['level'], msg: string, more?: Server.LogFields) => {
    const all = { ...fields, ...more };
    const error = [all.error, all.cause].find((value) => value instanceof Error);
    const code = isCode(all.code) ? all.code : undefined;
    log.write({ level, source: 'server', msg, code, stack: error?.stack });
  };
  return new (class extends Base {
    debug(msg: string, more?: Server.LogFields) {
      write('debug', msg, more);
    }
    info(msg: string, more?: Server.LogFields) {
      write('info', msg, more);
    }
    warn(msg: string, more?: Server.LogFields) {
      write('warn', msg, more);
    }
    error(msg: string, more?: Server.LogFields) {
      write('error', msg, more);
    }
    child(more: Server.LogFields) {
      return serverLogger(Base, log, { ...fields, ...more });
    }
  })();
}

function sendProblem(res: ServerResponse, e: VibeError): void {
  const { code, docs } = e;
  const detail = envelopeError(e).message;
  const body = { type: docs, title: 'Service Unavailable', status: 503, code, detail };
  res.statusCode = 503;
  res.setHeader('content-type', 'application/problem+json');
  res.end(JSON.stringify({ ...body, requestId: randomUUID() }));
}

export type DevPlugin = Plugin & {
  /** The API base path once the first start settles; `undefined` when it failed. */
  api(): Promise<string | undefined>;
};

/**
 * Serves `/__vibejs/health` and runs the backend of `server/src/app.module.ts` through Vite's SSR
 * module runner, mounted at its `appOptions.basePath`. It restarts the backend when a file it
 * loaded (or, after a failed start, any file under `server/` or `contracts/`) changes.
 */
export function vibejsDev(o: {
  root: string;
  log: DevLog;
  onRestart(ms: number, ok: boolean): void;
}): DevPlugin {
  let runner: ReturnType<typeof createServerModuleRunner>;
  let app: Server.App | undefined;
  let handler: NodeHttp1Handler;
  let failure: VibeError | undefined;
  // C7: the template's base path, until app.module.ts has loaded once.
  let basePath = '/api';
  /** Settles when the current start or restart has; requests wait for it. */
  let ready: Promise<unknown> = Promise.resolve();
  let changes = 0;

  /** Closes the running app, then loads the modules afresh and creates the app. */
  async function start(): Promise<boolean> {
    try {
      await app?.close();
      app = undefined;
      runner.clearCache();
      const mod: Record<string, unknown> = await runner.import(join(o.root, APP_MODULE));
      const { AppModule, appOptions } = mod;
      if (typeof AppModule !== 'function' || typeof appOptions !== 'object' || !appOptions) {
        const names = Object.keys(mod);
        const found = names.length ? `the exports ${names.join(', ')}` : 'no exports';
        throw vibeError('VIBE8202', { found });
      }
      const server: typeof Server = await runner.import('@vibejs-org/server');
      const options: Server.AppOptions = appOptions;
      const logger = serverLogger(server.Logger, o.log);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- create() rejects a class that is not a module
      app = await server.VibeFactory.create(AppModule as Server.ModuleImport, {
        ...options,
        logger,
      });
      basePath = options.basePath ?? '';
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Vite middlewares receive HTTP/1 requests
      handler = toNodeHandler(app.fetch) as NodeHttp1Handler;
      failure = undefined;
      // Clears any earlier start failure.
      const started = { msg: 'The backend started.', resolved: APP_MODULE };
      o.log.write({ level: 'info', source: 'vibejs', ...started });
      return true;
    } catch (error) {
      const reason = String(error).split('\n', 1)[0];
      failure = isVibeError(error, 'VIBE8202')
        ? error
        : vibeError('VIBE8203', { reason }, { cause: error });
      o.log.write({
        level: 'error',
        source: 'vibejs',
        msg: envelopeError(failure).message,
        code: failure.code,
        file: APP_MODULE,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }

  return {
    name: 'vibejs:dev',
    apply: 'serve',
    api: async () => {
      await ready;
      return app && basePath;
    },
    configureServer(server) {
      runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
      const env = join(o.root, 'server/.env');
      if (existsSync(env)) process.loadEnvFile(env);
      // Not before: the module runner never answers when listening fails.
      server.httpServer!.once('listening', () => {
        ready = start();
      });

      server.watcher.add([join(o.root, 'server'), join(o.root, 'contracts')]);
      server.watcher.on('all', (event, file) => {
        if (event !== 'add' && event !== 'change' && event !== 'unlink') return;
        const loaded = server.environments.ssr.moduleGraph.getModulesByFile(normalizePath(file));
        if (!loaded && !(failure && /^(?:server|contracts)\//.test(rel(o.root, file)))) return;
        // Debounced: only the last change of a 50 ms burst restarts.
        const change = ++changes;
        ready = ready.then(async () => {
          await sleep(50);
          if (change !== changes) return;
          o.log.write({ level: 'info', source: 'vibejs', msg: `Restarting: ${rel(o.root, file)}` });
          const at = performance.now();
          const ok = await start();
          o.onRestart(Math.round(performance.now() - at), ok);
        });
      });

      // Added here, not in a returned hook, so they run before Vite's own middlewares.
      server.middlewares.use((req, res, next) => {
        const path = req.url!.split('?', 1)[0];
        if (path === '/__vibejs/health') {
          const health: DevHealth = { name: 'vibejs-dev', pid: process.pid };
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(health));
        } else if (path === basePath || path.startsWith(`${basePath}/`)) {
          // The full URL goes to the backend: its router expects the base path.
          void ready.then(() => (failure ? sendProblem(res, failure) : handler(req, res)));
        } else next();
      });
    },
    transform: {
      order: 'post',
      handler(_code, id) {
        const file = rel(o.root, id);
        if (!o.log.failed.has(file)) return;
        o.log.write({ level: 'info', source: 'vite', msg: `${file} compiles.`, resolved: file });
      },
    },
    async buildEnd() {
      changes++; // cancels a pending restart
      await ready;
      await app?.close();
      await runner.close();
    },
  };
}
