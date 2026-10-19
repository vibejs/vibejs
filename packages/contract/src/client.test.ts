import { isVibeError } from '@vibejs-org/errors';
import { describe, expect, it, vi } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { createClient, type ClientOptions } from './client.ts';
import { defineContract } from './contract.ts';
import { del, get, post, raw } from './route.ts';

// The client never validates, so a schema only has to exist.
const schema = <T>(): StandardSchemaV1<T> => ({
  '~standard': { version: 1, vendor: 'test', validate: () => ({ issues: [] }) },
});

const users = defineContract('/orgs/:orgId/users', {
  list: get('/', {
    query: schema<{ a?: string; tag: string[]; at: Date; n: number; b: boolean }>(),
    response: schema<unknown>(),
  }),
  one: get('/:id', { response: schema<unknown>(), errors: { USER_NOT_FOUND: 404 } }),
  create: post('/', {
    body: schema<{ name: string }>(),
    headers: schema<{ b: string; c: string }>(),
  }),
  file: get('/:id/file', { response: raw('text/csv') }),
  remove: del('/:id'),
});
const health = defineContract('/health', { ping: get('/') });

/** A `fetch` stub that records each request and answers with `response()`. */
function stub(
  response: () => Response | Promise<Response> = () => new Response(null, { status: 204 }),
) {
  const requests: Request[] = [];
  const fetch = vi.fn<(request: Request) => Promise<Response>>(async (request) => {
    requests.push(request);
    return response();
  });
  return { requests, fetch };
}

const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);
const problem = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json; charset=utf-8' },
  });

function client(response?: () => Response | Promise<Response>, options?: Partial<ClientOptions>) {
  const { requests, fetch } = stub(response);
  const api = createClient({ users, nested: { health } }, { baseUrl: '/api', fetch, ...options });
  return { api, requests, fetch };
}

describe('createClient: shape', () => {
  it('builds a frozen call per route of a contract, a record and a nested record', async () => {
    const { requests, fetch } = stub();
    const direct = createClient(health, { baseUrl: 'https://api.example.com/v1/', fetch });
    const api = createClient(
      { users, nested: { health }, skipped: 1, empty: null },
      { baseUrl: 'https://api.example.com', fetch },
    );
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.isFrozen(api.nested)).toBe(true);
    expect(Object.keys(api)).toEqual(['users', 'nested']);
    await direct.ping();
    await api.nested.health.ping();
    await api.users.remove({ params: { orgId: 'o', id: 7 } });
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET https://api.example.com/v1/health',
      'GET https://api.example.com/health',
      'DELETE https://api.example.com/orgs/o/users/7',
    ]);
  });
});

