// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseLocation, stringifyQuery } from './location.ts';

describe('parseLocation', () => {
  it('resolves a relative string against the current path', () => {
    expect(parseLocation('c', '/a/b').path).toBe('/a/c');
    expect(parseLocation('../c', '/a/b/d').path).toBe('/a/c');
    expect(parseLocation('/x', '/a/b').path).toBe('/x');
    expect(parseLocation('?q=1', '/a/b').fullPath).toBe('/a/b?q=1');
  });

  it('reads the query as strings and arrays, and keeps the hash', () => {
    expect(parseLocation('/s?a=1&b=x%20y&a=2&a=3&c#top', '/')).toEqual({
      path: '/s',
      query: { a: ['1', '2', '3'], b: 'x y', c: '' },
      hash: '#top',
      fullPath: '/s?a=1&a=2&a=3&b=x+y&c=#top',
    });
  });

  it('keeps the path percent-encoded and the hash empty without one', () => {
    expect(parseLocation('/café menu', '/')).toEqual({
      path: '/caf%C3%A9%20menu',
      query: {},
      hash: '',
      fullPath: '/caf%C3%A9%20menu',
    });
  });

  it('keeps __proto__ as a plain query key', () => {
    const { query } = parseLocation('/?__proto__=a&__proto__=b', '/');
    expect(Object.getPrototypeOf(query)).toBe(Object.prototype);
    expect(Object.keys(query)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(query, '__proto__')?.value).toEqual(['a', 'b']);
  });
});

describe('stringifyQuery', () => {
  it('drops null and undefined values, also inside arrays', () => {
    expect(
      stringifyQuery({ a: 1, b: null, c: undefined, d: ['x', null, 2, undefined], e: '' }),
    ).toBe('a=1&d=x&d=2&e=');
    expect(stringifyQuery({})).toBe('');
  });
});
