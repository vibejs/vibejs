import { describe, expect, it } from 'vitest';
import { createCookies } from './cookies.ts';

const jar = (cookie?: string) => {
  const headers = new Headers();
  const req = new Request('http://localhost/', cookie === undefined ? {} : { headers: { cookie } });
  return { cookies: createCookies(req, headers), headers };
};

describe('cookies', () => {
  it('parses lazily: the first value of a name wins, values are URI-decoded or raw', () => {
    const { cookies } = jar('a=1; b=hello%20world; a=2; c=%E0%A4%A; =x; flag; d="q"');
    expect(cookies.get('a')).toBe('1');
    expect(cookies.get('b')).toBe('hello world');
    expect(cookies.get('c')).toBe('%E0%A4%A');
    expect(cookies.get('d')).toBe('"q"');
    expect(cookies.get('flag')).toBeUndefined();
    expect(jar().cookies.get('a')).toBeUndefined();
  });

  it('sets cookies with defaults and every option', () => {
    const { cookies, headers } = jar();
    cookies.set('session', 'a b;c');
    cookies.set('pref', 'dark', {
      path: '/app',
      domain: 'example.com',
      maxAge: 60.9,
      expires: new Date(Date.UTC(2030, 0, 2)),
      httpOnly: false,
      secure: false,
      sameSite: 'Strict',
    });
    expect(headers.getSetCookie()).toEqual([
      'session=a%20b%3Bc; Path=/; HttpOnly; Secure; SameSite=Lax',
      'pref=dark; Path=/app; Domain=example.com; Max-Age=60; Expires=Wed, 02 Jan 2030 00:00:00 GMT; SameSite=Strict',
    ]);
  });

  it('deletes a cookie with Max-Age=0 and an epoch Expires', () => {
    const { cookies, headers } = jar();
    cookies.delete('session');
    cookies.delete('pref', { path: '/app', domain: 'example.com' });
    expect(headers.getSetCookie()).toEqual([
      'session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
      'pref=; Path=/app; Domain=example.com; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
    ]);
  });

  it('throws VIBE9504 for a name that is not a token', () => {
    const { cookies } = jar();
    for (const name of ['a b', 'a;b', '']) {
      expect(() => cookies.set(name, 'x')).toThrow(
        expect.objectContaining({ code: 'VIBE9504', args: { name } }),
      );
    }
    expect(() => cookies.delete('a=b')).toThrow(expect.objectContaining({ code: 'VIBE9504' }));
    expect(() => cookies.set("!#$%&'*+-.^_`|~Az09", 'x')).not.toThrow();
  });
});
