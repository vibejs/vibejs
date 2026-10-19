import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { warnedCodes } from '../../test/codes.ts';
import { handlers, page } from '../../test/router/components.ts';
import { flushPromises, mount } from '../testing/mount.ts';
import { RouterView } from './components.ts';
import { createMemoryHistory, createWebHistory } from './history.ts';
import { createRouter } from './router.ts';
import type { Router, RouterHistory, RouterOptions, RouterScrollBehavior } from './types.ts';

const routes = [
  { path: '/', component: page('home') },
  { path: '/a', component: page('a') },
  { path: '/b', component: page('b') },
];

let scrollTo: Mock<(options: ScrollToOptions) => void>;
let scrollIntoView: Mock<(options?: ScrollIntoViewOptions) => void>;
let scrollY = 0;
const histories: RouterHistory[] = [];

beforeEach(() => {
  // A new last entry, as on a page load.
  window.history.pushState(null, '', '/');
  Reflect.deleteProperty(window.history, 'scrollRestoration');
  scrollY = 0;
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
  scrollTo = vi.fn<(options: ScrollToOptions) => void>();
  vi.stubGlobal('scrollTo', scrollTo);
  scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  for (const history of histories.splice(0)) history.destroy();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** Mounts a RouterView with a router on a web history, after its first navigation and scroll. */
async function setup(
  options: Partial<RouterOptions> = {},
  warnHandler?: (msg: string) => void,
): Promise<Router> {
  const history = createWebHistory();
  histories.push(history);
  const router = createRouter({ history, routes, ...options });
  mount(RouterView, { plugins: [handlers(() => {}, warnHandler), router] });
  await router.isReady();
  await flushPromises();
  return router;
}

/** Navigates, then waits for the scroll. */
async function go(router: Router, to: string) {
  await router.push(to);
  await flushPromises();
}

/** Moves the history, then waits for the navigation and the scroll. */
async function move(router: Router, delta: number) {
  const settled = new Promise<void>((resolve) => {
    const stop = router.afterEach(() => {
      stop();
      resolve();
    });
  });
  router.go(delta);
  await settled;
  await flushPromises();
}

describe('the default scroll behavior', () => {
  it('scrolls to the top, keeps the position on a query change and restores on back', async () => {
    const router = await setup();
    expect(window.history.scrollRestoration).toBe('manual');
    expect(scrollTo).not.toHaveBeenCalled();
    scrollY = 300;
    await go(router, '/a');
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0 });
    scrollY = 40;
    await go(router, '/a?page=2');
    expect(scrollTo).toHaveBeenCalledOnce();
    await move(router, -1);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 40 });
    await move(router, -1);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 300 });
  });

  it('scrolls the hash element into view, and warns VIBE7116 when it is missing', async () => {
    const warnHandler = vi.fn<(msg: string) => void>();
    const router = await setup({}, warnHandler);
    const target = document.createElement('h2');
    target.id = 'part 2';
    document.body.append(target);
    await go(router, '/a#part%202');
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: undefined });
    expect(scrollIntoView.mock.contexts[0]).toBe(target);
    await go(router, '/b#missing');
    expect(warnedCodes(warnHandler)).toEqual(['VIBE7116']);
  });

  it('restores the scroll that pagehide saved in the entry, after a reload', async () => {
    window.history.replaceState({ position: 0, scroll: { left: 0, top: 120 } }, '');
    await setup();
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 0, top: 120 });
  });
});

describe('scrollBehavior', () => {
  it('replaces the default, sync or async, and does nothing for false', async () => {
    const target = document.createElement('p');
    target.className = 'target';
    document.body.append(target);
    const scrollBehavior = vi
      .fn<RouterScrollBehavior>()
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ top: 5, behavior: 'smooth' })
      .mockResolvedValueOnce({ el: '.target' })
      .mockReturnValueOnce({ el: target, behavior: 'instant' })
      .mockReturnValueOnce(false);
    const router = await setup({ scrollBehavior });
    expect(scrollBehavior).toHaveBeenLastCalledWith(
      router.currentRoute.value,
      expect.objectContaining({ fullPath: '/' }),
      null,
    );
    await go(router, '/a');
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 5, behavior: 'smooth' });
    await go(router, '/b');
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: undefined });
    await go(router, '/a');
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'instant' });
    await go(router, '/b');
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('logs an error that the function throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = new Error('scroll');
    await setup({
      scrollBehavior: async () => {
        throw cause;
      },
    });
    expect(error).toHaveBeenCalledExactlyOnceWith(cause);
  });

  it('leaves scrolling and scrollRestoration to the browser with false', async () => {
    const router = await setup({ scrollBehavior: false });
    await go(router, '/a');
    expect(scrollTo).not.toHaveBeenCalled();
    expect('scrollRestoration' in window.history).toBe(false);
  });

  it('never scrolls with a memory history', async () => {
    const scrollBehavior = vi.fn<RouterScrollBehavior>(() => ({ top: 1 }));
    const router = createRouter({ history: createMemoryHistory(), routes, scrollBehavior });
    mount(RouterView, { plugins: [router] });
    await router.isReady();
    await go(router, '/a');
    expect(scrollBehavior).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
