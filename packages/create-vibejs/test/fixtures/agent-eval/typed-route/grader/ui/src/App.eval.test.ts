import { createMemoryHistory, createRouter } from '@usevibejs/ui/router';
import { flushPromises, mount } from '@usevibejs/ui/testing';
import { expect, it } from 'vitest';
import App from './App.vibe';
import { API, createApi } from './api.ts';
import { routes } from './routes.ts';

it('navigates to /about from the link in the app', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push('/');
  const api = createApi(async () => Response.json({ status: 'ok' }));
  const wrapper = mount(App, { plugins: [router, (app) => void app.provide(API, api)] });
  await wrapper.get('a[href="/about"]').trigger('click');
  await flushPromises();
  expect(router.currentRoute.value.path).toBe('/about');
});
