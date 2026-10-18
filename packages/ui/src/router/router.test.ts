// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../router.ts';
import { createMemoryHistory } from './history.ts';
import {
  addViewGuard,
  createRouter,
  isNavigationFailure,
  NavigationFailureType,
  START_LOCATION,
} from './router.ts';
import type {
  NavigationFailure,
  NavigationGuard,
  RouteLocation,
  Router,
  RouterHistory,
  RouterOptions,
  RouteRecordRaw,
} from './types.ts';

const component = {};
type AfterHook = Parameters<Router['afterEach']>[0];
type ErrorHandler = Parameters<Router['onError']>[0];
const code = (value: string) => expect.objectContaining({ code: value });

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(routes: RouteRecordRaw[], base?: string) {
  const history = createMemoryHistory(base);
  const router = createRouter({ history, routes });
  return { history, router };
}

/** A promise with its settle functions; the ui lib target predates Promise.withResolvers. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** Resolves with the next navigation that settles. */
function settled(router: Router) {
  return new Promise<{ to: RouteLocation; failure?: NavigationFailure }>((resolve) => {
    const stop = router.afterEach((to, _from, failure) => {
      stop();
      resolve({ to, failure });
    });
  });
}

/** Waits for pending promise callbacks. */
const tick = () => new Promise((resolve) => setTimeout(resolve));

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component },
  { path: '/a', name: 'a', component },
  { path: '/b', name: 'b', component },
  { path: '/c', name: 'c', component },
  { path: '/users/:id', name: 'user', component },
];

describe('@vibejs-org/ui/router', () => {
  it('exports only the router core', () => {
    const names = Object.keys(entry);
    names.sort();
    expect(names).toEqual([
      'NavigationFailureType',
      'START_LOCATION',
      'createMemoryHistory',
      'createRouter',
      'isNavigationFailure',
    ]);
    expect(NavigationFailureType).toEqual({
      aborted: 'aborted',
      cancelled: 'cancelled',
      duplicated: 'duplicated',
    });
  });

  it('starts at START_LOCATION', () => {
    const { router } = setup(routes);
    expect(router.currentRoute.value).toBe(START_LOCATION);
    expect(START_LOCATION).toEqual({
      path: '/',
      fullPath: '/',
      name: undefined,
      params: {},
      query: {},
      hash: '',
      matched: [],
      meta: {},
      redirectedFrom: undefined,
    });
  });

  it('returns the normalized records in match order from getRoutes()', () => {
    const { router } = setup(routes);
    expect(router.getRoutes().map((record) => record.path)).toEqual([
      '/',
      '/users/:id',
      '/a',
      '/b',
      '/c',
    ]);
  });
});

describe('resolve', () => {
  it('resolves strings relative to the current route, with query arrays and a hash', async () => {
    const { router } = setup([{ path: '/docs/:page', name: 'docs', component }]);
    await router.push('/docs/intro');
    expect(router.resolve('setup?tag=a&tag=b#top')).toMatchObject({
      path: '/docs/setup',
      fullPath: '/docs/setup?tag=a&tag=b#top',
      name: 'docs',
      params: { page: 'setup' },
      query: { tag: ['a', 'b'] },
      hash: '#top',
      href: '/docs/setup?tag=a&tag=b#top',
      redirectedFrom: undefined,
    });
    expect(router.resolve({ path: 'faq', query: { q: 'x y', none: null } })).toMatchObject({
      path: '/docs/faq',
      fullPath: '/docs/faq?q=x+y',
      query: { q: 'x y' },
    });
  });

  it('resolves a named location, dropping null and undefined query values', () => {
    const { router } = setup(routes);
    expect(
      router.resolve({
        name: 'user',
        params: { id: 'a b' },
        query: { a: [1, null, 2], b: undefined },
        hash: '#h',
      }),
    ).toMatchObject({
      path: '/users/a%20b',
      fullPath: '/users/a%20b?a=1&a=2#h',
      name: 'user',
      params: { id: 'a b' },
      query: { a: ['1', '2'] },
      hash: '#h',
    });
    expect(router.resolve({ name: 'home' }).fullPath).toBe('/');
  });

  it('keeps the current path for a query-only location', async () => {
    const { router } = setup(routes);
    await router.push('/a?x=1#old');
    expect(router.resolve({ query: { y: 2 } }).fullPath).toBe('/a?y=2');
    expect(router.resolve({ hash: '#h' }).fullPath).toBe('/a#h');
    expect(router.resolve({ path: '/a', hash: 'top' })).toMatchObject({
      fullPath: '/a#top',
      query: {},
      hash: '#top',
    });
    expect(router.resolve({}).fullPath).toBe('/a');
  });

  it('prefixes href with the history base', () => {
    const { router } = setup(routes, '/app/');
    expect(router.resolve({ name: 'a', query: { q: 1 } }).href).toBe('/app/a?q=1');
  });

  it('merges meta from parent to child', () => {
    const { router } = setup([
      {
        path: '/a',
        meta: { auth: true, title: 'A' },
        children: [{ path: 'b', meta: { title: 'B' } }],
      },
    ]);
    expect(router.resolve('/a/b').meta).toEqual({ auth: true, title: 'B' });
  });
});

