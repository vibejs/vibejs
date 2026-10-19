// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import type { HttpMethod, RouteDef } from '@vibejs-org/contract';
import {
  get,
  instantiate,
  providerRecord,
  recordValue,
  type Injector,
  type ProviderRecord,
} from '../di/injector.ts';
import { tokenName, type Token } from '../di/token.ts';
import { vibeError } from '../errors.gen.ts';
import { JsonLogger, Logger } from '../logger.ts';
import { Module } from '../module/decorators.ts';
import { scan, type DynamicModule, type ModuleImport } from '../module/graph.ts';
import { init, shutdown } from '../module/lifecycle.ts';
import { readJson } from './body.ts';
import {
  createContext,
  type CanActivate,
  type ExceptionFilter,
  type Interceptor,
} from './context.ts';
import { HttpError, problem, renderError } from './errors.ts';
import { createRouter, handlerName } from './router.ts';

export interface AppOptions {
  /** The path prefix of every route, such as `/api`; default `''`. */
  readonly basePath?: string;
  /** Fetch-level middleware around every request; the first one is the outermost. */
  readonly middleware?: readonly Middleware[];
  /** Global guards, built in the root module's scope. */
  readonly guards?: readonly (new () => CanActivate)[];
  /** Global interceptors, built in the root module's scope. */
  readonly interceptors?: readonly (new () => Interceptor)[];
  /** Global exception filters, built in the root module's scope. */
  readonly filters?: readonly (new () => ExceptionFilter)[];
  /** The application logger, provided globally as `Logger`; default `new JsonLogger()`. */
  readonly logger?: Logger;
  /** The largest request body in bytes; default 1 MiB. */
  readonly bodyLimit?: number;
  /** How long `close()` waits for running requests, in ms; default 10 000. */
  readonly shutdownTimeout?: number;
}

/** Wraps request handling; `next(req?)` continues, optionally with a replacement request. */
export type Middleware = (
  req: Request,
  next: (req?: Request) => Promise<Response>,
) => Promise<Response>;

/** The routes and modules of an application, for tools. */
export interface AppInspection {
  readonly routes: readonly {
    readonly method: HttpMethod;
    /** The full path, base path included. */
    readonly path: string;
    /** `UsersController.get`. */
    readonly handler: string;
    /** In run order, globals included. */
    readonly guards: readonly string[];
    readonly interceptors: readonly string[];
    readonly filters: readonly string[];
  }[];
  /** Depth-first post-order. */
  readonly modules: readonly {
    readonly path: string;
    readonly global: boolean;
    readonly imports: readonly string[];
    readonly exports: readonly string[];
    readonly providers: readonly string[];
  }[];
}

/** A created application. */
export interface App extends Injector {
  /** Handles one request; bound, so `export default { fetch: app.fetch }` works. */
  readonly fetch: (req: Request) => Promise<Response>;
  /** Sends a request in process; a string path resolves against `http://localhost`. */
  request(
    input: string | URL | Request,
    init?: RequestInit & { json?: unknown },
  ): Promise<Response>;
  /** Serves the app over HTTP; the port defaults to 3000. */
  listen(port?: number, hostname?: string): Promise<{ url: string }>;
  /** Closes the app on each signal, then re-raises it; default `SIGTERM` and `SIGINT`. */
  enableShutdownHooks(signals?: readonly string[]): App;
  /** Rejects new requests, drains running ones, stops the server and runs the shutdown hooks. */
  close(signal?: string): Promise<void>;
  inspect(): AppInspection;
}

const REQUEST_ID = /^[\w.-]{1,128}$/;

/** A global module that provides `logger` as `Logger`. */
function loggerModule(logger: Logger): ModuleImport {
  class LoggerModule {}
  Module({ global: true, providers: [{ provide: Logger, useValue: logger }], exports: [Logger] })(
    LoggerModule,
  );
  return LoggerModule;
}

/** The names of records and classes, for `inspect()`. */
const names = (list: readonly (ProviderRecord | Token<unknown>)[]): string[] =>
  list.map((item) => tokenName('token' in item ? item.token : item));

