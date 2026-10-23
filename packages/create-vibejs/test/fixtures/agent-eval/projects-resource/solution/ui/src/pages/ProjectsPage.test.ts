import { createMemoryHistory, createRouter } from '@usevibejs/ui/router';
import { flushPromises, mount } from '@usevibejs/ui/testing';
import { expect, it } from 'vitest';
import App from '../App.vibe';
import { API, createApi } from '../api.ts';
import { routes } from '../routes.ts';

it('lists the projects at /projects', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push('/projects');
  const api = createApi(async () => Response.json([{ id: '1', name: 'First' }]));
  const wrapper = mount(App, { plugins: [router, (app) => void app.provide(API, api)] });
  await flushPromises();
  expect(wrapper.get('h1').text()).toBe('Projects');
  expect(wrapper.get('li').text()).toBe('First');
});