describe('navigation', () => {
  it('runs leave, beforeEach, update, beforeEnter, lazy load, beforeResolve, commit, afterEach', async () => {
    const log: string[] = [];
    const guard =
      (name: string): NavigationGuard =>
      () => {
        log.push(name);
      };
    const { history, router } = setup([
      {
        path: '/shared',
        component,
        children: [
          { path: 'from', component, children: [{ path: 'deep', component }] },
          {
            path: 'to',
            beforeEnter: [guard('beforeEnter to'), guard('beforeEnter to 2')],
            component: async () => {
              log.push('lazy load');
              return component;
            },
          },
        ],
      },
    ]);
    await router.push('/shared/from/deep');
    const [shared, from, deep] = router.currentRoute.value.matched;
    addViewGuard(router, 'leave', () => from, guard('leave from'));
    addViewGuard(router, 'leave', () => deep, guard('leave deep'));
    addViewGuard(router, 'update', () => shared, guard('update shared'));
    addViewGuard(router, 'update', () => deep, guard('update deep (not run)'));
    addViewGuard(router, 'leave', () => undefined, guard('leave nothing (not run)'));
    router.beforeEach(guard('beforeEach'));
    router.beforeResolve(guard('beforeResolve'));
    router.afterEach(() => log.push('afterEach'));
    const push = history.push.bind(history);
    history.push = (to) => {
      log.push(`commit ${router.currentRoute.value.fullPath}`);
      push(to);
    };
    expect(await router.push('/shared/to')).toBeUndefined();
    expect(log).toEqual([
      'leave deep',
      'leave from',
      'beforeEach',
      'update shared',
      'beforeEnter to',
      'beforeEnter to 2',
      'lazy load',
      'beforeResolve',
      'commit /shared/to',
      'afterEach',
    ]);
    expect(history.location).toBe('/shared/to');
  });

  it('stops running a guard after its remover is called', async () => {
    const { router } = setup(routes);
    const guard = vi.fn<NavigationGuard>();
    const hook = vi.fn<() => void>();
    const removers = [
      router.beforeEach(guard),
      router.beforeResolve(guard),
      router.afterEach(hook),
    ];
    const record = () => router.currentRoute.value.matched[0];
    removers.push(addViewGuard(router, 'leave', record, guard));
    await router.push('/a');
    for (const remove of removers) remove();
    await router.push('/b');
    expect(guard).toHaveBeenCalledTimes(2);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('pushes and replaces history entries', async () => {
    const { history, router } = setup(routes);
    await router.push('/a');
    await router.push({ path: '/b' });
    await router.replace('/c');
    await router.push({ name: 'a', replace: true });
    expect(history.location).toBe('/a');
    history.go(-1, false);
    expect(history.location).toBe('/a');
    history.go(-1, false);
    expect(history.location).toBe('/');
  });

  it('gives an aborted failure when a guard returns false', async () => {
    const { router } = setup(routes);
    await router.push('/a');
    const after = vi.fn<AfterHook>();
    router.afterEach(after);
    router.beforeEach((to) => to.path !== '/b');
    const failure = await router.push('/b');
    expect(isNavigationFailure(failure, NavigationFailureType.aborted)).toBe(true);
    expect(failure).toMatchObject({ type: 'aborted', to: { path: '/b' }, from: { path: '/a' } });
    expect(failure?.message).toBe('Navigation from /a to /b was aborted.');
    expect(router.currentRoute.value.path).toBe('/a');
    expect(after).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ path: '/b' }),
      expect.objectContaining({ path: '/a' }),
      failure,
    );
  });

  it('gives a cancelled failure when a second push starts while one is pending', async () => {
    const { router } = setup(routes);
    const gate = deferred<boolean>();
    router.beforeEach((to) => (to.path === '/a' ? gate.promise : true));
    const first = router.push('/a');
    expect(await router.push('/b')).toBeUndefined();
    gate.resolve(true);
    const failure = await first;
    expect(isNavigationFailure(failure, 'cancelled')).toBe(true);
    expect(isNavigationFailure(failure, 'aborted')).toBe(false);
    expect(router.currentRoute.value.path).toBe('/b');
  });

  it('cancels a pending push with a duplicated one', async () => {
    const { router } = setup(routes);
    await router.push('/a');
    const gate = deferred<boolean>();
    router.beforeEach((to) => (to.path === '/b' ? gate.promise : true));
    const pending = router.push('/b');
    expect(await router.push('/a')).toMatchObject({ type: 'duplicated' });
    gate.resolve(true);
    expect(await pending).toMatchObject({ type: 'cancelled' });
    expect(router.currentRoute.value.path).toBe('/a');
  });

  it('gives a duplicated failure for the same fullPath and still calls afterEach', async () => {
    const { router } = setup(routes);
    await router.push('/a?x=1');
    const after = vi.fn<AfterHook>();
    router.afterEach(after);
    const failure = await router.push({ path: '/a', query: { x: 1 } });
    expect(failure).toMatchObject({ type: 'duplicated' });
    expect(after).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.anything(), failure);
    expect(await router.push('/a?x=2')).toBeUndefined();
  });

  it('follows a guard redirect, setting redirectedFrom and keeping replace', async () => {
    const { history, router } = setup(routes);
    await router.push('/a');
    const replace = vi.spyOn(history, 'replace');
    const push = vi.spyOn(history, 'push');
    router.beforeEach((to) => (to.path === '/b' ? { name: 'c', query: { from: 'b' } } : undefined));
    expect(await router.replace('/b')).toBeUndefined();
    expect(router.currentRoute.value).toMatchObject({
      fullPath: '/c?from=b',
      redirectedFrom: { fullPath: '/b' },
    });
    expect(replace).toHaveBeenCalledExactlyOnceWith('/c?from=b');
    expect(push).not.toHaveBeenCalled();
  });

  it('follows record redirects relative to the target', async () => {
    const { router } = setup([
      ...routes,
      { path: '/old', redirect: '/a' },
      { path: '/docs/old', redirect: 'new' },
      { path: '/docs/new', component },
      { path: '/fn/:id', redirect: (to) => ({ name: 'user', params: to.params, replace: true }) },
      { path: '/parent', redirect: '/a', children: [{ path: 'child', component }] },
    ]);
    await router.push('/old');
    expect(router.currentRoute.value).toMatchObject({
      path: '/a',
      redirectedFrom: { path: '/old' },
    });
    await router.push('/docs/old');
    expect(router.currentRoute.value.path).toBe('/docs/new');
    await router.push('/fn/7');
    expect(router.currentRoute.value).toMatchObject({ path: '/users/7', params: { id: '7' } });
    // Only the last matched record redirects.
    await router.push('/parent/child');
    expect(router.currentRoute.value.path).toBe('/parent/child');
  });

  it('allows 10 redirects and throws VIBE7108 on the 11th', async () => {
    const chain = Array.from({ length: 11 }, (_, i) => ({
      path: `/r${i}`,
      redirect: `/r${i + 1}`,
    }));
    const { router } = setup([...chain, { path: '/r11', component }]);
    const onError = vi.fn<ErrorHandler>();
    router.onError(onError);
    await router.push('/r1');
    expect(router.currentRoute.value.path).toBe('/r11');
    await expect(router.push('/r0')).rejects.toEqual(code('VIBE7108'));
    expect(onError).toHaveBeenCalledOnce();
  });

  it('counts record and guard redirects together', async () => {
    const { router } = setup([
      ...routes,
      { path: '/n/:i', redirect: '/n2' },
      { path: '/n2', component },
    ]);
    let n = 0;
    router.beforeEach((to) => (to.path === '/n2' ? `/n/${++n}` : undefined));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(router.push('/n2')).rejects.toEqual(code('VIBE7108'));
    // The 11th redirect is the sixth one of the guard.
    expect(n).toBe(6);
  });
});