/** Turns a module graph into a running application. */
export const VibeFactory = {
  /** Scans, builds and initializes the application; it does not listen. */
  async create(root: ModuleImport, options: AppOptions = {}): Promise<App> {
    const {
      basePath = '',
      middleware = [],
      guards = [],
      interceptors = [],
      filters = [],
      logger = new JsonLogger(),
      bodyLimit = 1_048_576,
      shutdownTimeout = 10_000,
    } = options;
    const dynamic: DynamicModule = typeof root === 'function' ? { module: root } : root;
    const internal = loggerModule(logger);
    const graph = scan({ ...dynamic, imports: [internal, ...(dynamic.imports ?? [])] });
    const scope = graph.root.scope;
    const globals = [...guards, ...interceptors, ...filters].map((cls) =>
      providerRecord(cls, scope),
    );
    await instantiate([...graph.records, ...globals]);
    await init(graph);
    const router = createRouter(graph.routes, basePath);

    let inFlight = 0;
    let drained: (() => void) | undefined;
    let closing: Promise<void> | undefined;
    let listening = false;
    let server: { readonly url?: string; close(force?: boolean): Promise<void> } | undefined;
    const hooks = new Map<string, () => void>();

    /** Routes a request and runs its handler; every error becomes a problem response. */
    async function dispatch(req: Request, requestId: string, headers: Headers): Promise<Response> {
      const log = logger.child({ requestId });
      try {
        if (Number(req.headers.get('content-length')) > bodyLimit) {
          throw new HttpError(413, 'BODY_TOO_LARGE');
        }
        const url = new URL(req.url);
        const found = router.match(req.method, url.pathname);
        if ('allow' in found) return new Response(null, { status: 204, headers: found });
        const { binding, params } = found;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every route def is a RouteDef
        const def = binding.route.def as RouteDef;
        const parts = def.body ? { body: await readJson(req, bodyLimit) } : {};
        const base = { req, url, binding, params, requestId, log, responseHeaders: headers };
        const ctx = createContext(base, parts);
        const controller = recordValue(binding.controller);
        const value: unknown = await Reflect.apply(
          Reflect.get(Object(controller), binding.key),
          controller,
          [ctx],
        );
        if (value instanceof Response) return value;
        if (!def.response) return new Response(null, { status: def.status ?? 204 });
        return Response.json(value, { status: def.status ?? 200 });
      } catch (error) {
        return renderError(error, requestId, log);
      }
    }

    /** Adds the context headers and `x-request-id` to a copy of `res`, and logs a summary. */
    function finish(
      req: Request,
      res: Response,
      requestId: string,
      headers: Headers,
      started: number,
    ) {
      // A copy has mutable headers, even for `Response.redirect()`; HEAD drops the body.
      const out = new Response(req.method === 'HEAD' ? null : res.body, res);
      for (const [name, value] of headers) {
        if (name === 'set-cookie') out.headers.append(name, value);
        else out.headers.set(name, value);
      }
      out.headers.set('x-request-id', requestId);
      const path = new URL(req.url).pathname;
      const ms = Math.round(performance.now() - started);
      logger.debug('request', { requestId, method: req.method, path, status: out.status, ms });
      return out;
    }

    const fetch = async (req: Request): Promise<Response> => {
      const started = performance.now();
      const header = req.headers.get('x-request-id') ?? '';
      const requestId = REQUEST_ID.test(header) ? header : crypto.randomUUID();
      const headers = new Headers();
      if (closing) {
        const res = problem(new HttpError(503, 'SERVICE_UNAVAILABLE'), requestId);
        return finish(req, res, requestId, headers, started);
      }
      inFlight++;
      const run = (i: number, current: Request): Promise<Response> => {
        const next = middleware.at(i);
        return next
          ? next(current, (replaced = current) => run(i + 1, replaced))
          : dispatch(current, requestId, headers);
      };
      try {
        let res: Response;
        try {
          res = await run(0, req);
        } catch (error) {
          res = renderError(error, requestId, logger.child({ requestId }));
        }
        return finish(req, res, requestId, headers, started);
      } finally {
        if (--inFlight === 0) drained?.();
      }
    };

    const app: App = {
      fetch,
      get: <T>(token: Token<T>): T => {
        const found = [graph.root, ...graph.modules].find((m) => m.scope.find(token));
        return get((found ?? graph.root).scope, token);
      },
      request(input, requestInit = {}) {
        const { json, ...rest } = requestInit;
        const target = typeof input === 'string' ? new URL(input, 'http://localhost') : input;
        if (json === undefined) return fetch(new Request(target, rest));
        const headers = new Headers(rest.headers);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
        return fetch(new Request(target, { ...rest, headers, body: JSON.stringify(json) }));
      },
      async listen(port = 3000, hostname) {
        if (listening || closing) throw vibeError('VIBE9403', { url: server?.url ?? 'none' });
        listening = true;
        let url: string;
        try {
          const { serve } = await import('srvx');
          // oxlint-disable-next-line typescript/no-unnecessary-condition -- close() may have started while srvx loaded
          if (closing) throw vibeError('VIBE9403', { url: 'none' });
          const started = serve({ fetch, port, hostname, gracefulShutdown: false, silent: true });
          server = started;
          await started.ready();
          url = String(started.url);
        } catch (error) {
          // A failed listen, such as EADDRINUSE, can be retried.
          listening = false;
          server = undefined;
          throw error;
        }
        logger.info('listening', { url });
        return { url };
      },
      enableShutdownHooks(signals = ['SIGTERM', 'SIGINT']) {
        const proc = globalThis.process as NodeJS.Process | undefined;
        if (!proc) return app;
        for (const signal of signals) {
          const hook = () => {
            void app
              .close(signal)
              .catch((error: unknown) => {
                logger.error('shutdown failed', { error });
                proc.exitCode = 1;
              })
              .finally(() => proc.kill(proc.pid, signal));
          };
          hooks.set(signal, hook);
          proc.once(signal, hook);
        }
        return app;
      },
      close(signal) {
        closing ??= (async () => {
          let timedOut = false;
          if (inFlight > 0) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            timedOut = await Promise.race([
              new Promise<boolean>((resolve) => (drained = () => resolve(false))),
              new Promise<boolean>(
                (resolve) => (timer = setTimeout(resolve, shutdownTimeout, true)),
              ),
            ]);
            clearTimeout(timer);
          }
          if (timedOut) {
            const { message, code } = vibeError('VIBE9402', { timeout: shutdownTimeout, inFlight });
            logger.warn(message, { code });
          }
          await server?.close(timedOut);
          for (const [name, hook] of hooks) globalThis.process.off(name, hook);
          await shutdown(graph, signal);
        })();
        return closing;
      },
      inspect: () => ({
        routes: graph.routes.map((binding) => ({
          method: binding.route.method,
          path: basePath + binding.route.path,
          handler: handlerName(binding),
          guards: names([...guards, ...binding.guards]),
          interceptors: names([...interceptors, ...binding.interceptors]),
          filters: names([...binding.filters, ...filters]),
        })),
        // The generated logger module is an implementation detail.
        modules: graph.modules
          .filter((node) => node.module !== internal)
          .map((node) => ({
            path: node.path,
            global: node.global,
            imports: node.imports
              .filter((child) => child.module !== internal)
              .map((child) => child.name),
            exports: node.exports,
            providers: node.providers,
          })),
      }),
    };
    return app;
  },
};
