import { describe, expect, it, vi } from 'vitest';
import { cors, type CorsOptions } from './cors.ts';

const handler = vi.fn<() => Promise<Response>>(() =>
  Promise.resolve(new Response('ok', { headers: { vary: 'Accept' } })),
);

function call(options: CorsOptions, headers: Record<string, string>, method = 'GET') {
  handler.mockClear();
  return cors(options)(new Request('http://localhost/x', { method, headers }), handler);
}

const preflight = (origin: string, extra: Record<string, string> = {}) => ({
  origin,
  'access-control-request-method': 'POST',
  ...extra,
});

describe('cors', () => {
  it('answers an allowed preflight with 204 and the allow headers, without next', async () => {
    const res = await call(
      { origin: ['https://a.test'], credentials: true, maxAge: 600 },
      preflight('https://a.test', { 'access-control-request-headers': 'x-token' }),
      'OPTIONS',
    );
    expect(res.status).toBe(204);
    expect(handler).not.toHaveBeenCalled();
    expect(Object.fromEntries(res.headers)).toEqual({
      vary: 'Origin',
      'access-control-allow-origin': 'https://a.test',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, HEAD, PUT, PATCH, POST, DELETE',
      'access-control-allow-headers': 'x-token',
      'access-control-max-age': '600',
    });
  });

  it('uses the configured preflight methods and headers', async () => {
    const res = await call(
      { origin: '*', methods: ['GET'], allowHeaders: ['a', 'b'] },
      preflight('https://b.test', { 'access-control-request-headers': 'c' }),
      'OPTIONS',
    );
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toBe('GET');
    expect(res.headers.get('access-control-allow-headers')).toBe('a, b');
    const bare = await call({ origin: '*' }, preflight('https://b.test'), 'OPTIONS');
    expect(bare.headers.has('access-control-allow-headers')).toBe(false);
    expect(bare.headers.has('access-control-max-age')).toBe(false);
  });

  it('answers a disallowed preflight with 204 and no allow headers', async () => {
    const res = await call(
      { origin: ['https://a.test'] },
      preflight('https://evil.test'),
      'OPTIONS',
    );
    expect(res.status).toBe(204);
    expect(handler).not.toHaveBeenCalled();
    expect(Object.fromEntries(res.headers)).toEqual({ vary: 'Origin' });
  });

  it('passes an OPTIONS request without a CORS preflight on to next', async () => {
    await call({ origin: '*' }, { origin: 'https://a.test' }, 'OPTIONS');
    expect(handler).toHaveBeenCalled();
    await call({ origin: '*' }, { 'access-control-request-method': 'POST' }, 'OPTIONS');
    expect(handler).toHaveBeenCalled();
  });

  it('echoes an allowed origin on actual requests and appends Vary: Origin', async () => {
    const res = await call(
      {
        origin: (origin) => origin.endsWith('.a.test'),
        credentials: true,
        exposeHeaders: ['x-id', 'x-n'],
      },
      { origin: 'https://app.a.test' },
    );
    expect(await res.text()).toBe('ok');
    expect(Object.fromEntries(res.headers)).toMatchObject({
      vary: 'Accept, Origin',
      'access-control-allow-origin': 'https://app.a.test',
      'access-control-allow-credentials': 'true',
      'access-control-expose-headers': 'x-id, x-n',
    });
  });

  it('sends "*" for the wildcard origin, and nothing for a disallowed or missing origin', async () => {
    const any = await call({ origin: '*' }, { origin: 'https://b.test' });
    expect(any.headers.get('access-control-allow-origin')).toBe('*');
    expect(any.headers.has('access-control-allow-credentials')).toBe(false);
    const denied = await call({ origin: () => false }, { origin: 'https://b.test' });
    expect(denied.headers.has('access-control-allow-origin')).toBe(false);
    expect(denied.headers.get('vary')).toBe('Accept, Origin');
    const none = await call({ origin: ['https://a.test'] }, {});
    expect(none.headers.has('access-control-allow-origin')).toBe(false);
  });

  it('copies a response with immutable headers', async () => {
    const res = await cors({ origin: '*' })(new Request('http://localhost/'), () =>
      Promise.resolve(Response.redirect('http://localhost/a', 302)),
    );
    expect(res.headers.get('vary')).toBe('Origin');
    expect(res.headers.get('location')).toBe('http://localhost/a');
  });

  it("throws VIBE9404 for origin '*' with credentials", () => {
    expect(() => cors({ origin: '*', credentials: true })).toThrow(
      expect.objectContaining({ code: 'VIBE9404' }),
    );
  });
});
