import { isVibeError } from '@vibejs-org/errors';
import { defineContract, get, type HttpMethod, type Route } from '@vibejs-org/contract';
import { describe, expect, it } from 'vitest';
import { token } from '../di/token.ts';
import type { RouteBinding } from '../module/graph.ts';
import { HttpError } from './errors.ts';
import { createRouter } from './router.ts';

const Handlers = token<object>('Handlers');

/** A binding stand-in: the router reads only the route, the key and the controller token. */
const bind = (route: Route): RouteBinding =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a partial binding for the router
  ({ route, key: route.name, controller: { token: Handlers } }) as unknown as RouteBinding;

const route = (method: HttpMethod, path: string, name = `${method} ${path}`): Route => ({
  method,
  path,
  def: {},
  name,
});

type Outcome =
  | { readonly name: string; readonly params: Readonly<Record<string, string>> }
  | { readonly status: number; readonly allow?: string | null };

/** The router's answer as plain data. */
function outcome(routes: readonly Route[], method: string, pathname: string, base = ''): Outcome {
  try {
    const found = createRouter(routes.map(bind), base).match(method, pathname);
    if ('allow' in found) return { status: 204, allow: found.allow };
    return { name: found.binding.route.name, params: found.params };
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    const allow = new Headers(error.headers).get('allow');
    return error.status === 405 ? { status: 405, allow } : { status: error.status };
  }
}

const ORDER = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

const shape = (r: Route) => r.path.split('/').slice(1);
const rank = (r: Route) =>
  shape(r)
    .map((s) => (s.startsWith(':') ? '1' : '0'))
    .join('');

/** The reference: every route checked in turn, sorted by static-over-param precedence. */
function naive(routes: readonly Route[], method: string, pathname: string): Outcome {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const segments = trimmed.split('/').slice(1).map(decodeURIComponent);
  const matching = routes
    .filter((r) => {
      const parts = shape(r);
      return (
        parts.length === segments.length &&
        parts.every((p, i) => (p.startsWith(':') ? segments[i] !== '' : p === segments[i]))
      );
    })
    .toSorted((a, b) => rank(a).localeCompare(rank(b)));
  const wanted = method === 'HEAD' ? 'GET' : method;
  const hit = matching.find((r) => r.method === wanted);
  if (hit) {
    const params: Record<string, string> = {};
    shape(hit).forEach((p, i) => {
      if (p.startsWith(':')) params[p.slice(1)] = segments[i];
    });
    return { name: hit.name, params };
  }
  if (matching.length === 0) return { status: 404 };
  const methods = new Set<string>(['OPTIONS', ...matching.map((r) => r.method)]);
  if (methods.has('GET')) methods.add('HEAD');
  const allow = ORDER.filter((m) => methods.has(m)).join(', ');
  return { status: method === 'OPTIONS' ? 204 : 405, allow };
}

/** mulberry32: a small seeded PRNG. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('router fuzz', () => {
  const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  it.each(Array.from({ length: 200 }, (_, seed) => seed))(
    'matches the reference (seed %i)',
    (seed) => {
      const random = prng(seed);
      const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
      const routes = new Map<string, Route>();
      for (let n = 0; n < 1 + random() * 12; n++) {
        const depth = 1 + Math.floor(random() * 3);
        const segments = Array.from({ length: depth }, (_, i) =>
          random() < 0.4 ? `:p${i}` : pick(['a', 'b', 'c']),
        );
        const method = pick(METHODS);
        const key = `${method} ${segments.map((s) => (s.startsWith(':') ? ':' : s)).join('/')}`;
        if (!routes.has(key)) routes.set(key, route(method, `/${segments.join('/')}`));
      }
      const list = [...routes.values()];
      for (let n = 0; n < 40; n++) {
        const depth = Math.floor(random() * 4);
        const path = `/${Array.from({ length: depth }, () => pick(['a', 'b', 'c', 'x', '%61', ''])).join('/')}`;
        const method = pick([...METHODS, 'HEAD', 'OPTIONS']);
        expect(outcome(list, method, path), `${method} ${path}`).toEqual(naive(list, method, path));
      }
    },
  );
});

describe('router', () => {
  const users = defineContract('/users', {
    one: get('/:id'),
    me: get('/me'),
    file: get('/me/files/:file'),
    post: get('/:id/posts/:post'),
  });
  const routes = Object.values(users);

  it('strips one trailing slash, except on the root', () => {
    expect(outcome(routes, 'GET', '/users/me/')).toEqual({ name: 'me', params: {} });
    expect(outcome(routes, 'GET', '/users/me//')).toEqual({ status: 404 });
    expect(outcome([route('GET', '/a')], 'GET', '/')).toEqual({ status: 404 });
  });

  it('is case-sensitive', () => {
    expect(outcome(routes, 'GET', '/Users/me')).toEqual({ status: 404 });
    expect(outcome(routes, 'GET', '/users/ME')).toEqual({ name: 'one', params: { id: 'ME' } });
  });

  it('decodes percent-encoded segments', () => {
    expect(outcome(routes, 'GET', '/users/a%20b')).toEqual({ name: 'one', params: { id: 'a b' } });
    expect(outcome(routes, 'GET', '/users/%6De')).toEqual({ name: 'me', params: {} });
    expect(outcome(routes, 'GET', '/users/a%2Fb')).toEqual({ name: 'one', params: { id: 'a/b' } });
  });

  it('answers a bad escape with 400 BAD_REQUEST', () => {
    const error = (() => {
      try {
        createRouter(routes.map(bind), '').match('GET', '/users/%E0%A4%A');
      } catch (thrown) {
        return thrown;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
  });

  it('mounts the routes under the base path', () => {
    expect(outcome(routes, 'GET', '/api/users/me', '/api')).toEqual({ name: 'me', params: {} });
    expect(outcome(routes, 'GET', '/users/me', '/api')).toEqual({ status: 404 });
  });

  it('backtracks from a static branch to a param branch', () => {
    expect(outcome(routes, 'GET', '/users/me/posts/7')).toEqual({
      name: 'post',
      params: { id: 'me', post: '7' },
    });
    expect(outcome(routes, 'GET', '/users/me/files/a')).toEqual({
      name: 'file',
      params: { file: 'a' },
    });
  });

  it('answers 405 and OPTIONS with the declared methods, HEAD and OPTIONS', () => {
    const list = [route('GET', '/a'), route('DELETE', '/a'), route('POST', '/b')];
    expect(outcome(list, 'PUT', '/a')).toEqual({
      status: 405,
      allow: 'GET, HEAD, DELETE, OPTIONS',
    });
    expect(outcome(list, 'OPTIONS', '/b')).toEqual({ status: 204, allow: 'POST, OPTIONS' });
    expect(outcome(list, 'HEAD', '/a')).toEqual({ name: 'GET /a', params: {} });
    expect(outcome(list, 'HEAD', '/b')).toEqual({ status: 405, allow: 'POST, OPTIONS' });
  });

  it('throws VIBE9401 for two routes with the same method and shape', () => {
    const list = [route('GET', '/users/:id', 'one'), route('GET', '/users/:userId', 'two')];
    let error: unknown;
    try {
      createRouter(list.map(bind), '/api');
    } catch (thrown) {
      error = thrown;
    }
    expect(isVibeError(error, 'VIBE9401')).toBe(true);
    expect(error).toMatchObject({
      code: 'VIBE9401',
      args: { method: 'GET', path: '/api/users/:id', handlers: 'Handlers.one, Handlers.two' },
    });
  });
});
