// @vitest-environment jsdom
// A small app of compiled `.vibe` files with the router, a guard, a lazy page and useAsync.
import { compile } from '@vibejs-org/compiler';
import { createMemoryHistory, createRouter, defineRoutes } from '@vibejs-org/ui/router';
import { flushPromises, mount } from '@vibejs-org/ui/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API, api, calls } from '../../test/router/app/api.ts';
import App from '../../test/router/app/App.vibe';
import HomePage from '../../test/router/app/HomePage.vibe';
import LoginPage from '../../test/router/app/LoginPage.vibe';

let loads = 0;
const routes = defineRoutes([
  { path: '/', name: 'home', component: HomePage },
  { path: '/login', name: 'login', component: LoginPage },
  { path: '/admin', name: 'admin', component: HomePage, meta: { auth: true } },
  {
    path: '/users/:id',
    name: 'user',
    component: () => {
      loads++;
      return import('../../test/router/app/UserPage.vibe');
    },
  },
]);

async function setup() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  router.beforeEach((to) => (to.meta.auth ? { name: 'login' } : undefined));
  const wrapper = mount(App, { plugins: [router], provide: { [API]: api } });
  await router.isReady();
  const go = async (to: string) => {
    await router.push(to);
    await flushPromises();
  };
  return { router, wrapper, go };
}

beforeEach(() => {
  calls.length = 0;
  loads = 0;
});

describe('compiled app', () => {
  it('redirects in a guard and navigates through a RouterLink', async () => {
    const { go, router, wrapper } = await setup();
    expect(wrapper.get('h1').text()).toBe('Home');
    await go('/admin');
    expect(router.currentRoute.value.name).toBe('login');
    expect(wrapper.get('h1').text()).toBe('Log in');
    await wrapper.findAll('a')[1].trigger('click');
    // The first visit loads the lazy page through Vite.
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/users/1'));
    expect(calls.map((call) => call.id)).toEqual([1]);
  });

  it('loads the lazy page once, reruns useAsync on a param change and narrows the result', async () => {
    const { go, router, wrapper } = await setup();
    await go('/users/1');
    expect(wrapper.get('.loading').exists()).toBe(true);
    await go('/users/2');
    expect(calls.map((call) => [call.id, call.signal.aborted])).toEqual([
      [1, true],
      [2, false],
    ]);
    calls[1].respond({ ok: true, status: 200, data: { id: 2, name: 'Ada' } });
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('Ada');
    expect(router.currentRoute.value.params).toEqual({ id: '2' });

    await go('/users/3');
    calls[2].respond({ ok: false, status: 404, error: { message: 'No user 3' } });
    await flushPromises();
    expect(wrapper.get('.error').text()).toBe('No user 3');
    expect(wrapper.find('h1').exists()).toBe(false);
    await go('/');
    await go('/users/1');
    expect(loads).toBe(1);
  });

  it('blocks leaving with unsaved text and aborts the pending call on navigation away', async () => {
    const { go, router, wrapper } = await setup();
    await go('/users/4');
    calls[0].respond({ ok: true, status: 200, data: { id: 4, name: 'Grace' } });
    await flushPromises();
    await wrapper.get('input').setValue('draft');
    await go('/');
    expect(router.currentRoute.value.fullPath).toBe('/users/4');
    expect(wrapper.get('h1').text()).toBe('Grace');

    await wrapper.get('input').setValue('');
    await go('/users/5');
    expect(calls[1].signal.aborted).toBe(false);
    await go('/');
    expect(calls[1].signal.aborted).toBe(true);
    expect(wrapper.get('h1').text()).toBe('Home');
  });
});

const codes = (template: string, script = '') =>
  compile(`${script}<template>${template}</template>`, {
    filename: 'Page.vibe',
    id: '00000000',
    dev: false,
  }).diagnostics;
const imported = `<script setup lang="ts">import { RouterLink } from '@vibejs-org/ui/router';</script>`;

describe('router idioms that do not compile', () => {
  it('rejects a kebab-case <router-link> with VIBE2002', () => {
    expect(codes('<router-link to="/">Home</router-link>', imported)).toMatchObject([
      { code: 'VIBE2002' },
    ]);
  });

  it('rejects a RouterLink that is not imported with VIBE2001', () => {
    expect(codes('<RouterLink to="/">Home</RouterLink>')).toMatchObject([{ code: 'VIBE2001' }]);
  });

  it.each(['$route', '$router'])('rejects %s in a template with VIBE2008', (name) => {
    const [d, ...rest] = codes(`<p>{{ ${name}.path }}</p>`);
    expect(rest).toEqual([]);
    expect(d).toMatchObject({ code: 'VIBE2008' });
    expect(d.fixes).toContain(
      'Read the route with `const route = useRoute()` and the router with `useRouter()` in `<script setup lang="ts">`.',
    );
  });

  it('compiles an imported RouterLink', () => {
    expect(codes('<RouterLink to="/">Home</RouterLink>', imported)).toEqual([]);
  });
});