describe('errors', () => {
  it('rejects push and calls every onError handler when a guard throws', async () => {
    const { router } = setup(routes);
    await router.push('/a');
    const error = new Error('guard failed');
    router.beforeEach(() => {
      throw error;
    });
    const handlers = [vi.fn<ErrorHandler>(), vi.fn<ErrorHandler>()];
    const removed = vi.fn<ErrorHandler>();
    for (const handler of handlers) router.onError(handler);
    router.onError(removed)();
    const after = vi.fn<AfterHook>();
    router.afterEach(after);
    await expect(router.push('/b')).rejects.toBe(error);
    for (const handler of handlers) {
      expect(handler).toHaveBeenCalledExactlyOnceWith(
        error,
        expect.objectContaining({ path: '/b' }),
        expect.objectContaining({ path: '/a' }),
      );
    }
    expect(removed).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/a');
  });

  it('logs the error with console.error when no onError handler exists', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { router } = setup(routes);
    const error = new Error('async guard failed');
    router.beforeResolve(async () => Promise.reject(error));
    await expect(router.push('/a')).rejects.toBe(error);
    expect(spy).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('rejects push without onError when the location does not resolve', async () => {
    const { router } = setup(routes);
    const onError = vi.fn<ErrorHandler>();
    router.onError(onError);
    await expect(router.push({ name: 'missing' })).rejects.toEqual(code('VIBE7105'));
    await expect(router.push({ name: 'user' })).rejects.toEqual(code('VIBE7104'));
    expect(onError).not.toHaveBeenCalled();
  });

  it('prints only the code and the docs URL in prod', () => {
    vi.stubGlobal('__DEV__', false);
    const { router } = setup(routes);
    expect(() => router.resolve({ name: 'x' })).toThrow(
      expect.objectContaining({
        code: 'VIBE7105',
        message: '[VIBE7105] https://vibejs.org/v0/errors/VIBE7105?name=x',
      }),
    );
  });
});

describe('lazy components', () => {
  it('replaces the loader with the loaded component or the default export', async () => {
    const Page = { name: 'Page' };
    const { router } = setup([
      { path: '/plain', component: async () => Page },
      { path: '/module', component: async () => ({ default: Page }) },
    ]);
    await router.push('/plain');
    await router.push('/module');
    expect(router.getRoutes().map((record) => record.component)).toEqual([Page, Page]);
  });

  it('loads one component exactly once for two concurrent navigations', async () => {
    const gate = deferred<object>();
    const loader = vi.fn<() => Promise<object>>(() => gate.promise);
    const { router } = setup([...routes, { path: '/lazy', component: loader }]);
    const first = router.push('/lazy');
    const second = router.push('/lazy?again');
    await tick();
    gate.resolve(component);
    expect(await first).toMatchObject({ type: 'cancelled' });
    expect(await second).toBeUndefined();
    await router.push('/a');
    await router.push('/lazy');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('throws VIBE7109 with the cause when the loader rejects or throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = new Error('chunk missing');
    const { router } = setup([
      { path: '/rejects', component: async () => Promise.reject(cause) },
      {
        path: '/throws',
        component: () => {
          throw cause;
        },
      },
    ]);
    await expect(router.push('/rejects')).rejects.toMatchObject({
      code: 'VIBE7109',
      args: { path: '/rejects' },
      cause,
    });
    await expect(router.push('/throws')).rejects.toMatchObject({ code: 'VIBE7109', cause });
  });

  it('loads again after a failed load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const loader = vi
      .fn<() => Promise<object>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(component);
    const { router } = setup([{ path: '/lazy', component: loader }]);
    await expect(router.push('/lazy')).rejects.toEqual(code('VIBE7109'));
    expect(await router.push('/lazy')).toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('throws VIBE7110 when the loader resolves to something other than a component', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { router } = setup([
      /* oxlint-disable typescript/no-unsafe-type-assertion -- loaders that break their type */
      { path: '/number', component: async () => 42 as unknown as object },
      { path: '/null', component: async () => null as unknown as object },
      /* oxlint-enable typescript/no-unsafe-type-assertion */
      { path: '/function', component: async () => ({ default: () => {} }) },
    ]);
    await expect(router.push('/number')).rejects.toMatchObject({
      code: 'VIBE7110',
      args: { path: '/number', type: 'number' },
    });
    await expect(router.push('/null')).rejects.toMatchObject({ args: { type: 'null' } });
    // A module is an object, so it counts as the component when its default export is not one.
    await router.push('/function');
    expect(router.currentRoute.value.path).toBe('/function');
  });
});

// Guards written for a next() callback, which the types reject.
/* oxlint-disable typescript/no-unsafe-type-assertion */
const next = ((_to: unknown, _from: unknown, _next: unknown) => {}) as NavigationGuard;
const named = function auth(_to: unknown, _from: unknown, _next: unknown) {} as NavigationGuard;
const anonymous = [
  (_a: unknown, _b: unknown, _c: unknown, _d: unknown) => {},
][0] as NavigationGuard;
/* oxlint-enable typescript/no-unsafe-type-assertion */

describe('VIBE7107 and VIBE7103', () => {
  it('rejects a guard with a next parameter on every registration path', () => {
    const { router } = setup(routes);
    expect(() => router.beforeEach(next)).toThrow(code('VIBE7107'));
    expect(() => router.beforeResolve(next)).toThrow(code('VIBE7107'));
    expect(() => addViewGuard(router, 'leave', () => undefined, next)).toThrow(code('VIBE7107'));
    expect(() => setup([{ path: '/', beforeEnter: [() => {}, next] }])).toThrow(code('VIBE7107'));
    expect(() => router.beforeEach(named)).toThrow(
      expect.objectContaining({ args: { guard: 'auth', count: 3 } }),
    );
    expect(() => router.beforeEach(anonymous)).toThrow(
      expect.objectContaining({ args: { guard: 'anonymous', count: 4 } }),
    );
  });

  it.each([
    ['scrollBehavior', 'scroll behavior'],
    ['linkActiveClass', 'active classes'],
    ['parseQuery', 'URLSearchParams'],
    ['strict', 'trailing slash'],
    ['sensitive', 'case-insensitively'],
    ['base', 'not a known option'],
  ])('rejects the router option %s, naming the deferral', (option, deferral) => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an unsupported option
    const options = { history: createMemoryHistory(), routes, [option]: true } as RouterOptions;
    expect(() => createRouter(options)).toThrow(
      expect.objectContaining({
        code: 'VIBE7103',
        args: { option, where: 'createRouter()', deferral: expect.stringContaining(deferral) },
      }),
    );
  });
});

/** History-driven navigations keep the history entry and `currentRoute` in step. */
function expectSynced({ history, router }: { history: RouterHistory; router: Router }) {
  expect(history.location).toBe(router.currentRoute.value.fullPath);
}

/** A router at /b after /a, with spies on the history writes. */
async function atB() {
  const { history, router } = setup(routes);
  await router.push('/a');
  await router.push('/b');
  return {
    history,
    router,
    push: vi.spyOn(history, 'push'),
    replace: vi.spyOn(history, 'replace'),
    go: vi.spyOn(history, 'go'),
  };
}

describe('history-driven navigation', () => {
  it('listens to the history only once the first navigation settles', async () => {
    const { history, router } = setup(routes);
    history.push('/a');
    history.go(-1);
    await tick();
    expect(router.currentRoute.value).toBe(START_LOCATION);
    await router.push('/b');
    history.go(-1);
    await settled(router);
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('commits back(), forward() and go() without writing the history', async () => {
    const { history, router, push, replace } = await atB();
    router.back();
    expect((await settled(router)).to.path).toBe('/a');
    expect(router.currentRoute.value.path).toBe('/a');
    expectSynced({ history, router });
    router.forward();
    await settled(router);
    expect(router.currentRoute.value.path).toBe('/b');
    router.go(-2);
    await settled(router);
    expect(router.currentRoute.value.path).toBe('/');
    expectSynced({ history, router });
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('reverts an aborted one with go(-delta, false) and no second navigation', async () => {
    const { history, router, go } = await atB();
    router.beforeEach(() => false);
    const after = vi.fn<AfterHook>();
    router.afterEach(after);
    router.go(-2);
    expect((await settled(router)).failure).toMatchObject({ type: 'aborted' });
    expect(go).toHaveBeenLastCalledWith(2, false);
    expect(history.location).toBe('/b');
    await tick();
    expect(after).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.path).toBe('/b');
  });

  it('leaves a cancelled one to the push that cancelled it', async () => {
    const { history, router, go } = await atB();
    const gate = deferred();
    router.beforeEach((to) => (to.path === '/a' ? gate.promise : undefined));
    const after = vi.fn<AfterHook>();
    router.afterEach(after);
    router.back();
    await tick();
    await router.push('/c');
    gate.resolve();
    await tick();
    expect(after).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: '/a' }),
      expect.objectContaining({ path: '/b' }),
      expect.objectContaining({ type: 'cancelled' }),
    );
    expect(go).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.path).toBe('/c');
    expectSynced({ history, router });
    history.go(-1, false);
    expect(history.location).toBe('/a');
  });

  it('restores the history when a push aborts while a back() is pending', async () => {
    const { history, router, go } = await atB();
    const gate = deferred();
    router.beforeEach((to) => (to.path === '/a' ? gate.promise : to.path !== '/c'));
    router.back();
    expect(await router.push('/c')).toMatchObject({ type: 'aborted' });
    expect(go).toHaveBeenLastCalledWith(1, false);
    gate.resolve();
    await tick();
    expect(router.currentRoute.value.path).toBe('/b');
    expectSynced({ history, router });
  });

  it('leaves a cancelled one to the history move that cancelled it', async () => {
    const { history, router, go } = await atB();
    const gate = deferred();
    router.beforeEach((to) => (to.path === '/a' ? gate.promise : undefined));
    router.back();
    router.back();
    expect((await settled(router)).to.path).toBe('/');
    gate.resolve();
    expect((await settled(router)).failure).toMatchObject({ type: 'cancelled' });
    expect(go).toHaveBeenCalledTimes(2);
    expect(router.currentRoute.value.path).toBe('/');
    expectSynced({ history, router });
  });

  it('restores every history step when the latest of two moves aborts', async () => {
    const { history, router, go } = await atB();
    const gate = deferred();
    router.beforeEach((to) => (to.path === '/a' ? gate.promise : to.path !== '/'));
    router.back();
    router.back();
    expect((await settled(router)).failure).toMatchObject({ type: 'aborted' });
    expect(go).toHaveBeenLastCalledWith(2, false);
    gate.resolve();
    await tick();
    expect(router.currentRoute.value.path).toBe('/b');
    expectSynced({ history, router });
  });

  it('leaves the history to the newer navigation when a cancelled one throws', async () => {
    const { history, router } = await atB();
    const [a, root] = [deferred(), deferred()];
    router.beforeEach((to) => (to.path === '/a' ? a : root).promise);
    const onError = vi.fn<ErrorHandler>();
    router.onError(onError);
    router.back();
    router.back();
    a.reject(new Error('stale guard failed'));
    await tick();
    expect(onError).toHaveBeenCalledOnce();
    root.resolve();
    await settled(router);
    expect(router.currentRoute.value.path).toBe('/');
    expectSynced({ history, router });
  });

  it('does not revert a duplicated one that is already the current entry', async () => {
    const { history, router, go } = await atB();
    history.push('/b');
    history.go(-1);
    expect((await settled(router)).failure).toMatchObject({ type: 'duplicated' });
    expect(go).toHaveBeenCalledOnce();
    expectSynced({ history, router });
  });

  it('reverts one that a guard redirects to the current route', async () => {
    const { history, router, go } = await atB();
    router.beforeEach((to) => (to.path === '/a' ? '/b' : undefined));
    router.back();
    expect((await settled(router)).failure).toMatchObject({ type: 'duplicated' });
    expect(go).toHaveBeenLastCalledWith(1, false);
    expect(router.currentRoute.value.path).toBe('/b');
    expectSynced({ history, router });
  });

  it('replaces the entry when it redirects', async () => {
    const { history, router, push, replace } = await atB();
    router.beforeEach((to) => (to.path === '/a' ? '/c' : undefined));
    router.back();
    await settled(router);
    expect(router.currentRoute.value).toMatchObject({ path: '/c', redirectedFrom: { path: '/a' } });
    expect(replace).toHaveBeenCalledExactlyOnceWith('/c');
    expect(push).not.toHaveBeenCalled();
    expect(history.location).toBe('/c');
  });

  it('reports a thrown error to onError without an unhandled rejection', async () => {
    const { history, router } = await atB();
    const error = new Error('guard failed');
    router.beforeEach(() => {
      throw error;
    });
    const failed = deferred<unknown>();
    router.onError(failed.resolve);
    router.back();
    expect(await failed.promise).toBe(error);
    expect(router.currentRoute.value.path).toBe('/b');
    expectSynced({ history, router });
  });
});

