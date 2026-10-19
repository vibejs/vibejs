// @vitest-environment node
// Upstream: vuejs/router@47b95baae1ebdeb564bd1adf8168c9e9d6d09d0a packages/router/__tests__/matcher/resolve.spec.ts (MIT)
//
// Limited to the supported records: no aliases, named views or path options. A named location
// does not merge the params of the current location, an absent optional param is a missing key,
// and `matched` is compared by the full paths of the records.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatcher } from './matcher.ts';
import type { RouteParamsRaw, RouteRecordRaw } from './types.ts';

const component = {};
const guard = () => {};
const code = (value: string) => expect.objectContaining({ code: value });

afterEach(() => {
  vi.restoreAllMocks();
});

function resolve(
  records: RouteRecordRaw | RouteRecordRaw[],
  location: { path: string } | { name: string; params?: RouteParamsRaw },
) {
  const matcher = createMatcher([records].flat());
  const route =
    'path' in location
      ? matcher.resolvePath(location.path)
      : matcher.resolveName(location.name, location.params ?? {});
  return { ...route, matched: route.matched.map((record) => record.path) };
}

describe('RouterMatcher.resolve', () => {
  describe('LocationAsPath', () => {
    it('resolves a normal path', () => {
      expect(resolve({ path: '/', name: 'Home', component }, { path: '/' })).toMatchObject({
        name: 'Home',
        params: {},
        matched: ['/'],
      });
    });

    it('resolves a normal path without name', () => {
      expect(resolve({ path: '/', component }, { path: '/' })).toMatchObject({
        name: undefined,
        params: {},
      });
    });

    it('resolves a path with params', () => {
      expect(
        resolve({ path: '/users/:id', name: 'User', component }, { path: '/users/posva' }),
      ).toMatchObject({ name: 'User', params: { id: 'posva' } });
    });

    it('resolves an array of params for a repeatable params', () => {
      expect(
        resolve(
          { path: '/a/:p+', name: 'a', component },
          { name: 'a', params: { p: ['b', 'c', 'd'] } },
        ),
      ).toMatchObject({ name: 'a', path: '/a/b/c/d', params: { p: ['b', 'c', 'd'] } });
    });

    it('keeps repeated params as a single one when provided through path', () => {
      expect(resolve({ path: '/a/:p+', name: 'a', component }, { path: '/a/b/c' })).toMatchObject({
        name: 'a',
        params: { p: ['b', 'c'] },
      });
    });

    it('resolves a path with multiple params', () => {
      expect(
        resolve(
          { path: '/users/:id/:other', name: 'User', component },
          { path: '/users/posva/hey' },
        ),
      ).toMatchObject({ name: 'User', params: { id: 'posva', other: 'hey' } });
    });

    it('resolves a path with multiple params but no name', () => {
      expect(
        resolve({ path: '/users/:id/:other', component }, { path: '/users/posva/hey' }),
      ).toMatchObject({ name: undefined, params: { id: 'posva', other: 'hey' } });
    });

    it('returns an empty match when the path does not exist', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(resolve({ path: '/', component }, { path: '/foo' })).toMatchObject({
        name: undefined,
        params: {},
        matched: [],
      });
    });

    it('allows an optional trailing slash', () => {
      expect(
        resolve({ path: '/home/', name: 'Home', component }, { path: '/home/' }),
      ).toMatchObject({ name: 'Home', matched: ['/home/'] });
    });

    it('allows an optional trailing slash with optional param', () => {
      expect(resolve({ path: '/:a', component, name: 'a' }, { path: '/a/' })).toMatchObject({
        params: { a: 'a' },
        name: 'a',
      });
      expect(resolve({ path: '/a/:a', component, name: 'a' }, { path: '/a/a/' })).toMatchObject({
        params: { a: 'a' },
        name: 'a',
      });
    });

    it('allows an optional trailing slash with missing optional param', () => {
      expect(resolve({ path: '/:a?', component, name: 'a' }, { path: '/' })).toMatchObject({
        name: 'a',
      });
      expect(resolve({ path: '/a/:a?', component, name: 'a' }, { path: '/a/' })).toMatchObject({
        name: 'a',
      });
      expect(resolve({ path: '/a/:a?', component }, { path: '/a/' }).params).toEqual({});
    });
  });

  describe('LocationAsName', () => {
    it('matches a name', () => {
      expect(resolve({ path: '/home', name: 'Home', component }, { name: 'Home' })).toMatchObject({
        name: 'Home',
        path: '/home',
      });
    });

    it('matches a name and fill params', () => {
      expect(
        resolve(
          { path: '/users/:id/m/:role', name: 'UserEdit', component },
          { name: 'UserEdit', params: { id: 'posva', role: 'admin' } },
        ),
      ).toMatchObject({ name: 'UserEdit', path: '/users/posva/m/admin' });
    });

    it('throws if the named route does not exists', () => {
      expect(() => resolve({ path: '/', component }, { name: 'Home' })).toThrow(code('VIBE7105'));
    });

    it('discards non existent params', () => {
      expect(
        resolve(
          { path: '/', name: 'home', component },
          { name: 'home', params: { a: 'a', b: 'b' } },
        ),
      ).toMatchObject({ name: 'home', path: '/', params: {} });
      expect(
        resolve({ path: '/:b', name: 'a', component }, { name: 'a', params: { a: 'a', b: 'b' } }),
      ).toMatchObject({ name: 'a', path: '/b', params: { b: 'b' } });
    });

    it('drops optional params', () => {
      expect(
        resolve({ path: '/:a/:b?', name: 'p', component }, { name: 'p', params: { a: 'b' } }),
      ).toMatchObject({ name: 'p', path: '/b', params: { a: 'b' } });
    });

    it('drops optional params passed as empty strings', () => {
      expect(
        resolve(
          { path: '/:a/:b?', name: 'p', component },
          { name: 'p', params: { a: 'b', b: '' } },
        ),
      ).toMatchObject({ path: '/b', params: { a: 'b' } });
    });

    it('resolves root path with optional params', () => {
      expect(resolve({ path: '/:tab?', name: 'h', component }, { name: 'h' })).toMatchObject({
        name: 'h',
        path: '/',
        params: {},
      });
      expect(
        resolve({ path: '/:tab?/:other?', name: 'h', component }, { name: 'h' }),
      ).toMatchObject({ name: 'h', path: '/', params: {} });
    });

    it('can reach a named route with children and no component if named', () => {
      expect(
        resolve(
          { path: '/articles', name: 'ArticlesParent', children: [{ path: ':id', component }] },
          { name: 'ArticlesParent' },
        ),
      ).toMatchObject({ name: 'ArticlesParent', path: '/articles' });
    });
  });

  describe('children', () => {
    const ChildA = { path: 'a', name: 'child-a', component };
    const ChildB = { path: 'b', name: 'child-b', component };
    const ChildC = { path: 'c', name: 'child-c', component };
    const ChildD = { path: '/absolute', name: 'absolute', component };
    const ChildWithParam = { path: ':p', name: 'child-params', component };
    const NestedChildWithParam = { ...ChildWithParam, name: 'nested-child-params' };
    const NestedChildA = { ...ChildA, name: 'nested-child-a' };
    const NestedChildB = { ...ChildB, name: 'nested-child-b' };
    const NestedChildC = { ...ChildC, name: 'nested-child-c' };
    const Nested = {
      path: 'nested',
      name: 'nested',
      component,
      children: [NestedChildA, NestedChildB, NestedChildC],
    };
    const NestedWithParam = {
      path: 'nested/:n',
      name: 'nested',
      component,
      children: [NestedChildWithParam],
    };

    it('resolves children', () => {
      const Foo = { path: '/foo', name: 'Foo', component, children: [ChildA, ChildB, ChildC] };
      expect(resolve(Foo, { path: '/foo/b' })).toMatchObject({
        name: 'child-b',
        params: {},
        matched: ['/foo', '/foo/b'],
      });
    });

    it('resolves children with empty paths', () => {
      const Foo = {
        path: '/foo',
        name: 'Foo',
        component,
        children: [{ path: '', name: 'nested', component }],
      };
      expect(resolve(Foo, { path: '/foo' })).toMatchObject({
        name: 'nested',
        params: {},
        matched: ['/foo', '/foo'],
      });
    });

    it('resolves nested children with empty paths', () => {
      const NestedNested = { path: '', name: 'nested', component };
      const Foo = {
        path: '/foo',
        name: 'Foo',
        component,
        children: [{ path: '', name: 'nested-nested', component, children: [NestedNested] }],
      };
      expect(resolve(Foo, { path: '/foo' })).toMatchObject({
        name: 'nested',
        params: {},
        matched: ['/foo', '/foo', '/foo'],
      });
    });

    it('resolves nested children', () => {
      const Foo = { path: '/foo', name: 'Foo', component, children: [Nested] };
      expect(resolve(Foo, { path: '/foo/nested/a' })).toMatchObject({
        name: 'nested-child-a',
        params: {},
        matched: ['/foo', '/foo/nested', '/foo/nested/a'],
      });
    });

    it('resolves nested children with named location', () => {
      const Foo = { path: '/foo', name: 'Foo', component, children: [Nested] };
      expect(resolve(Foo, { name: 'nested-child-a' })).toMatchObject({
        name: 'nested-child-a',
        path: '/foo/nested/a',
        params: {},
        matched: ['/foo', '/foo/nested', '/foo/nested/a'],
      });
    });

    it('resolves nested children with params', () => {
      const Foo = { path: '/foo', name: 'Foo', component, children: [NestedWithParam] };
      expect(resolve(Foo, { path: '/foo/nested/a/b' })).toMatchObject({
        name: 'nested-child-params',
        params: { p: 'b', n: 'a' },
        matched: ['/foo', '/foo/nested/:n', '/foo/nested/:n/:p'],
      });
    });

    it('resolves nested children with params with named location', () => {
      const Foo = { path: '/foo', name: 'Foo', component, children: [NestedWithParam] };
      expect(
        resolve(Foo, { name: 'nested-child-params', params: { p: 'a', n: 'b' } }),
      ).toMatchObject({
        name: 'nested-child-params',
        path: '/foo/nested/b/a',
        params: { p: 'a', n: 'b' },
        matched: ['/foo', '/foo/nested/:n', '/foo/nested/:n/:p'],
      });
    });

    it('resolves absolute path children', () => {
      const Foo = { path: '/foo', name: 'Foo', component, children: [ChildA, ChildD] };
      expect(resolve(Foo, { path: '/absolute' })).toMatchObject({
        name: 'absolute',
        params: {},
        matched: ['/foo', '/absolute'],
      });
    });

    it('resolves children with root as the parent', () => {
      const Parent = { path: '/', name: 'parent', component, children: [Nested] };
      expect(resolve(Parent, { path: '/nested' })).toMatchObject({
        name: 'nested',
        params: {},
        matched: ['/', '/nested'],
      });
    });

    it('resolves children with parent with trailing slash', () => {
      const Parent = { path: '/parent/', name: 'parent', component, children: [Nested] };
      expect(resolve(Parent, { path: '/parent/nested' })).toMatchObject({
        name: 'nested',
        params: {},
        matched: ['/parent/', '/parent/nested'],
      });
    });
  });
});

