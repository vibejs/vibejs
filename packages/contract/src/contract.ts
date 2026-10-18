import { vibeError } from './errors.gen.ts';
import { checkPath, isRouteSpec, type HttpMethod, type RouteSpec } from './route.ts';

/** A route bound to a contract: `path` is the full path and `name` its key in the contract. */
export interface Route<
  M extends HttpMethod = HttpMethod,
  P extends string = string,
  D = unknown,
> extends RouteSpec<M, P, D> {
  readonly name: string;
}

/** The bound routes of `defineContract(Pre, R)`; a route path `/` adds nothing to the prefix. */
export type Contract<Pre extends string, R> = {
  readonly [K in keyof R]: R[K] extends RouteSpec<infer M, infer P, infer D>
    ? Route<M, P extends '/' ? Pre : `${Pre}${P}`, D>
    : never;
};

// A registry symbol, so routes from duplicate copies of this package are still recognized.
const BRAND = Symbol.for('vibejs.route');

/**
 * Binds route specs under a path prefix such as `/users`. Returns a frozen record of new frozen
 * routes; each keeps the spec's `def` object as is.
 */
export function defineContract<const Pre extends string, const R extends Record<string, RouteSpec>>(
  prefix: Pre,
  routes: R,
): Contract<Pre, R>;
export function defineContract(
  prefix: string,
  routes: Record<string, unknown>,
): Readonly<Record<string, Route>> {
  checkPath(prefix, true);
  const contract: Record<string, Route> = {};
  for (const [name, spec] of Object.entries(routes)) {
    if (!isRouteSpec(spec)) throw vibeError('VIBE9003', { key: name });
    const path = spec.path === '/' ? prefix : prefix + spec.path;
    const params = checkPath(path, false);
    const param = params.find((p, i) => params.indexOf(p) !== i);
    if (param !== undefined) throw vibeError('VIBE9002', { path, param });
    contract[name] = Object.freeze({
      method: spec.method,
      path,
      def: spec.def,
      name,
      [BRAND]: true,
    });
  }
  return Object.freeze(contract);
}

/** True for a route bound by `defineContract`, including one from another copy of this package. */
export function isRoute(value: unknown): value is Route {
  return typeof value === 'object' && value !== null && BRAND in value;
}