describe('createClient: requests', () => {
  it('resolves a relative baseUrl against http://localhost, or location when present', async () => {
    const { api, requests } = client();
    await api.nested.health.ping();
    const slash = client(undefined, { baseUrl: '/' });
    await slash.api.nested.health.ping();
    vi.stubGlobal('location', { href: 'https://app.example.com/page' });
    await api.nested.health.ping();
    expect([...requests, ...slash.requests].map((r) => r.url)).toEqual([
      'http://localhost/api/health',
      'https://app.example.com/api/health',
      'http://localhost/health',
    ]);
  });

  it('encodes path params', async () => {
    const { api, requests } = client();
    await api.users.one({ params: { orgId: 'a/b', id: 42 } });
    expect(requests[0].url).toBe('http://localhost/api/orgs/a%2Fb/users/42');
  });

  it('builds the query: undefined skipped, arrays repeated, dates as ISO strings', async () => {
    const { api, requests } = client(() => json({}));
    const at = new Date('2026-01-02T03:04:05.000Z');
    await api.users.list({
      params: { orgId: 'o' },
      query: { a: undefined, tag: ['x', 'y'], at, n: 1, b: false },
    });
    expect(new URL(requests[0].url).search).toBe(
      '?tag=x&tag=y&at=2026-01-02T03%3A04%3A05.000Z&n=1&b=false',
    );
  });

  it('sends a JSON body and merges headers: options, then input, then call', async () => {
    const headers = vi.fn<() => Promise<HeadersInit>>(async () => ({
      a: 'options',
      b: 'options',
      c: 'options',
    }));
    const { api, requests } = client(undefined, { headers });
    const controller = new AbortController();
    const create = () =>
      api.users.create(
        {
          params: { orgId: 'o' },
          body: { name: 'n' },
          headers: { b: 'input', c: 'input' },
        },
        { headers: { c: 'call' }, signal: controller.signal },
      );
    await create();
    await create();
    expect(headers).toHaveBeenCalledTimes(2);
    const [request] = requests;
    expect(request.method).toBe('POST');
    expect(await request.json()).toEqual({ name: 'n' });
    expect(Object.fromEntries(request.headers)).toEqual({
      a: 'options',
      b: 'input',
      c: 'call',
      'content-type': 'application/json',
    });
    controller.abort();
    expect(request.signal.aborted).toBe(true);
  });

  it('takes plain options headers and sends no body or content type without a body', async () => {
    const { api, requests } = client(undefined, { headers: [['x-a', '1']] });
    await api.nested.health.ping();
    expect(Object.fromEntries(requests[0].headers)).toEqual({ 'x-a': '1' });
    expect(requests[0].body).toBeNull();
  });

  it('reads the global fetch at call time', async () => {
    const api = createClient(health, { baseUrl: '/api' });
    const first = stub();
    vi.stubGlobal('fetch', first.fetch);
    await api.ping();
    const second = stub();
    vi.stubGlobal('fetch', second.fetch);
    await api.ping();
    expect(first.requests).toHaveLength(1);
    expect(second.requests).toHaveLength(1);
  });

  it('rejects with VIBE9091 for a missing path param, before any fetch', async () => {
    const { api, fetch } = client();
    // @ts-expect-error the types require every path param
    const error: unknown = await api.users.one({ params: { orgId: 'o' } }).catch((e: unknown) => e);
    expect(isVibeError(error, 'VIBE9091')).toBe(true);
    expect(error).toMatchObject({ args: { param: 'id', path: '/orgs/:orgId/users/:id' } });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('createClient: results', () => {
  const params = { params: { orgId: 'o', id: 1 } };

  it('parses the JSON of a 2xx route with a response schema', async () => {
    const { api } = client(() => json({ id: 1 }));
    const result = await api.users.one(params);
    expect(result).toMatchObject({ ok: true, data: { id: 1 } });
    expect(result.response).toBeInstanceOf(Response);
  });

  it('gives UNEXPECTED_RESPONSE for invalid JSON on 2xx', async () => {
    const { api } = client(() => new Response('{', { status: 200 }));
    const result = await api.users.one(params);
    expect(result).toMatchObject({
      ok: false,
      error: {
        type: 'about:blank',
        code: 'UNEXPECTED_RESPONSE',
        status: 200,
        detail: expect.any(String),
      },
    });
    expect(result.response?.status).toBe(200);
  });

  it('gives data undefined for 204 and for a route without a response schema', async () => {
    const empty = client(() => new Response(null, { status: 204 }));
    expect(await empty.api.users.one(params)).toMatchObject({ ok: true, data: undefined });
    const noSchema = client(() => json({ ignored: true }));
    expect(await noSchema.api.users.remove(params)).toMatchObject({ ok: true, data: undefined });
  });

  it('gives the unread Response for a raw route', async () => {
    const { api } = client(() => new Response('a,b', { headers: { 'content-type': 'text/csv' } }));
    const result = await api.users.file(params);
    expect(result.ok && result.data).toBe(result.response);
    expect(result.ok && result.data.bodyUsed).toBe(false);
  });

  it('passes a problem body with a string code through', async () => {
    const body = {
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'USER_NOT_FOUND',
      requestId: 'r',
    };
    const { api } = client(() => problem(body, 404));
    const result = await api.users.one(params);
    expect(result).toMatchObject({ ok: false, error: body });
    expect(result.response?.status).toBe(404);
  });

  it('gives UNEXPECTED_RESPONSE for any other non-2xx body', async () => {
    const answers = [
      () => json({ code: 'X' }, { status: 500 }),
      () => problem({ code: 1 }, 400),
      () => problem({ title: 'No code' }, 400),
      () => problem(null, 400),
      () =>
        new Response('{', { status: 502, headers: { 'content-type': 'application/problem+json' } }),
      () => new Response(null, { status: 503 }),
    ];
    for (const answer of answers) {
      const { api } = client(answer);
      const result = await api.users.one(params);
      expect(result).toMatchObject({ ok: false, error: { code: 'UNEXPECTED_RESPONSE' } });
      expect(!result.ok && result.error.status).toBe(result.response?.status);
      expect(!result.ok && 'detail' in result.error).toBe(false);
    }
  });

  it('gives ABORTED for AbortError and TimeoutError, NETWORK_ERROR otherwise', async () => {
    const controller = new AbortController();
    controller.abort();
    const timeout = AbortSignal.timeout(0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const rejections: [unknown, string, string][] = [
      [controller.signal.reason, 'ABORTED', 'This operation was aborted'],
      [timeout.reason, 'ABORTED', 'The operation was aborted due to timeout'],
      [new TypeError('fetch failed'), 'NETWORK_ERROR', 'fetch failed'],
      ['offline', 'NETWORK_ERROR', 'offline'],
    ];
    for (const [reason, code, detail] of rejections) {
      const { api } = client(() => Promise.reject(reason));
      expect(await api.users.one(params)).toEqual({
        ok: false,
        error: { type: 'about:blank', title: expect.any(String), status: 0, code, detail },
        response: undefined,
      });
    }
  });
});
