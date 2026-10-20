import { createMemoryHistory, createRouter } from '@vibejs-org/ui/router';
import { flushPromises, mount } from '@vibejs-org/ui/testing';
import { expect, it } from 'vitest';
import App from '../App.vibe';
import { API, createApi } from '../api.ts';
import { routes } from '../routes.ts';

/** The app at `/` with an API whose fetch answers `response`. */
async function render(response: Response) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  const api = createApi(async () => response);
  const wrapper = mount(App, { plugins: [router, (app) => void app.provide(API, api)] });
  await router.isReady();
  await flushPromises();
  return wrapper;
}

it('shows the API status on the home page', async () => {
  const wrapper = await render(Response.json({ status: 'ok' }));
  expect(wrapper.get('h1').text()).toBe('vibe.js');
  expect(wrapper.get('.status').text()).toBe('ok');
});

it('shows the error code when the API fails', async () => {
  const wrapper = await render(new Response('down', { status: 503 }));
  expect(wrapper.get('.status').text()).toBe('UNEXPECTED_RESPONSE');
});
