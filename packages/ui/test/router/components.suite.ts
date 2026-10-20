// The RouterView and RouterLink scenarios, run on the hand-written components and on their
// compiled template twins (`TemplateRouterView.vibe`, `TemplateRouterLink.vibe`).
import { isVibeError } from '@vibejs-org/errors';
import type { Component } from '@vibejs-org/ui';
import type { ComponentDef } from '@vibejs-org/ui/internal';
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  type RouteRecordRaw,
} from '@vibejs-org/ui/router';
import { flushPromises, mount } from '@vibejs-org/ui/testing';
import { afterEach, expect, test, vi } from 'vitest';
import { defineAbiSuite, type AbiSuite } from '../abi/suite.ts';
import { handlers, links, page } from './components.ts';

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a definition is a component
const asComponent = (def: ComponentDef) => def as Component;

async function setup(root: Component, routes: RouteRecordRaw[], base?: string) {
  const history = createMemoryHistory(base);
  const router = createRouter({ history, routes });
  const errors: unknown[] = [];
  const wrapper = mount(root, {
    plugins: [router, handlers((err) => errors.push(err))],
  });
  await router.isReady();
  await flushPromises();
  const go = async (to: string) => {
    await router.push(to);
    await flushPromises();
  };
  return { history, router, wrapper, errors, go };
}

const html = (wrapper: { html(): string }) => wrapper.html().replaceAll(/\s+/g, '');

export const RouterViewSuite: AbiSuite = defineAbiSuite('RouterView', (load) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders the matched chain, skips component-less records and passes route props', async () => {
    const View = asComponent(await load());
    const Child = page('child', { props: ['id'] });
    const { go, wrapper } = await setup(View, [
      { path: '/', component: page('home') },
      {
        path: '/group',
        children: [
          {
            path: 'p',
            component: page('parent', { nested: View }),
            children: [{ path: ':id', component: Child, props: true }],
          },
        ],
      },
      { path: '/obj', component: Child, props: { id: 'fixed' } },
      { path: '/fn/:n', component: Child, props: (to) => ({ id: `n${String(to.params.n)}` }) },
      { path: '/none', component: Child, props: false },
    ]);
    expect(wrapper.find('.home').exists()).toBe(true);
    await go('/group/p/7');
    expect(html(wrapper)).toBe(
      '<sectionclass="parent"data-props="[]"><sectionclass="child"data-props="[&quot;7&quot;]"></section></section>',
    );
    await go('/obj');
    expect(wrapper.get('.child').attributes('data-props')).toBe('["fixed"]');
    await go('/fn/3');
    expect(wrapper.get('.child').attributes('data-props')).toBe('["n3"]');
    await go('/none');
    expect(wrapper.get('.child').attributes('data-props')).toBe('[null]');
    // A parent without a nested match renders an empty nested view.
    await go('/group/p');
    expect(wrapper.find('.child').exists()).toBe(false);
    expect(wrapper.find('.parent').exists()).toBe(true);
  });

  test('renders nothing when no route matches', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { go, wrapper } = await setup(asComponent(await load()), [
      { path: '/', component: page('home') },
    ]);
    await go('/missing');
    expect(wrapper.find('section').exists()).toBe(false);
  });

  test('keeps the instance of the same component on a param change and updates its props', async () => {
    const setupSpy = vi.fn<() => void>();
    const User = page('user', { props: ['id'], setup: setupSpy });
    const { go, wrapper } = await setup(asComponent(await load()), [
      { path: '/', component: page('home') },
      { path: '/users/:id', component: User, props: true },
    ]);
    await go('/users/1');
    const el = wrapper.get('.user').element;
    await go('/users/2');
    expect(setupSpy).toHaveBeenCalledOnce();
    expect(wrapper.get('.user').element).toBe(el);
    expect(el.getAttribute('data-props')).toBe('["2"]');
  });

  test('never renders the new child in the nested view of a leaving parent', async () => {
    const View = asComponent(await load());
    const childSetups: string[] = [];
    const { go, wrapper } = await setup(View, [
      { path: '/', component: page('home') },
      {
        path: '/a',
        component: page('a', { nested: View }),
        children: [{ path: 'x', component: page('x', { setup: () => childSetups.push('x') }) }],
      },
      {
        path: '/b',
        component: page('b', { nested: View }),
        children: [{ path: 'y', component: page('y', { setup: () => childSetups.push('y') }) }],
      },
    ]);
    await go('/a/x');
    await go('/b/y');
    expect(childSetups).toEqual(['x', 'y']);
    expect(wrapper.find('.b .y').exists()).toBe(true);
    expect(wrapper.find('.a').exists()).toBe(false);
  });
});

/** Clicks `el` and returns whether the router prevented the browser's navigation. */
async function click(el: Element, init: MouseEventInit = {}): Promise<boolean> {
  let prevented = false;
  // Runs after the link's handler, and stops the browser's own navigation.
  const record = (e: Event) => {
    prevented = e.defaultPrevented;
    e.preventDefault();
  };
  document.addEventListener('click', record, { once: true });
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  await flushPromises();
  return prevented;
}

