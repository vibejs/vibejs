// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { defineContract, del, get, post, raw } from '@usevibejs/contract';
import { isVibeError } from '@usevibejs/errors';
import * as v from 'valibot';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inject } from '../di/injector.ts';
import { token } from '../di/token.ts';
import { captureLog, caught } from '../../test/log.ts';
import { JsonLogger, Logger } from '../logger.ts';
import { Controller, Handle, Module, UseFilters, UseGuards } from '../module/decorators.ts';
import type { OnModuleInit } from '../module/lifecycle.ts';
import { inspect, VibeFactory, type Middleware } from './app.ts';
import type { CanActivate, Ctx, ExceptionFilter, Interceptor } from './context.ts';

const srvx = vi.hoisted(() => ({ loaded: vi.fn<() => void>() }));
vi.mock('srvx', () => {
  srvx.loaded();
  return {};
});

const users = defineContract('/users', {
  list: get('/', { response: v.array(v.string()) }),
  one: get('/:id', { response: v.object({ id: v.string() }) }),
  me: get('/me', { response: v.string() }),
  create: post('/', { body: v.unknown(), response: v.unknown(), status: 201 }),
  remove: del('/:id'),
  old: get('/old', { response: raw() }),
});

class Allow implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
class Timing implements Interceptor {
  intercept(_ctx: unknown, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }
}
class Fallback implements ExceptionFilter {
  catch(): undefined {
    return undefined;
  }
}

@Controller(users)
@UseGuards(Allow)
class UsersController {
  readonly log = inject(Logger);
  @Handle(users.list)
  list(): string[] {
    return ['ada'];
  }
  @Handle(users.one)
  one(ctx: Ctx<typeof users.one>): { id: string } {
    return { id: ctx.params.id };
  }
  @Handle(users.me)
  @UseFilters(Fallback)
  me(ctx: Ctx<typeof users.me>): string {
    return ctx.req.headers.get('x-user') ?? 'me';
  }
  @Handle(users.create)
  create(ctx: Ctx<typeof users.create>): unknown {
    return { body: ctx.body ?? null };
  }
  @Handle(users.remove)
  remove(): void {}
  @Handle(users.old)
  old(ctx: Ctx<typeof users.old>): Response {
    ctx.cookies.set('a', '1');
    ctx.cookies.set('b', '2');
    ctx.responseHeaders.set('x-extra', 'yes');
    return Response.redirect('http://localhost/users', 302);
  }
}

const Greeting = token<string>('Greeting');

@Module({ providers: [{ provide: Greeting, useValue: 'hi' }], exports: [Greeting] })
class GreetingModule {}

@Module({ imports: [GreetingModule], controllers: [UsersController] })
class AppModule {}

const capture = () => captureLog('debug');

async function create(middleware: Middleware[] = []) {
  const { lines, logger } = capture();
  const app = await VibeFactory.create(AppModule, { logger, middleware, bodyLimit: 16 });
  return { app, lines };
}

async function problemOf(res: Response) {
  expect(res.headers.get('content-type')).toBe('application/problem+json');
  const body: unknown = await res.json();
  const requestId = res.headers.get('x-request-id');
  expect(body).toMatchObject({ type: 'about:blank', status: res.status, requestId });
  return body;
}

