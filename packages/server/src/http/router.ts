import { tokenName } from '../di/token.ts';
import { vibeError } from '../errors.gen.ts';
import type { RouteBinding } from '../module/graph.ts';
import { HttpError } from './errors.ts';

interface Entry {
  readonly binding: RouteBinding;
  /** The full path, base path included. */
  readonly path: string;
  readonly names: readonly string[];
}

interface Node {
  readonly statics: Map<string, Node>;
  param?: Node;
  readonly routes: Map<string, Entry>;
}

/** A routed request: its binding and its decoded path params. */
interface Match {
  readonly binding: RouteBinding;
  readonly params: Readonly<Record<string, string>>;
}

export interface Router {
  /**
   * The route of a request, or the `Allow` value of an `OPTIONS` request without a route. Throws an
   * `HttpError`: 400 for a bad `%` escape, 404 without a path match, 405 for another method.
   */
  match(method: string, pathname: string): Match | { readonly allow: string };
}

const ORDER = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/** `UsersController.get`: the controller and method of a binding. */
export const handlerName = (binding: RouteBinding): string =>
  `${tokenName(binding.controller.token)}.${String(binding.key)}`;

const node = (): Node => ({ statics: new Map(), routes: new Map() });

/** Every node that matches `segments`, statics before params, with the param values. */
function* walk(
  at: Node,
  segments: readonly string[],
  values: readonly string[] = [],
): Generator<readonly [Node, readonly string[]]> {
  if (segments.length === 0) {
    if (at.routes.size > 0) yield [at, values];
    return;
  }
  const [segment, ...rest] = segments;
  const child = at.statics.get(segment);
  if (child) yield* walk(child, rest, values);
  if (at.param && segment) yield* walk(at.param, rest, [...values, segment]);
}

/**
 * A segment trie over the routes, mounted under `basePath` (validated by the caller). Throws
 * VIBE9401 on a conflict.
 */
export function createRouter(bindings: readonly RouteBinding[], basePath: string): Router {
  const root = node();
  for (const binding of bindings) {
    const { method } = binding.route;
    const path = basePath + binding.route.path;
    let at = root;
    const names: string[] = [];
    for (const segment of path.split('/').slice(1)) {
      if (segment.startsWith(':')) {
        names.push(segment.slice(1));
        at = at.param ??= node();
      } else {
        let next = at.statics.get(segment);
        if (!next) at.statics.set(segment, (next = node()));
        at = next;
      }
    }
    const other = at.routes.get(method);
    if (other) {
      const handlers = `${handlerName(other.binding)}, ${handlerName(binding)}`;
      throw vibeError('VIBE9401', { method, path: other.path, handlers });
    }
    at.routes.set(method, { binding, path, names });
  }

  return {
    match(method, pathname) {
      const trimmed =
        pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
      let segments: string[];
      try {
        segments = trimmed.split('/').slice(1).map(decodeURIComponent);
      } catch (error) {
        throw new HttpError(400, 'BAD_REQUEST', 'The path has an invalid percent escape.', {
          cause: error,
        });
      }
      const wanted = method === 'HEAD' ? 'GET' : method;
      const methods = new Set<string>();
      for (const [found, values] of walk(root, segments)) {
        const entry = found.routes.get(wanted);
        if (entry) {
          const params = Object.fromEntries(entry.names.map((name, i) => [name, values[i]]));
          return { binding: entry.binding, params };
        }
        for (const key of found.routes.keys()) methods.add(key);
      }
      if (methods.size === 0) throw new HttpError(404, 'NOT_FOUND');
      if (methods.has('GET')) methods.add('HEAD');
      methods.add('OPTIONS');
      const allow = ORDER.filter((m) => methods.has(m)).join(', ');
      if (method === 'OPTIONS') return { allow };
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', undefined, { headers: { allow } });
    },
  };
}
