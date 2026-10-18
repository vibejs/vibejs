import { describe, expect, it } from 'vitest';
import { defineContract, isRoute } from './contract.ts';
import { del, get, post } from './route.ts';

const nonEmpty = expect.arrayContaining([expect.any(String)]);

describe('defineContract', () => {
  it('binds full paths, names and methods', () => {
    const users = defineContract('/users', {
      list: get('/'),
      create: post('/'),
      remove: del('/:id'),
    });
    expect(users.list).toMatchObject({ method: 'GET', path: '/users', name: 'list' });
    expect(users.create).toMatchObject({ method: 'POST', path: '/users', name: 'create' });
    expect(users.remove).toMatchObject({ method: 'DELETE', path: '/users/:id', name: 'remove' });
  });

  it('freezes the record and the routes, and keeps def by identity', () => {
    const def = { summary: 'One user' };
    const spec = get('/:id', def);
    const a = defineContract('/orgs/:orgId/users', { one: spec });
    const b = defineContract('/orgs/:orgId/users', { one: spec });
    expect(a.one.path).toBe('/orgs/:orgId/users/:id');
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.one)).toBe(true);
    expect(a.one.def).toBe(def);
    expect(Object.isFrozen(def)).toBe(false);
    expect(a.one).not.toBe(b.one);
    expect(a.one).not.toBe(spec);
  });

  it.each([
    ['/', ''],
    ['/users/', ''],
    ['users', 'users'],
    ['/a b', 'a b'],
  ])('rejects the prefix %j with VIBE9001', (prefix, segment) => {
    expect(() => defineContract(prefix, {})).toThrow(
      expect.objectContaining({
        code: 'VIBE9001',
        args: { path: prefix, segment },
        fixes: nonEmpty,
      }),
    );
  });

  it.each([
    ['/a', '/:id/x/:id', '/a/:id/x/:id'],
    ['/orgs/:id', '/:id', '/orgs/:id/:id'],
  ])('rejects %j + %j with VIBE9002', (prefix, path, full) => {
    expect(() => defineContract(prefix, { r: get(path) })).toThrow(
      expect.objectContaining({
        code: 'VIBE9002',
        args: { path: full, param: 'id' },
        fixes: nonEmpty,
      }),
    );
  });

  it('rejects values that are not route specs with VIBE9003', () => {
    const bound = defineContract('/a', { one: get('/') }).one;
    for (const value of [{ method: 'GET', path: '/', def: {} }, undefined, bound]) {
      // Called the way untyped JavaScript would call it.
      expect(() => Reflect.apply(defineContract, undefined, ['/a', { bad: value }])).toThrow(
        expect.objectContaining({ code: 'VIBE9003', args: { key: 'bad' }, fixes: nonEmpty }),
      );
    }
  });
});

describe('isRoute', () => {
  it('is true only for bound routes', () => {
    const spec = get('/');
    expect(isRoute(defineContract('/a', { spec }).spec)).toBe(true);
    for (const value of [
      spec,
      { method: 'GET', path: '/a', def: {}, name: 'x' },
      null,
      undefined,
      1,
      'x',
    ]) {
      expect(isRoute(value)).toBe(false);
    }
  });
});
