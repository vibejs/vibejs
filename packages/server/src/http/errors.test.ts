// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { defineContract, get, raw } from '@vibejs-org/contract';
import { describe, expect, it } from 'vitest';
import { captureLog } from '../../test/log.ts';
import { Controller, createMetadata, Handle, Module } from '../module/decorators.ts';
import { VibeFactory, type Middleware } from './app.ts';
import type { Ctx } from './context.ts';
import { HttpError, problem } from './errors.ts';

const Role = createMetadata<string>('role');

const items = defineContract('/items', {
  one: get('/:id', { errors: { ITEM_NOT_FOUND: 404, ITEM_GONE: 410 } }),
  invalid: get('/invalid'),
  crash: get('/crash'),
  info: get('/info', { response: raw() }),
});

@Controller(items)
class ItemsController {
  @Handle(items.one)
  one(ctx: Ctx<typeof items.one>): void {
    if (ctx.params.id === 'gone') ctx.fail('ITEM_GONE', 'It was removed.');
    ctx.fail('ITEM_NOT_FOUND');
  }
  @Handle(items.invalid)
  invalid(): void {
    throw new HttpError(422, 'INVALID', 'Two fields are wrong.', {
      headers: { 'retry-after': '5' },
      errors: [{ in: 'body', pointer: '/name', message: 'Required' }],
    });
  }
  @Handle(items.crash)
  crash(): void {
    throw new Error('database down', { cause: new TypeError('socket closed') });
  }
  @Handle(items.info)
  @Role('admin')
  info(ctx: Ctx<typeof items.info>): Response {
    return Response.json({
      role: ctx.getMetadata(Role),
      ip: ctx.ip ?? null,
      log: typeof ctx.log.info,
    });
  }
}

@Module({ controllers: [ItemsController] })
class AppModule {}

const boom: Middleware = () => Promise.reject(new Error('middleware failed'));

async function create(middleware: Middleware[] = []) {
  const { lines, logger } = captureLog();
  const app = await VibeFactory.create(AppModule, { logger, middleware });
  return { app, lines };
}

describe('HttpError', () => {
  it('keeps its fields and uses the detail, else the code, as the message', () => {
    const cause = new Error('inner');
    const error = new HttpError(409, 'TAKEN', 'The name is taken.', { cause });
    expect(error).toMatchObject({ name: 'HttpError', status: 409, code: 'TAKEN', cause });
    expect(error.message).toBe('The name is taken.');
    expect(new HttpError(400, 'BAD_REQUEST').message).toBe('BAD_REQUEST');
  });

  it('renders a problem with errors and headers, and "Error" for an unlisted status', async () => {
    const { app } = await create();
    const res = await app.request('/items/invalid');
    expect(res.status).toBe(422);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(await res.json()).toEqual({
      type: 'about:blank',
      title: 'Unprocessable Content',
      status: 422,
      code: 'INVALID',
      detail: 'Two fields are wrong.',
      errors: [{ in: 'body', pointer: '/name', message: 'Required' }],
      requestId: res.headers.get('x-request-id'),
    });
    const teapot = problem(new HttpError(418, 'TEAPOT'), 'id');
    expect(await teapot.json()).toEqual({
      type: 'about:blank',
      title: 'Error',
      status: 418,
      code: 'TEAPOT',
      requestId: 'id',
    });
  });

  it('answers ctx.fail() with the declared status of the code', async () => {
    const { app } = await create();
    const missing = await app.request('/items/7');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'ITEM_NOT_FOUND' });
    const gone = await app.request('/items/gone');
    expect(gone.status).toBe(410);
    expect(await gone.json()).toMatchObject({ code: 'ITEM_GONE', detail: 'It was removed.' });
  });

  it('hides an unexpected error behind a 500 and logs VIBE9503 with the cause', async () => {
    const { app, lines } = await create();
    const res = await app.request('/items/crash', { headers: { 'x-request-id': 'r1' } });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_ERROR',
      requestId: 'r1',
    });
    const [entry] = lines;
    expect(entry).toMatchObject({
      level: 'error',
      code: 'VIBE9503',
      requestId: 'r1',
      cause: {
        name: 'Error',
        message: 'database down',
        cause: { name: 'TypeError', message: 'socket closed' },
      },
    });
    expect(entry.msg).toContain('[VIBE9503]');
  });

  it.each([204, 0, 999, Number.NaN, 400.5])(
    'answers an HttpError with status %s as a logged 500',
    async (status) => {
      const { app, lines } = await create([() => Promise.reject(new HttpError(status, 'X'))]);
      const res = await app.request('/items/7');
      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(lines[0]).toMatchObject({ code: 'VIBE9503', cause: { name: 'HttpError' } });
    },
  );

  it('answers a middleware throw with the same 500', async () => {
    const { app, lines } = await create([boom]);
    const res = await app.request('/items/7');
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(lines[0]).toMatchObject({ code: 'VIBE9503', cause: { message: 'middleware failed' } });
  });

  it('gives the context metadata, the adapter ip and the request logger', async () => {
    const { app } = await create();
    expect(await (await app.request('/items/info')).json()).toEqual({
      role: 'admin',
      ip: null,
      log: 'function',
    });
    const req = Object.assign(new Request('http://localhost/items/info'), { ip: '10.0.0.1' });
    expect(await (await app.fetch(req)).json()).toMatchObject({ ip: '10.0.0.1' });
  });
});
