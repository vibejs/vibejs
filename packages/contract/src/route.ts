import type { StandardSchemaV1 } from '@standard-schema/spec';
import { vibeError } from './errors.gen.ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A response or body that is passed through unparsed, with its content type. */
export interface RawBody {
  readonly kind: 'raw';
  readonly contentType: string;
}

/** Declares a raw response; the content type defaults to `application/octet-stream`. */
export function raw(contentType: string = 'application/octet-stream'): RawBody {
  return { kind: 'raw', contentType };
}

/** The param names of a path: `ParamKeys<'/orgs/:orgId/users/:id'>` is `'orgId' | 'id'`. */
export type ParamKeys<P extends string> = P extends `${string}:${infer K}/${infer R}`
  ? K | ParamKeys<`/${R}`>
  : P extends `${string}:${infer K}`
    ? K
    : never;

/** What a route declares besides its method and path. */
export interface RouteDef<P extends string = string> {
  /** Validates the route's own path params; it must cover every one of them. */
  readonly params?: [ParamKeys<P>] extends [never]
    ? never
    : StandardSchemaV1<{ [K in ParamKeys<P>]: unknown }, unknown>;
  readonly query?: StandardSchemaV1;
  /** Header names are lowercase. */
  readonly headers?: StandardSchemaV1;
  /** An `application/json` request body. */
  readonly body?: StandardSchemaV1;
  /** The success body; without one the route answers 204. */
  readonly response?: StandardSchemaV1 | RawBody;
  readonly status?: 200 | 201 | 202;
  /** The error codes the route raises, each with its HTTP status. */
  readonly errors?: { readonly [code: string]: number };
  readonly summary?: string;
  readonly description?: string;
}

/** An unbound route, as a route builder returns it. */
export interface RouteSpec<
  M extends HttpMethod = HttpMethod,
  P extends string = string,
  D = unknown,
> {
  readonly method: M;
  readonly path: P;
  readonly def: D;
}

// `.` and `..` are excluded: URL parsing removes them, so no request could reach the route.
const SEGMENT = /^(?!\.\.?$)(?:[\w.~-]+|:[A-Za-z_]\w*)$/;
const specs = new WeakSet();

/** Throws VIBE9001 unless `path` follows the path grammar, and returns its param names. */
export function checkPath(path: string, prefix: boolean): string[] {
  const segments = path.split('/');
  const valid = path === '/' ? !prefix : segments.every((s, i) => (i ? SEGMENT.test(s) : !s));
  if (!valid || segments.length < 2) {
    const segment = segments.find((s, i) => (i ? !SEGMENT.test(s) : s)) ?? '';
    throw vibeError('VIBE9001', { path, segment });
  }
  return segments.filter((s) => s.startsWith(':')).map((s) => s.slice(1));
}

/** True for a value that a route builder returned. */
export function isRouteSpec(value: unknown): value is RouteSpec {
  return typeof value === 'object' && value !== null && specs.has(value);
}

function route(method: HttpMethod, path: string, def: RouteDef = {}): RouteSpec {
  checkPath(path, false);
  // A fetch Request rejects a GET with a body, so no client could call the route.
  if (method === 'GET' && def.body !== undefined) throw vibeError('VIBE9004', { path });
  const spec = Object.freeze({ method, path, def });
  specs.add(spec);
  return spec;
}

// A def with a key that RouteDef does not declare is an error, so a typo is never ignored.
type Def<P extends string, D> = RouteDef<P> & {
  readonly [K in Exclude<keyof D, keyof RouteDef>]: never;
};

// Each builder has an overload without a def (or with `undefined`), so that a call's context (such as the routes record
// of defineContract) cannot infer the def type: a route without a def has the def type `{}`.

/** Declares a GET route. */
export function get<const P extends string>(path: P, def?: undefined): RouteSpec<'GET', P, {}>;
export function get<const P extends string, const D extends Def<P, D> & { readonly body?: never }>(
  path: P,
  def: D | undefined,
): RouteSpec<'GET', P, D>;
export function get(path: string, def?: RouteDef): RouteSpec {
  return route('GET', path, def);
}

/** Declares a POST route. */
export function post<const P extends string>(path: P, def?: undefined): RouteSpec<'POST', P, {}>;
export function post<const P extends string, const D extends Def<P, D>>(
  path: P,
  def: D | undefined,
): RouteSpec<'POST', P, D>;
export function post(path: string, def?: RouteDef): RouteSpec {
  return route('POST', path, def);
}

/** Declares a PUT route. */
export function put<const P extends string>(path: P, def?: undefined): RouteSpec<'PUT', P, {}>;
export function put<const P extends string, const D extends Def<P, D>>(
  path: P,
  def: D | undefined,
): RouteSpec<'PUT', P, D>;
export function put(path: string, def?: RouteDef): RouteSpec {
  return route('PUT', path, def);
}

/** Declares a PATCH route. */
export function patch<const P extends string>(path: P, def?: undefined): RouteSpec<'PATCH', P, {}>;
export function patch<const P extends string, const D extends Def<P, D>>(
  path: P,
  def: D | undefined,
): RouteSpec<'PATCH', P, D>;
export function patch(path: string, def?: RouteDef): RouteSpec {
  return route('PATCH', path, def);
}

/** Declares a DELETE route. */
export function del<const P extends string>(path: P, def?: undefined): RouteSpec<'DELETE', P, {}>;
export function del<const P extends string, const D extends Def<P, D>>(
  path: P,
  def: D | undefined,
): RouteSpec<'DELETE', P, D>;
export function del(path: string, def?: RouteDef): RouteSpec {
  return route('DELETE', path, def);
}