const inspected = (method: string, path: string, handler: string, filters = ['Fallback']) => ({
  method,
  path,
  handler,
  guards: ['Allow', 'Allow'],
  interceptors: ['Timing'],
  filters,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('app.fetch status matrix', () => {
  it('answers routes, 404 and 405 with Allow', async () => {
    const { app } = await create();
    const ok = await app.request('/users/7');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ id: '7' });
    expect(await problemOf(await app.request('/nope'))).toMatchObject({
      code: 'NOT_FOUND',
      title: 'Not Found',
    });
    const res = await app.request('/users/me', { method: 'PUT' });
    expect(res.status).toBe(405);
    // DELETE /users/me reaches DELETE /users/:id.
    expect(res.headers.get('allow')).toBe('GET, HEAD, DELETE, OPTIONS');
    expect(await problemOf(res)).toMatchObject({ code: 'METHOD_NOT_ALLOWED' });
    const remove = await app.request('/users/7', { method: 'DELETE' });
    expect(remove.status).toBe(204);
    expect(await remove.text()).toBe('');
  });

  it('answers HEAD with the GET headers and no body', async () => {
    const { app } = await create();
    const [getRes, head] = await Promise.all([
      app.request('/users'),
      app.request('/users', { method: 'HEAD' }),
    ]);
    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toBe(getRes.headers.get('content-type'));
    expect(await head.text()).toBe('');
    expect(await getRes.json()).toEqual(['ada']);
  });

  it('cancels the GET body for HEAD, even an errored one', async () => {
    const cancel = vi.fn<() => void>();
    const bodies = [
      new ReadableStream({ cancel }),
      new ReadableStream({ start: (controller) => controller.error(new Error('broken')) }),
    ];
    const files = defineContract('/files', { one: get('/one', { response: raw() }) });
    @Controller(files)
    class FilesController {
      @Handle(files.one)
      one(): Response {
        return new Response(bodies.shift());
      }
    }
    @Module({ controllers: [FilesController] })
    class Root {}
    const app = await VibeFactory.create(Root, { logger: capture().logger });
    expect((await app.request('/files/one', { method: 'HEAD' })).status).toBe(200);
    expect(cancel).toHaveBeenCalledOnce();
    expect((await app.request('/files/one', { method: 'HEAD' })).status).toBe(200);
  });

  it('answers OPTIONS without a route with 204 and Allow', async () => {
    const { app } = await create();
    const res = await app.request('/users', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('allow')).toBe('GET, HEAD, POST, OPTIONS');
  });

  it('answers 413 for a declared content-length above the limit', async () => {
    const { app } = await create();
    const res = await app.request('/users', {
      method: 'POST',
      headers: { 'content-length': '17', 'content-type': 'application/json' },
      body: '{"a":"0123456789"}',
    });
    expect(res.status).toBe(413);
    expect(await problemOf(res)).toMatchObject({ code: 'BODY_TOO_LARGE' });
  });

  it('answers 413 for a streamed body past the limit and cancels the stream', async () => {
    const { app } = await create();
    const cancel = vi.fn<() => void>();
    const chunk = new TextEncoder().encode('[1,2,3,4,5,6]');
    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(chunk),
      cancel,
    });
    const init = {
      method: 'POST',
      body,
      duplex: 'half' as const,
      headers: { 'content-type': 'application/json' },
    };
    const res = await app.fetch(new Request('http://localhost/users', init));
    expect(res.status).toBe(413);
    expect(await problemOf(res)).toMatchObject({ code: 'BODY_TOO_LARGE' });
    expect(cancel).toHaveBeenCalled();
  });

  it('answers 415 for a body that is not JSON', async () => {
    const { app } = await create();
    const res = await app.request('/users', { method: 'POST', body: 'a=1' });
    expect(res.status).toBe(415);
    expect(await problemOf(res)).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('answers 400 INVALID_JSON for bad JSON and invalid UTF-8', async () => {
    const { app } = await create();
    const headers = { 'content-type': 'application/json' };
    for (const body of ['{"a":', new Uint8Array([0x22, 0xc3, 0x28, 0x22])]) {
      const res = await app.request('/users', { method: 'POST', headers, body });
      expect(res.status).toBe(400);
      expect(await problemOf(res)).toMatchObject({ code: 'INVALID_JSON', title: 'Bad Request' });
    }
  });

  it('passes an empty body as undefined and JSON as its value', async () => {
    const { app } = await create();
    const empty = await app.request('/users', { method: 'POST' });
    expect(empty.status).toBe(201);
    expect(await empty.json()).toEqual({ body: null });
    const sent = await app.request('/users', { method: 'POST', json: { a: 1 } });
    expect(await sent.json()).toEqual({ body: { a: 1 } });
  });

  it('answers 503 while closing', async () => {
    const { app } = await create();
    await app.close();
    const res = await app.request('/users');
    expect(res.status).toBe(503);
    expect(await problemOf(res)).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});

describe('app.fetch request id and finalize', () => {
  it('echoes a valid x-request-id and replaces an invalid one', async () => {
    const { app, lines } = await create();
    const valid = await app.request('/users', { headers: { 'x-request-id': 'abc.DEF-1_2' } });
    expect(valid.headers.get('x-request-id')).toBe('abc.DEF-1_2');
    expect(lines.at(-1)).toMatchObject({
      level: 'debug',
      msg: 'request',
      requestId: 'abc.DEF-1_2',
      method: 'GET',
      path: '/users',
      status: 200,
    });
    for (const id of ['bad id', 'x'.repeat(129)]) {
      const res = await app.request('/users', { headers: { 'x-request-id': id } });
      expect(res.headers.get('x-request-id')).toMatch(/^[\da-f-]{36}$/);
    }
  });

  it('adds cookies, context headers and the request id to immutable responses', async () => {
    const { app } = await create();
    const res = await app.request('/users/old');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost/users');
    expect(res.headers.getSetCookie()).toEqual([
      'a=1; Path=/; HttpOnly; Secure; SameSite=Lax',
      'b=2; Path=/; HttpOnly; Secure; SameSite=Lax',
    ]);
    expect(res.headers.get('x-extra')).toBe('yes');
    expect(res.headers.get('x-request-id')).not.toBeNull();
  });

  it('runs middleware first-outermost and passes a replacement request on', async () => {
    const order: string[] = [];
    const outer: Middleware = async (req, next) => {
      order.push('outer in');
      const res = await next();
      order.push('outer out');
      return res;
    };
    const inner: Middleware = async (req, next) => {
      order.push('inner in');
      const headers = new Headers(req.headers);
      headers.set('x-user', 'grace');
      const res = await next(new Request(req, { headers }));
      order.push('inner out');
      return res;
    };
    const { app } = await create([outer, inner]);
    const res = await app.request('/users/me');
    expect(await res.json()).toBe('grace');
    expect(order).toEqual(['outer in', 'inner in', 'inner out', 'outer out']);
  });
});

describe('VibeFactory.create', () => {
  it('has no side effects: no listen, timer or signal handler', async () => {
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const interval = vi.spyOn(globalThis, 'setInterval');
    const on = vi.spyOn(process, 'on');
    const once = vi.spyOn(process, 'once');
    const { app } = await create();
    await app.request('/users');
    expect([timeout, interval, on, once].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0, 0]);
    expect(srvx.loaded).not.toHaveBeenCalled();
  });

  it('provides the given logger globally, unless a module provides its own', async () => {
    const own = new JsonLogger({ level: 'silent' });
    class Reader {
      readonly log = inject(Logger);
    }
    @Module({ providers: [{ provide: Logger, useValue: own }, Reader], exports: [Reader] })
    class OwnLoggerModule {}
    @Module({ imports: [OwnLoggerModule], providers: [{ provide: token('x'), useValue: 1 }] })
    class Root {}
    const { logger } = capture();
    const app = await VibeFactory.create(Root, { logger });
    expect(app.get(Logger)).toBe(logger);
    expect(app.get(Reader).log).toBe(own);
  });

  it('resolves tokens from the root scope, then from every module', async () => {
    const { app } = await create();
    expect(app.get(Greeting)).toBe('hi');
    expect(isVibeError(await caught(() => app.get(token('Missing'))), 'VIBE9102')).toBe(true);
  });

  it('accepts a dynamic root module', async () => {
    @Module({})
    class Bare {}
    const app = await VibeFactory.create(
      { module: Bare, imports: [GreetingModule], controllers: [UsersController] },
      { logger: new JsonLogger({ level: 'silent' }) },
    );
    expect(app.get(Greeting)).toBe('hi');
    expect((await app.request('/users')).status).toBe(200);
  });

  it('throws VIBE9104 for a global guard with constructor parameters', async () => {
    class Needy implements CanActivate {
      readonly flag: boolean;
      constructor(flag: boolean) {
        this.flag = flag;
      }
      canActivate(): boolean {
        return this.flag;
      }
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the type test rejects it; this is the runtime check
    const guards = [Needy as unknown as new () => CanActivate];
    await expect(VibeFactory.create(AppModule, { guards })).rejects.toMatchObject({
      code: 'VIBE9104',
    });
  });

  it('rejects with an onModuleInit error unchanged', async () => {
    const failure = new Error('init failed');
    class Broken implements OnModuleInit {
      onModuleInit(): void {
        throw failure;
      }
    }
    @Module({ providers: [Broken] })
    class Root {}
    await expect(VibeFactory.create(Root)).rejects.toBe(failure);
  });

  it.each(['api', '/api/', '/', '//api', '/api//v1'])(
    'throws VIBE9405 for the base path %j before any provider runs',
    async (basePath) => {
      const onModuleInit = vi.fn<() => void>();
      @Module({})
      class Root implements OnModuleInit {
        onModuleInit(): void {
          onModuleInit();
        }
      }
      await expect(VibeFactory.create(Root, { basePath })).rejects.toMatchObject({
        code: 'VIBE9405',
        args: { basePath },
      });
      expect(onModuleInit).not.toHaveBeenCalled();
    },
  );

  it('throws VIBE9401 for two contracts that serve the same route shape', async () => {
    const a = defineContract('/users', { one: get('/:id') });
    const b = defineContract('/users', { byId: get('/:userId'), me: get('/me') });
    @Controller(a)
    class AController {
      @Handle(a.one)
      one(): void {}
    }
    @Controller(b)
    class BController {
      @Handle(b.byId)
      byId(): void {}
      @Handle(b.me)
      me(): void {}
    }
    @Module({ controllers: [AController, BController] })
    class Root {}
    const error = await caught(() => VibeFactory.create(Root));
    expect(isVibeError(error, 'VIBE9401')).toBe(true);
    expect(error).toMatchObject({
      code: 'VIBE9401',
      args: { method: 'GET', path: '/users/:id', handlers: 'AController.one, BController.byId' },
      fixes: [expect.any(String)],
    });

    @Module({ controllers: [BController] })
    class Fine {}
    const app = await VibeFactory.create(Fine, { logger: new JsonLogger({ level: 'silent' }) });
    expect((await app.request('/users/me')).status).toBe(204);
  });

  it('inspects routes with the base path and enhancers in run order, and modules', async () => {
    const options = {
      basePath: '/api',
      guards: [Allow],
      interceptors: [Timing],
      filters: [Fallback],
      logger: new JsonLogger({ level: 'silent' }),
    };
    const app = await VibeFactory.create(AppModule, options);
    expect(inspect(AppModule, options)).toEqual(app.inspect());
    expect(app.inspect()).toEqual({
      routes: [
        inspected('GET', '/api/users', 'UsersController.list'),
        inspected('GET', '/api/users/:id', 'UsersController.one'),
        inspected('GET', '/api/users/me', 'UsersController.me', ['Fallback', 'Fallback']),
        inspected('POST', '/api/users', 'UsersController.create'),
        inspected('DELETE', '/api/users/:id', 'UsersController.remove'),
        inspected('GET', '/api/users/old', 'UsersController.old'),
      ],
      modules: [
        {
          path: 'AppModule > GreetingModule',
          global: false,
          imports: [],
          exports: ['Greeting'],
          providers: ['Greeting'],
        },
        {
          path: 'AppModule',
          global: false,
          imports: ['GreetingModule'],
          exports: [],
          providers: [],
        },
      ],
    });
    expect((await app.request('/api/users')).status).toBe(200);
    // inspect() reports what the app serves, not later changes to the options object.
    const before = app.inspect();
    Object.assign(options, { basePath: '/v2', guards: [] });
    expect(app.inspect()).toEqual(before);
  });

  it('sends JSON through request() and keeps a given content type', async () => {
    const { app } = await create();
    const res = await app.request(new URL('http://localhost/users'), {
      method: 'POST',
      json: [1],
      headers: { 'content-type': 'application/vnd.api+json' },
    });
    expect(await res.json()).toEqual({ body: [1] });
    const plain = await app.request(new Request('http://localhost/users/me'));
    expect(await plain.json()).toBe('me');
  });
});
