import type { StandardSchemaV1 } from '@standard-schema/spec';
import { isRoute, type Route } from './contract.ts';
import { vibeError } from './errors.gen.ts';
import type { ParamKeys, RouteDef } from './route.ts';
import type { BuiltinErrorCode, Declared, Problem, RouteData, RouteErrorCode } from './types.ts';

/** The `code` of the problems the client creates itself, with `status` 0 when nothing answered. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'ABORTED' | 'UNEXPECTED_RESPONSE';

export interface ClientOptions {
  /** Prepended to every route path: `/api` or `https://api.example.com/v1`. */
  baseUrl: string;
  /** Sends the requests; default the global `fetch`. Tests pass `app.fetch`. */
  fetch?: (request: Request) => Promise<Response>;
  /** Sent with every request; a function is called per request. */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}

export interface CallOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
}

type Errors<R extends Route> = NonNullable<Declared<R, 'errors'>>;

/** A declared error with its status literal, or a builtin or client error. */
export type ApiError<R extends Route> =
  | {
      [C in RouteErrorCode<R>]: Problem<C, Extract<Errors<R>[C & keyof Errors<R>], number>>;
    }[RouteErrorCode<R>]
  | Problem<BuiltinErrorCode | ClientErrorCode>;

/** What a call resolves to; it never rejects for HTTP or network failures. */
export type ApiResult<R extends Route> =
  | { readonly ok: true; readonly data: RouteData<R>; readonly response: Response }
  | { readonly ok: false; readonly error: ApiError<R>; readonly response: Response | undefined };

type Flat<T> = { [K in keyof T]: T[K] };
type In<S> = S extends StandardSchemaV1 ? StandardSchemaV1.InferInput<S> : never;
// An absent part is `?: never`, so an unknown key is still an excess property.
type Part<K extends string, T, Optional = {} extends T ? true : false> = [T] extends [never]
  ? { readonly [P in K]?: never }
  : Optional extends true
    ? { readonly [P in K]?: T }
    : { readonly [P in K]: T };

/** The input of a call: `params` for path params, then the declared query, headers and body. */
export type CallInput<R extends Route> = Flat<
  Part<
    'params',
    [ParamKeys<R['path']>] extends [never] ? never : Record<ParamKeys<R['path']>, string | number>
  > &
    Part<'query', In<Declared<R, 'query'>>> &
    Part<'headers', In<Declared<R, 'headers'>>> &
    Part<'body', In<Declared<R, 'body'>>, false>
>;

/** A route's call; `input` is optional when nothing in it is required. */
export type CallFn<R extends Route> = (
  ...args: {} extends CallInput<R>
    ? [input?: CallInput<R>, options?: CallOptions]
    : [input: CallInput<R>, options?: CallOptions]
) => Promise<ApiResult<R>>;

/** One call per route of a contract, a record of contracts or nested records. */
export type Client<C> = {
  readonly [K in keyof C]: C[K] extends Route ? CallFn<C[K]> : Client<C[K]>;
};

interface Input {
  readonly params?: Readonly<Record<string, string | number>>;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly headers?: HeadersInit;
  readonly body?: unknown;
}

type Result =
  | { readonly ok: true; readonly data: unknown; readonly response: Response }
  | { readonly ok: false; readonly error: Problem; readonly response: Response | undefined };

const TITLES = {
  NETWORK_ERROR: 'Network error',
  ABORTED: 'Request aborted',
  UNEXPECTED_RESPONSE: 'Unexpected response',
} as const;

function fail(
  code: ClientErrorCode,
  status: number,
  response: Response | undefined,
  detail?: string,
): Result {
  const error = { type: 'about:blank', title: TITLES[code], status, code };
  return { ok: false, error: detail === undefined ? error : { ...error, detail }, response };
}

const isProblem = (value: unknown): value is Problem =>
  typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const aborted = (error: unknown) =>
  error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');

function callFn(route: Route, options: ClientOptions) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a bound route's def comes from a route builder
  const def = route.def as RouteDef;
  return async (input: Input = {}, call: CallOptions = {}): Promise<Result> => {
    const path = route.path.replace(/:(\w+)/g, (_, param: string) => {
      const params = input.params ?? {};
      const value = Object.hasOwn(params, param) ? params[param] : undefined;
      if (value === undefined) throw vibeError('VIBE9091', { param, path: route.path });
      return encodeURIComponent(String(value));
    });
    const { location } = globalThis as { location?: Location };
    const url = new URL(
      options.baseUrl.replace(/\/$/, '') + path,
      location?.href ?? 'http://localhost',
    );
    for (const [key, value] of Object.entries(input.query ?? {})) {
      for (const item of [value].flat()) {
        if (item === undefined) continue;
        // oxlint-disable-next-line typescript/no-base-to-string -- query inputs are scalars or dates
        url.searchParams.append(key, item instanceof Date ? item.toISOString() : String(item));
      }
    }
    const body = input.body === undefined ? undefined : JSON.stringify(input.body);
    const headers = new Headers(body === undefined ? {} : { 'content-type': 'application/json' });
    const base = typeof options.headers === 'function' ? await options.headers() : options.headers;
    for (const init of [base, input.headers, call.headers]) {
      new Headers(init).forEach((value, name) => headers.set(name, value));
    }
    const request = new Request(url, { method: route.method, headers, body, signal: call.signal });

    let response: Response;
    try {
      response = await (options.fetch ? options.fetch(request) : fetch(request));
    } catch (error) {
      return fail(aborted(error) ? 'ABORTED' : 'NETWORK_ERROR', 0, undefined, message(error));
    }

    if (!response.ok) {
      if (/^application\/problem\+json\b/i.test(response.headers.get('content-type') ?? '')) {
        // A JSON body is never an Error, so a read failure stays distinguishable from the problem.
        const problem: unknown = await response.json().catch((error: unknown) => error);
        if (aborted(problem)) return fail('ABORTED', 0, response, message(problem));
        if (isProblem(problem)) return { ok: false, error: problem, response };
      }
      return fail('UNEXPECTED_RESPONSE', response.status, response);
    }
    if (def.response && !('~standard' in def.response))
      return { ok: true, data: response, response };
    if (!def.response || response.status === 204) return { ok: true, data: undefined, response };
    try {
      return { ok: true, data: await response.json(), response };
    } catch (error) {
      if (aborted(error)) return fail('ABORTED', 0, response, message(error));
      return fail('UNEXPECTED_RESPONSE', response.status, response, message(error));
    }
  };
}

function build(node: object, options: ClientOptions): object {
  const entries = Object.entries(node).flatMap(([key, value]: [string, unknown]) => {
    if (isRoute(value)) return [[key, callFn(value, options)]];
    return typeof value === 'object' && value !== null ? [[key, build(value, options)]] : [];
  });
  return Object.freeze(Object.fromEntries(entries));
}

/**
 * Builds one call per route of a contract, a record of contracts or nested records. A call
 * resolves to an `ApiResult` and never rejects for HTTP or network failures.
 */
export function createClient<const C extends object>(
  contracts: C,
  options: ClientOptions,
): Client<C> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- build() mirrors Client<C> key by key
  return build(contracts, options) as Client<C>;
}
