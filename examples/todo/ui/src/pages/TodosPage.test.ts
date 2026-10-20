import { createMemoryHistory, createRouter } from '@vibejs-org/ui/router';
import { flushPromises, mount } from '@vibejs-org/ui/testing';
import { expect, it } from 'vitest';
import { API, createApi } from '../api.ts';
import { routes } from '../routes.ts';
import TodosPage from './TodosPage.vibe';

const problem = (status: number, code: string) =>
  Response.json(
    { type: 'about:blank', title: code, status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );

/** The page over an API whose fetch answers each request with `answer(method)`. */
async function render(answer: (method: string) => Response) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  const api = createApi(async (request) => answer(request.method));
  const wrapper = mount(TodosPage, { plugins: [router, (app) => void app.provide(API, api)] });
  await router.isReady();
  await flushPromises();
  return wrapper;
}

it('lists the todos with a link to each and no Remove done button without the flag', async () => {
  const wrapper = await render(() => Response.json([{ id: 'a', title: 'Write', done: true }]));
  expect(wrapper.get('li a').text()).toBe('Write');
  expect(wrapper.get('li a').attributes('href')).toBe('/todos/a');
  expect(wrapper.get<HTMLInputElement>('li input').element.checked).toBe(true);
  expect(wrapper.find('.remove-done').exists()).toBe(false);
});

it('shows the error code of a failed create and keeps the title', async () => {
  const wrapper = await render((method) =>
    method === 'POST' ? problem(400, 'VALIDATION_FAILED') : Response.json([]),
  );
  await wrapper.get('input').setValue(' ');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  expect(wrapper.get('.error').text()).toBe('VALIDATION_FAILED');
  expect(wrapper.get<HTMLInputElement>('input').element.value).toBe(' ');
});

it('shows no list when loading it failed', async () => {
  const wrapper = await render(() => problem(500, 'INTERNAL'));
  expect(wrapper.find('ul').exists()).toBe(false);
});
