import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { links, page } from '../../test/router/components.ts';
import { flushPromises, mount } from '../testing/mount.ts';
import { RouterLink, RouterView } from './components.ts';
import { createWebHistory } from './history.ts';
import { createRouter } from './router.ts';
import type { NavigationGuard, Router, RouterHistory } from './types.ts';

const routes = [
  { path: '/', component: page('home') },
  { path: '/a', component: page('a') },
  { path: '/b', component: page('b') },
  { path: '/c', component: page('c') },
];

const start = window.location.href;
const histories: RouterHistory[] = [];
let spacer: HTMLElement;

beforeEach(() => {
  // Room to scroll.
  spacer = document.createElement('div');
  spacer.style.height = '5000px';
  document.body.append(spacer);
});

afterEach(() => {
  for (const history of histories.splice(0)) history.destroy();
  spacer.remove();
  window.scrollTo(0, 0);
  window.history.replaceState(null, '', start);
});

/** Starts a router on a web history under `/app` on the current entry, as a page load does. */
async function load(): Promise<Router> {
  const history = createWebHistory('/app');
  histories.push(history);
  const router = createRouter({ history, routes });
  mount(RouterView, { plugins: [router] });
  await router.isReady();
  await flushPromises();
  return router;
}

/** A router at `/app/`, on a new entry. */
async function setup(): Promise<{ router: Router }> {
  window.history.pushState(null, '', '/app/');
  return { router: await load() };
}

/** Moves the history and resolves once the router settled. */
function move(router: Router, delta: number) {
  return new Promise<string>((resolve) => {
    const stop = router.afterEach((to, _from, failure) => {
      stop();
      resolve(failure ? failure.type : to.fullPath);
    });
    router.go(delta);
  });
}

describe('createWebHistory in a browser', () => {
  it('pushes, replaces and moves through real entries under the base', async () => {
    const { router } = await setup();
    await router.push('/a');
    expect(window.location.pathname).toBe('/app/a');
    await router.push('/b');
    await router.replace('/c?x=1');
    expect(window.location.pathname + window.location.search).toBe('/app/c?x=1');
    expect(router.resolve('/b').href).toBe('/app/b');
    expect(await move(router, -1)).toBe('/a');
    expect(window.location.pathname).toBe('/app/a');
    expect(await move(router, 1)).toBe('/c?x=1');
    expect(await move(router, -2)).toBe('/');
    router.forward();
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/a'));
    router.back();
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/'));
  });

  it('reverts an aborted back navigation without a second navigation', async () => {
    const { router } = await setup();
    await router.push('/a');
    await router.push('/b');
    const guard = vi.fn<NavigationGuard>(() => false);
    router.beforeEach(guard);
    expect(await move(router, -2)).toBe('aborted');
    await vi.waitFor(() => expect(window.location.pathname).toBe('/app/b'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(guard).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.fullPath).toBe('/b');
  });

  it('restores the scroll on back, and after a reload from what pagehide saved', async () => {
    const { router } = await setup();
    window.scrollTo(0, 400);
    await router.push('/a');
    await vi.waitFor(() => expect(window.scrollY).toBe(0));
    window.scrollTo(0, 250);
    expect(await move(router, -1)).toBe('/');
    await vi.waitFor(() => expect(window.scrollY).toBe(400));

    // A reload: pagehide saves the scroll, then a new history and router start on the entry.
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    expect(window.history.state).toMatchObject({ scroll: { left: 0, top: 400 } });
    for (const history of histories.splice(0)) history.destroy();
    window.scrollTo(0, 0);
    await load();
    await vi.waitFor(() => expect(window.scrollY).toBe(400));
  });

  it('leaves modified and middle clicks on a RouterLink to the browser', async () => {
    const { router } = await setup();
    const nav = mount(links(RouterLink, { to: '/a' }), { plugins: [router] });
    const link = nav.get('a').element;
    let prevented: boolean[] = [];
    // Runs after the link's handler, and keeps the browser from opening a tab.
    const record = (e: Event) => {
      prevented.push(e.defaultPrevented);
      e.preventDefault();
    };
    document.addEventListener('click', record);
    document.addEventListener('auxclick', record);
    try {
      await userEvent.click(link, { modifiers: ['ControlOrMeta'] });
      await userEvent.click(link, { modifiers: ['Shift'] });
      await userEvent.click(link, { button: 'middle' });
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/');
      expect(prevented.every((p) => !p)).toBe(true);
      prevented = [];
      await userEvent.click(link);
      await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/a'));
      expect(prevented).toEqual([true]);
    } finally {
      document.removeEventListener('click', record);
      document.removeEventListener('auxclick', record);
    }
  });
});
