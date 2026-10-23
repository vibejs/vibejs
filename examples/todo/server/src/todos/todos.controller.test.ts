import { createClient, type Client } from '@usevibejs/contract';
import { JsonLogger } from '@usevibejs/server';
import { Test } from '@usevibejs/server/testing';
import { afterEach, beforeEach, expect, expectTypeOf, it } from 'vitest';
import { todos } from '../../../contracts/src/todos.contract.ts';
import { appOptions } from '../app.module.ts';
import { TodosModule } from './todos.module.ts';
import { TodosService } from './todos.service.ts';

type App = Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;

let app: App;
let api: Client<{ todos: typeof todos }>;

beforeEach(async () => {
  app = await Test.createTestingModule({
    imports: [TodosModule],
    ...appOptions,
    logger: new JsonLogger({ level: 'silent' }),
  }).compile();
  api = createClient({ todos }, { baseUrl: '/api', fetch: app.fetch });
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

it('gets one todo, or TODO_NOT_FOUND', async () => {
  const created = await api.todos.create({ body: { title: 'a' } });
  if (!created.ok) throw new Error(created.error.code);
  expect(await api.todos.get({ params: { id: created.data.id } })).toMatchObject({
    ok: true,
    data: created.data,
  });
  expect(await api.todos.get({ params: { id: 'missing' } })).toMatchObject({
    ok: false,
    error: { code: 'TODO_NOT_FOUND', status: 404 },
  });
});

it('removes a todo with 204', async () => {
  const created = await api.todos.create({ body: { title: 'a' } });
  if (!created.ok) throw new Error(created.error.code);
  const removed = await api.todos.remove({ params: { id: created.data.id } });
  expect(removed).toMatchObject({ ok: true, data: undefined });
  expect(removed.response?.status).toBe(204);
  expect(await api.todos.list()).toMatchObject({ ok: true, data: [] });
});

it('resolves toggle of an unknown id as a problem', async () => {
  const r = await api.todos.toggle({ params: { id: 'missing' } });
  expect(r).toMatchObject({
    ok: false,
    error: { code: 'TODO_NOT_FOUND', status: 404, requestId: expect.any(String) },
  });
  expect(r.response?.headers.get('content-type')).toMatch(/^application\/problem\+json/);
});

it('narrows remove of an unknown id to TODO_NOT_FOUND with status 404', async () => {
  const r = await api.todos.remove({ params: { id: 'missing' } });
  if (r.ok || r.error.code !== 'TODO_NOT_FOUND') throw new Error('expected TODO_NOT_FOUND');
  expectTypeOf(r.error.status).toEqualTypeOf<404>();
  expect(r.error).toEqual({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    code: 'TODO_NOT_FOUND',
    detail: 'No todo missing',
    requestId: expect.any(String),
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