describe('createMatcher', () => {
  it('flattens children first and sorts by score, keeping that order for equal scores', () => {
    const matcher = createMatcher([
      { path: '/:id', name: 'id' },
      { path: '/a', name: 'a', children: [{ path: '', name: 'a-index' }, { path: 'b' }] },
      { path: '/', name: 'home' },
    ]);
    expect(matcher.routes.map((record) => record.name ?? record.path)).toEqual([
      'home',
      '/a/b',
      'a-index',
      'a',
      'id',
    ]);
    const [, b, index, a] = matcher.routes;
    expect(b.parent).toBe(a);
    expect(a.children).toHaveLength(2);
    expect(a.children[0]).toBe(index);
    expect(a.children[1]).toBe(b);
  });

  it('normalizes records', () => {
    const redirect = '/b';
    const [a, b] = createMatcher([
      { path: '/a', beforeEnter: guard, redirect },
      { path: '/b', meta: { x: 1 }, beforeEnter: [guard, guard] },
    ]).routes;
    expect(a).toEqual({
      path: '/a',
      name: undefined,
      meta: {},
      redirect,
      beforeEnter: [guard],
      component: undefined,
      children: [],
      parent: undefined,
    });
    expect(b).toMatchObject({ meta: { x: 1 }, beforeEnter: [guard, guard] });
  });

  it('merges meta from parent to child', () => {
    const matcher = createMatcher([
      {
        path: '/a',
        meta: { a: 1, shared: 'parent' },
        children: [{ path: 'b', meta: { b: 2, shared: 'child' } }],
      },
    ]);
    expect(matcher.resolvePath('/a/b').meta).toEqual({ a: 1, b: 2, shared: 'child' });
    expect(matcher.resolvePath('/a').meta).toEqual({ a: 1, shared: 'parent' });
  });

  it('throws VIBE7101 for a top-level path without a leading slash', () => {
    expect(() => createMatcher([{ path: 'a' }])).toThrow(code('VIBE7101'));
  });

  it('throws VIBE7102 for a duplicate name', () => {
    expect(() =>
      createMatcher([
        { path: '/a', name: 'x' },
        { path: '/b', children: [{ path: 'c', name: 'x' }] },
      ]),
    ).toThrow(code('VIBE7102'));
  });

  it.each([
    ['components', 'named views'],
    ['alias', 'aliases'],
    ['sensitive', 'case-insensitively'],
    ['strict', 'trailing slash'],
    ['end', 'to their end'],
    ['compnent', 'not a known option'],
    ['toString', 'not a known option'],
  ])('throws VIBE7103 for the record key %s, naming the deferral', (option, deferral) => {
    const record = { path: '/a', [option]: true } as RouteRecordRaw;
    let error: unknown;
    try {
      createMatcher([{ path: '/', children: [record] }]);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toMatchObject({
      code: 'VIBE7103',
      args: { option, where: 'the route /a' },
      message: expect.stringContaining(deferral),
    });
  });

  it('throws VIBE7104 for a missing required param', () => {
    const matcher = createMatcher([{ path: '/users/:id', name: 'user' }]);
    expect(() => matcher.resolveName('user', {})).toThrow(code('VIBE7104'));
    expect(() => matcher.resolveName('user', { id: null })).toThrow(code('VIBE7104'));
  });

  it('warns VIBE7106 in dev when no route matches, and prints nothing in prod', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const matcher = createMatcher([{ path: '/' }]);
    expect(matcher.resolvePath('/missing')).toEqual({
      name: undefined,
      params: {},
      matched: [],
      meta: {},
    });
    expect(spy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('VIBE7106'));
    expect(spy.mock.calls[0][0]).toMatch(/^\[VIBE7106\] No route matches the path \/missing\./);
    spy.mockClear();
    vi.stubGlobal('__DEV__', false);
    matcher.resolvePath('/missing');
    expect(spy).not.toHaveBeenCalled();
  });
});
