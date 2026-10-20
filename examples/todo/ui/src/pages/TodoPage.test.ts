import { createMemoryHistory, createRouter } from '@vibejs-org/ui/router';
import { flushPromises, mount } from '@vibejs-org/ui/testing';
import { expect, it } from 'vitest';
import App from '../App.vibe';
import { API, createApi } from '../api.ts';
import { routes } from '../routes.ts';

it('shows the todo of the route, after loading', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes });
  const urls: string[] = [];
  const api = createApi(async (request) => {
    urls.push(new URL(request.url).pathname);
    return Response.json({ id: 'a', title: 'Write', done: false });
  });
  await router.push('/todos/a');
  const wrapper = mount(App, { plugins: [router], provide: { [API]: api } });
  expect(wrapper.find('section h1').exists()).toBe(false);
  expect(wrapper.find('.error').exists()).toBe(false);
  await flushPromises();
  expect(wrapper.get('section h1').text()).toBe('Write');
  expect(urls).toEqual(['/api/todos/a']);
});