describe('isReady', () => {
  it('resolves when the first navigation commits', async () => {
    const { router } = setup(routes);
    const ready = vi.fn<() => void>();
    void router.isReady().then(ready);
    router.beforeEach((to) => to.path !== '/a');
    await router.push('/a');
    await tick();
    expect(ready).not.toHaveBeenCalled();
    await router.push('/b');
    await expect(router.isReady()).resolves.toBeUndefined();
    expect(ready).toHaveBeenCalledOnce();
  });

  it('rejects with the error when the first navigation throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { router } = setup(routes);
    const error = new Error('first navigation failed');
    router.beforeEach(() => {
      throw error;
    });
    await expect(router.push('/a')).rejects.toBe(error);
    await expect(router.isReady()).rejects.toBe(error);
  });

  it('rejects and starts listening when the first location does not resolve', async () => {
    const { history, router } = setup(routes);
    await expect(router.push({ name: 'nope' })).rejects.toEqual(code('VIBE7105'));
    await expect(router.isReady()).rejects.toEqual(code('VIBE7105'));
    history.push('/a');
    history.go(-1);
    await settled(router);
    expect(router.currentRoute.value.path).toBe('/');
    history.go(1);
    await settled(router);
    expect(router.currentRoute.value.path).toBe('/a');
  });
});
