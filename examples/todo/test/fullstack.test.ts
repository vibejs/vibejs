// @vitest-environment jsdom
import { JsonLogger, type App as Server } from '@vibejs-org/server';
import { Test } from '@vibejs-org/server/testing';
import { createMemoryHistory, createRouter } from '@vibejs-org/ui/router';
import { flushPromises, mount, type DOMWrapper } from '@vibejs-org/ui/testing';
import { flagsPlugin } from 'todo-flags/ui';
import { afterEach, expect, it } from 'vitest';
import { AppModule, appOptions } from '../server/src/app.module.ts';
import { TodosService } from '../server/src/todos/todos.service.ts';
import App from '../ui/src/App.vibe';
import { API, createApi } from '../ui/src/api.ts';
import { routes } from '../ui/src/routes.ts';

const titles = (wrapper: Pick<DOMWrapper, 'findAll'>) =>
  wrapper.findAll('li').map((li) => li.text().trim());

let app: Server;
afterEach(() => app.close());

/** The real App at `path`, with memory history, over the real server through `app.fetch`. */
async function setup(path = '/') {
  app = await Test.createTestingModule({
    imports: [AppModule],
    ...appOptions,
    logger: new JsonLogger({ level: 'silent' }),
  }).compile();
  const service = app.get(TodosService);
  const seeded = service.create('seeded');
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(path);
  const wrapper = mount(App, {
    plugins: [
      router,
      flagsPlugin({ fetch: app.fetch }),
      (ui) => void ui.provide(API, createApi(app.fetch)),
    ],
  });
  await flushPromises();
  return { service, seeded, router, wrapper };
}

it('lists, creates and toggles todos on the server', async () => {
  const { wrapper, service } = await setup();
  expect(titles(wrapper)).toEqual(['seeded']);

  const input = wrapper.get<HTMLInputElement>('input[placeholder]');
  await input.setValue('write tests');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  expect(titles(wrapper)).toEqual(['seeded', 'write tests']);
  expect(input.element.value).toBe('');

  await wrapper.get('li input').setValue(true);
  await flushPromises();
  expect(service.list().map((todo) => todo.done)).toEqual([true, false]);
  expect(wrapper.get<HTMLInputElement>('li input').element.checked).toBe(true);
});

it('removes the done todos with the flagged button', async () => {
  const { wrapper, service } = await setup();
  service.create('open');
  await wrapper.get('li input').setValue(true);
  await flushPromises();
  await wrapper.get('.remove-done').trigger('click');
  await flushPromises();
  expect(titles(wrapper)).toEqual(['open']);
});

it('navigates to the item page through its link', async () => {
  const { wrapper, router, seeded } = await setup();
  await wrapper.get('li a').trigger('click');
  await flushPromises();
  expect(router.currentRoute.value.fullPath).toBe(`/todos/${seeded.id}`);
  expect(wrapper.get('main h1').text()).toBe('seeded');
});

it('shows TODO_NOT_FOUND for an unknown item', async () => {
  const { wrapper } = await setup('/todos/missing');
  expect(wrapper.get('.error').text()).toBe('TODO_NOT_FOUND');
});
