// @vitest-environment jsdom
import { JsonLogger, type App } from '@vibejs-org/server';
import { Test } from '@vibejs-org/server/testing';
import type { Component } from '@vibejs-org/ui';
import { flushPromises, mount, type DOMWrapper } from '@vibejs-org/ui/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { appOptions } from '../server/src/app.module.ts';
import { TodosModule } from '../server/src/todos/todos.module.ts';
import { TodosService } from '../server/src/todos/todos.service.ts';
import { API, createApi } from '../ui/src/api.ts';
import TodoList from '../ui/src/TodoList.vibe';
import { TodoList as TodoListTwin } from '../ui/test/TodoList.twin.ts';

const titles = (wrapper: Pick<DOMWrapper, 'findAll'>) =>
  wrapper.findAll('li').map((li) => li.text().trim());

describe.each<[string, Component]>([
  ['twin', TodoListTwin],
  ['compiled', TodoList],
])('TodoList (%s)', (_, C) => {
  let app: App;

  afterEach(() => app.close());

  async function setup() {
    app = await Test.createTestingModule({
      imports: [TodosModule],
      ...appOptions,
      logger: new JsonLogger({ level: 'silent' }),
    }).compile();
    const service = app.get(TodosService);
    const seeded = service.create('seeded');
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an InjectionKey is typed as a Symbol object
    const wrapper = mount(C, { provide: { [API as symbol]: createApi(app.fetch) } });
    await flushPromises();
    return { service, seeded, wrapper };
  }

  it('shows the todos from the server', async () => {
    const { wrapper } = await setup();
    expect(titles(wrapper)).toEqual(['seeded']);
  });

  it('adds a todo and clears the input', async () => {
    const { wrapper, service } = await setup();
    const input = wrapper.get<HTMLInputElement>('input[placeholder]');
    await input.setValue('write tests');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(titles(wrapper)).toEqual(['seeded', 'write tests']);
    expect(input.element.value).toBe('');
    expect(service.list().map((todo) => todo.title)).toEqual(['seeded', 'write tests']);
  });

  it('toggles a todo on the server', async () => {
    const { wrapper } = await setup();
    const box = wrapper.get<HTMLInputElement>('li input');
    await box.setValue(true);
    await flushPromises();
    const listed = await createApi(app.fetch).todos.list();
    expect(listed).toMatchObject({ ok: true, data: [{ title: 'seeded', done: true }] });
  });

  it('shows a declared error', async () => {
    const { wrapper, service, seeded } = await setup();
    service.remove(seeded.id);
    await wrapper.get('li input').setValue(true);
    await flushPromises();
    expect(wrapper.get('.error').text()).toBe('TODO_NOT_FOUND');
    // The failed toggle re-synced the list from the server.
    expect(titles(wrapper)).toEqual([]);
  });

  it('clears a shown error after a later success', async () => {
    const { wrapper, service, seeded } = await setup();
    service.remove(seeded.id);
    await wrapper.get('li input').setValue(true);
    await flushPromises();
    await wrapper.get('input[placeholder]').setValue('again');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('.error').exists()).toBe(false);
    expect(titles(wrapper)).toEqual(['again']);
  });
});
