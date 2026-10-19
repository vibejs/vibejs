import { isVibeError } from '@vibejs-org/errors';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { thrownCode } from '../../test/codes.ts';
import { handlers, page } from '../../test/router/components.ts';
import { computed } from '../reactivity/computed.ts';
import { inject } from '../runtime/inject.ts';
import { flushPromises, mount, mountComposable } from '../testing/mount.ts';
import { RouterView } from './components.ts';
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useLink,
  useRoute,
  useRouter,
} from './composables.ts';
import { createMemoryHistory } from './history.ts';
import { createRouter, START_LOCATION } from './router.ts';
import type { NavigationGuard, RouteRecordRaw } from './types.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: page('home') },
  { path: '/a', name: 'a', component: page('a') },
  { path: '/users/:id', name: 'user', component: page('user') },
];

function setup(list: RouteRecordRaw[] = routes) {
  const history = createMemoryHistory();
  const router = createRouter({ history, routes: list });
  return { history, router };
}

describe('install', () => {
  it('provides the router, navigates to the history location and resolves isReady()', async () => {
    const { history, router } = setup();
    history.push('/a');
    const { result } = mountComposable(() => useRouter(), { plugins: [router] });
    expect(result).toBe(router);
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe('/a');
    // The first navigation replaces the entry the page was loaded with.
    history.go(-1);
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  it('stops listening when the last app unmounts and listens again on a later install', async () => {
    const { history, router } = setup();
    const first = mountComposable(() => {}, { plugins: [router] });
    await router.isReady();
    const second = mountComposable(() => {}, { plugins: [router] });
    await router.push('/a');
    first.unmount();
    history.go(-1);
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/');
    second.unmount();
    history.go(1);
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/');
    expect(history.location).toBe('/a');
    // A later install does not navigate again, but listens.
    mountComposable(() => {}, { plugins: [router] });
    history.go(-1);
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/');
    expect(router.currentRoute.value).not.toBe(START_LOCATION);
  });

  it('stops listening when the last app unmounts before the first navigation settles', async () => {
    const { history, router } = setup();
    history.push('/a');
    let release!: () => void;
    const stop = router.beforeEach(() => new Promise<void>((resolve) => (release = resolve)));
    mountComposable(() => {}, { plugins: [router] }).unmount();
    stop();
    release();
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe('/a');
    history.go(-1);
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/a');
    // A later push does not listen again either.
    await router.push('/');
    history.go(1);
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  it('keeps a push made before install as the first navigation', async () => {
    const { router } = setup();
    const pushed = router.push('/a');
    mountComposable(() => {}, { plugins: [router] });
    await expect(pushed).resolves.toBeUndefined();
    expect(router.currentRoute.value.fullPath).toBe('/a');
  });

  it('starts the first navigation once when a second app installs while it is pending', async () => {
    const { router } = setup([{ path: '/', component: async () => page('home') }]);
    const guard = vi.fn<NavigationGuard>();
    router.beforeEach(guard);
    const after = vi.fn<() => void>();
    router.afterEach(after);
    mountComposable(() => {}, { plugins: [router] });
    mountComposable(() => {}, { plugins: [router] });
    await router.isReady();
    expect(guard).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
  });

  it('starts the first navigation on install after an earlier push failed', async () => {
    const { history, router } = setup();
    history.push('/a');
    const stop = router.beforeEach(() => false);
    await router.push('/users/1');
    stop();
    mountComposable(() => {}, { plugins: [router] });
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe('/a');
  });

  it('reports an error of the first navigation to onError and isReady()', async () => {
    const { router } = setup();
    const error = new Error('guard');
    router.beforeEach(() => {
      throw error;
    });
    const onError = vi.fn<(error: unknown) => void>();
    router.onError(onError);
    mountComposable(() => {}, { plugins: [router] });
    await expect(router.isReady()).rejects.toBe(error);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('runs guards, redirects, lazy loaders and afterEach hooks in the app context', async () => {
    const seen: unknown[] = [];
    const see = (where: string) => seen.push([where, inject('k'), useRouter() === router]);
    const { router } = setup([
      { path: '/', component: page('home') },
      {
        path: '/old',
        redirect: () => {
          see('redirect');
          return '/lazy';
        },
      },
      {
        path: '/lazy',
        component: async () => {
          see('loader');
          return page('lazy');
        },
      },
    ]);
    router.beforeEach(() => {
      see('beforeEach');
    });
    router.afterEach(() => {
      see('afterEach');
    });
    mountComposable(() => {}, { plugins: [router], provide: { k: 'v' } });
    await router.isReady();
    seen.length = 0;
    await router.push('/old');
    expect(seen).toEqual([
      ['redirect', 'v', true],
      ['beforeEach', 'v', true],
      ['loader', 'v', true],
      ['afterEach', 'v', true],
    ]);
  });

  it('moves to a still-mounted app when the first one unmounts', async () => {
    const { router } = setup();
    const seen: unknown[] = [];
    router.beforeEach(() => {
      seen.push(inject('k'));
    });
    const first = mountComposable(() => {}, { plugins: [router], provide: { k: 'first' } });
    await router.isReady();
    mountComposable(() => {}, { plugins: [router], provide: { k: 'second' } });
    first.unmount();
    seen.length = 0;
    await router.push('/a');
    expect(seen).toEqual(['second']);
  });
});

describe('useRouter and useRoute', () => {
  it('throw VIBE7111 without a router', () => {
    const errors: unknown[] = [];
    mountComposable(() => useRoute(), { plugins: [handlers((err) => errors.push(err))] });
    expect(isVibeError(errors[0], 'VIBE7111')).toBe(true);
    expect(errors[0]).toMatchObject({ args: { api: 'useRoute()' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(thrownCode(() => useRouter())).toBe('VIBE7111');
  });

  it('gives one reactive route object that reads the current route', async () => {
    const { router } = setup();
    const { result } = mountComposable(
      () => {
        const route = useRoute();
        return { route, again: useRoute(), path: computed(() => route.fullPath) };
      },
      { plugins: [router] },
    );
    await router.isReady();
    expect(result.route).toBe(result.again);
    expect(result.path.value).toBe('/');
    await router.push('/users/1?q=1#h');
    expect(result.path.value).toBe('/users/1?q=1#h');
    expect({ ...result.route }).toEqual(router.currentRoute.value);
  });

  it('checks the name of useRoute(name), VIBE7113 when it is not matched', async () => {
    const { router } = setup();
    router.push('/users/1').catch(() => {});
    await router.isReady();
    const errors: unknown[] = [];
    const { result } = mountComposable(() => useRoute('user'), { plugins: [router] });
    expect(result.params.id).toBe('1');
    mountComposable(() => useRoute('a'), {
      plugins: [router, handlers((err) => errors.push(err))],
    });
    expect(isVibeError(errors[0], 'VIBE7113')).toBe(true);
    expect(errors[0]).toMatchObject({ args: { name: 'a', path: '/users/1' } });
  });
});

describe('onBeforeRouteLeave and onBeforeRouteUpdate', () => {
  it('warn VIBE7112 outside a RouterView and register nothing', () => {
    const { router } = setup();
    const warns: string[] = [];
    mountComposable(
      () => {
        onBeforeRouteLeave(() => false);
        onBeforeRouteUpdate(() => false);
      },
      {
        plugins: [
          router,
          handlers(
            () => {},
            (msg) => warns.push(msg),
          ),
        ],
      },
    );
    expect(warns.map((msg) => /^\[(VIBE\d+)\]/.exec(msg)?.[1])).toEqual(['VIBE7112', 'VIBE7112']);
    expect(warns[0]).toContain('onBeforeRouteLeave()');
  });

  it('run on update and leave, can block, follow a reused instance and stop on unmount', async () => {
    const leave = vi.fn<NavigationGuard>();
    const update = vi.fn<NavigationGuard>();
    const Guarded = page('guarded', {
      setup: () => {
        onBeforeRouteLeave(leave);
        onBeforeRouteUpdate(update);
      },
    });
    const { router } = setup([
      { path: '/', component: page('home') },
      { path: '/x/:id', component: Guarded },
      { path: '/y', component: Guarded },
    ]);
    const wrapper = mount(RouterView, { plugins: [router] });
    await router.isReady();
    await router.push('/x/1');
    await flushPromises();
    await router.push('/x/2');
    expect(update).toHaveBeenCalledOnce();
    expect(leave).not.toHaveBeenCalled();

    // The instance is reused for /y; its guards follow the record it shows.
    await router.push('/y');
    await flushPromises();
    expect(leave).toHaveBeenCalledOnce();
    leave.mockReturnValueOnce(false);
    expect(await router.push('/')).toMatchObject({ type: 'aborted' });
    expect(leave).toHaveBeenCalledTimes(2);
    expect(router.currentRoute.value.path).toBe('/y');
    await router.push('/y?q');
    expect(update).toHaveBeenCalledTimes(2);

    wrapper.unmount();
    await flushPromises();
    await router.push('/');
    expect(leave).toHaveBeenCalledTimes(2);
  });
});

describe('useLink', () => {
  it('resolves the target, navigates with push or replace and swallows rejections', async () => {
    const { history, router } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = mountComposable(
      () => ({
        push: useLink({ to: '/users/1' }),
        replace: useLink({ to: { name: 'a' }, replace: true }),
      }),
      { plugins: [router] },
    );
    await router.isReady();
    expect(result.push.href.value).toBe('/users/1');
    expect(result.push.route.value.name).toBe('user');
    expect(await result.push.navigate()).toBeUndefined();
    expect(result.push.isExactActive.value).toBe(true);
    expect(await result.push.navigate()).toMatchObject({ type: 'duplicated' });
    const replace = vi.spyOn(history, 'replace');
    await result.replace.navigate();
    expect(replace).toHaveBeenCalledExactlyOnceWith('/a');
    router.beforeEach(() => {
      throw new Error('guard');
    });
    expect(await result.push.navigate()).toBeUndefined();
  });

  it('throws VIBE7114 for an external target', () => {
    const { router } = setup();
    const { result } = mountComposable(() => useLink({ to: 'mailto:a@example.com' }), {
      plugins: [router],
    });
    expect(thrownCode(() => result.href.value)).toBe('VIBE7114');
  });
});
