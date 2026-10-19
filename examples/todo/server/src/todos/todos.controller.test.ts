import { JsonLogger } from '@vibejs-org/server';
import { Test } from '@vibejs-org/server/testing';
import { afterEach, beforeEach, expect, expectTypeOf, it } from 'vitest';
import { createApi, type Api } from '../../../ui/src/api.ts';
import { appOptions } from '../app.module.ts';
import { TodosModule } from './todos.module.ts';
import { TodosService } from './todos.service.ts';

type App = Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;

let app: App;
let api: Api;

beforeEach(async () => {
  app = await Test.createTestingModule({
    imports: [TodosModule],
    ...appOptions,
    logger: new JsonLogger({ level: 'silent' }),
  }).compile();
  api = createApi(app.fetch);
});

afterEach(() => app.close());

it('lists, creates and toggles todos over app.fetch', async () => {
  expect(await api.todos.list()).toMatchObject({ ok: true, data: [] });

  const created = await api.todos.create({ body: { title: 'a' } });
  if (!created.ok) throw new Error(created.error.code);
  expect(created.data).toMatchObject({ title: 'a', done: false });

  const listed = await api.todos.list();
  if (!listed.ok) throw new Error(listed.error.code);
  expectTypeOf(listed.data).toEqualTypeOf<{ id: string; title: string; done: boolean }[]>();
  expect(listed.data).toEqual([created.data]);

  const toggled = await api.todos.toggle({ params: { id: created.data.id } });
  expect(toggled).toMatchObject({ ok: true, data: { id: created.data.id, done: true } });
});

it('resolves a declared error as a problem', async () => {
  const r = await api.todos.toggle({ params: { id: 'missing' } });
  expect(r).toMatchObject({
    ok: false,
    error: { code: 'TODO_NOT_FOUND', status: 404, requestId: expect.any(String) },
  });
  expect(r.response?.headers.get('content-type')).toMatch(/^application\/problem\+json/);
});

it('rejects a blank title without creating a todo', async () => {
  const r = await api.todos.create({ body: { title: '  ' } });
  expect(r).toMatchObject({
    ok: false,
    error: { status: 400, errors: [expect.objectContaining({ pointer: '/title' })] },
  });
  expect(app.get(TodosService).list()).toEqual([]);
});