const linkRoutes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: page('home') },
  {
    path: '/users/:id',
    component: page('user', { nested: RouterView }),
    children: [
      { path: '', name: 'user-index', component: page('index') },
      { path: 'posts', name: 'user-posts', component: page('posts') },
    ],
  },
  { path: '/files/:parts+', name: 'files', component: page('files') },
];

export const RouterLinkSuite: AbiSuite = defineAbiSuite('RouterLink', (load) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function mountLinks(list: Record<string, unknown>[], base?: string) {
    const ctx = await setup(RouterView, linkRoutes, base);
    const nav = mount(links(await load(), ...list), { plugins: [ctx.router] });
    await flushPromises();
    const a = (i: number) => nav.findAll('a')[i];
    return { ...ctx, nav, a };
  }

  test('sets href with the base, the active classes and aria-current', async () => {
    const { a, go, nav } = await mountLinks(
      [
        { to: { name: 'user-index', params: { id: 1 } } },
        { to: '/users/1/posts', activeClass: 'on', exactActiveClass: 'here' },
        { to: { name: 'user-posts', params: { id: 2 } }, ariaCurrentValue: 'step' },
        { to: { name: 'files', params: { parts: ['a', 'b'] } } },
      ],
      '/app',
    );
    expect(a(0).attributes('href')).toBe('/app/users/1');
    expect(a(3).attributes('href')).toBe('/app/files/a/b');
    expect(nav.findAll('a.router-link-active')).toHaveLength(0);

    await go('/users/1');
    expect(a(0).classes()).toEqual(['router-link-active', 'router-link-exact-active']);
    expect(a(0).attributes('aria-current')).toBe('page');
    expect(a(1).classes()).toEqual([]);

    // The empty-path child's parent is active while a sibling child is shown.
    await go('/users/1/posts');
    expect(a(0).classes()).toEqual(['router-link-active']);
    expect(a(0).attributes('aria-current')).toBeUndefined();
    expect(a(1).classes()).toEqual(['on', 'here']);
    expect(a(2).classes()).toEqual([]);

    await go('/users/2/posts');
    expect(a(0).classes()).toEqual([]);
    expect(a(2).attributes('aria-current')).toBe('step');

    await go('/files/a/b');
    expect(a(3).classes()).toEqual(['router-link-active', 'router-link-exact-active']);
    await go('/files/a');
    expect(a(3).classes()).toEqual([]);
  });

  test('renders the default slot inside the link', async () => {
    const { a } = await mountLinks([{ to: '/' }, { to: '/users/1' }]);
    expect([a(0).element.textContent, a(1).element.textContent]).toEqual(['0', '1']);
  });

  test('is never active for a target that matches no route', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { a } = await mountLinks([{ to: '/missing' }]);
    expect(a(0).attributes('href')).toBe('/missing');
    expect(a(0).classes()).toEqual([]);
  });

  test('navigates on a plain click, with push or replace', async () => {
    const { a, history, router } = await mountLinks([
      { to: '/users/1' },
      { to: '/users/2', replace: true },
    ]);
    const push = vi.spyOn(history, 'push');
    const replace = vi.spyOn(history, 'replace');
    expect(await click(a(0).element)).toBe(true);
    expect(router.currentRoute.value.fullPath).toBe('/users/1');
    expect(push).toHaveBeenCalledExactlyOnceWith('/users/1');
    expect(await click(a(1).element)).toBe(true);
    expect(replace).toHaveBeenCalledExactlyOnceWith('/users/2');
    expect(push).toHaveBeenCalledOnce();
  });

  test.each<[string, MouseEventInit]>([
    ['meta', { metaKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle', { button: 1 }],
  ])('leaves a %s click to the browser', async (_, init) => {
    const { a, router } = await mountLinks([{ to: '/users/1' }]);
    expect(await click(a(0).element, init)).toBe(false);
    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  test('leaves prevented and target="_blank" clicks to the browser', async () => {
    const { a, router } = await mountLinks([
      { to: '/users/1' },
      { to: '/users/1', target: '_blank' },
    ]);
    expect(a(1).attributes('target')).toBe('_blank');
    expect(await click(a(1).element)).toBe(false);
    // An earlier listener (capturing on the document) prevents the click.
    document.addEventListener('click', (e) => e.preventDefault(), { capture: true, once: true });
    const spy = vi.spyOn(router, 'push');
    a(0).element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(spy).not.toHaveBeenCalled();
    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  test('throws VIBE7114 for an external to', async () => {
    const { router } = await setup(RouterView, linkRoutes);
    const errors: unknown[] = [];
    mount(links(await load(), { to: 'https://example.com' }, { to: '//cdn.example.com/x' }), {
      plugins: [router, handlers((err) => errors.push(err))],
    });
    // The first binding of each link that reads the target reports it.
    expect(errors.filter((err) => isVibeError(err, 'VIBE7114'))).toHaveLength(2);
  });
});
