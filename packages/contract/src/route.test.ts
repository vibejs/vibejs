import { describe, expect, it } from 'vitest';
import { del, get, isRouteSpec, patch, post, put, raw } from './route.ts';

const nonEmpty = expect.arrayContaining([expect.any(String)]);

describe('raw', () => {
  it('defaults to application/octet-stream', () => {
    expect(raw()).toEqual({ kind: 'raw', contentType: 'application/octet-stream' });
    expect(raw('text/csv')).toEqual({ kind: 'raw', contentType: 'text/csv' });
  });
});

describe('route builders', () => {
  it('build frozen specs with their method', () => {
    const def = { summary: 'x' };
    const specs = [get('/', def), post('/'), put('/'), patch('/'), del('/')];
    expect(specs.map((spec) => spec.method)).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    for (const spec of specs) {
      expect(Object.isFrozen(spec)).toBe(true);
      expect(isRouteSpec(spec)).toBe(true);
    }
    expect(specs[0]).toEqual({ method: 'GET', path: '/', def });
    expect(specs[0].def).toBe(def);
    expect(Object.isFrozen(def)).toBe(false);
    expect(specs[1].def).toEqual({});
  });

  it.each(['/', '/users', '/users/:id', '/a.b~c-d/:x_1', '/:_a/b/:C9', '/.well-known/...'])(
    'accepts %j',
    (path) => {
      expect(get(path).path).toBe(path);
    },
  );

  it.each([
    ['', ''],
    ['users', 'users'],
    ['users/:id', 'users'],
    ['/users/', ''],
    ['//', ''],
    ['/a b', 'a b'],
    ['/:1x', ':1x'],
    ['/:', ':'],
    ['/users/*', '*'],
    ['/users/:id?', ':id?'],
    ['/..', '..'],
    ['/users/./x', '.'],
  ])('rejects %j with VIBE9001', (path, segment) => {
    expect(() => get(path)).toThrow(
      expect.objectContaining({ code: 'VIBE9001', args: { path, segment }, fixes: nonEmpty }),
    );
  });
});

describe('isRouteSpec', () => {
  it('rejects values that no builder returned', () => {
    for (const value of [undefined, null, 1, { method: 'GET', path: '/', def: {} }]) {
      expect(isRouteSpec(value)).toBe(false);
    }
  });
});
