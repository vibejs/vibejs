// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { defineContract, get, post, raw } from '@vibejs-org/contract';
import * as v from 'valibot';
import { beforeEach, describe, expect, it } from 'vitest';
import { captureLog } from '../../test/log.ts';
import {
  Controller,
  createMetadata,
  Handle,
  Module,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '../module/decorators.ts';
import { inspect, VibeFactory, type AppOptions, type Middleware } from './app.ts';
import type { CanActivate, Ctx, ExceptionFilter, Interceptor, RequestContext } from './context.ts';
import { HttpError } from './errors.ts';

declare module '../index.ts' {
  interface RequestState {
    role?: string;
  }
}

const order: string[] = [];
beforeEach(() => {
  order.length = 0;
});

type Validate<T> = (
  value: unknown,
) => StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>>;

/** A hand-written Standard Schema, optionally with a JSON Schema converter. */
function stub<T>(
  validate: Validate<T>,
  jsonSchema?: StandardJSONSchemaV1.Converter,
): StandardSchemaV1<unknown, T> {
  const props = { version: 1 as const, vendor: 'test', validate, jsonSchema };
  return { '~standard': props };
}

const pass = <T>(value: T) => ({ value });

async function create(module: new () => object, options: AppOptions = {}) {
  const { lines, logger } = captureLog('warn');
  const app = await VibeFactory.create(module, { logger, ...options });
  return { app, lines };
}

/** A guard, interceptor and filter that records each call under its class name. */
class Recorder implements CanActivate, Interceptor, ExceptionFilter {
  readonly label = this.constructor.name;
  canActivate(): boolean {
    order.push(`guard ${this.label}`);
    return true;
  }
  async intercept(_ctx: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
    order.push(`in ${this.label}`);
    const value = await next();
    order.push(`out ${this.label}`);
    return value;
  }
  catch(): Response | undefined {
    order.push(`filter ${this.label}`);
    return undefined;
  }
}
class Global extends Recorder {}
class OnMethod extends Recorder {}
class OnClass extends Recorder {
  override catch(): Response {
    super.catch();
    return Response.json({ handled: this.label });
  }
}

const middleware: Middleware = async (_req, next) => {
  order.push('middleware in');
  const res = await next();
  order.push('middleware out');
  return res;
};

describe('run order', () => {
  const contract = defineContract('/order', {
    run: post('/', {
      body: stub((value) => {
        order.push('validate');
        return pass(value);
      }),
      response: stub((value) => {
        order.push('response');
        return pass(value);
      }),
    }),
    fail: get('/fail'),
  });

  @Controller(contract)
  @UseGuards(OnClass)
  @UseInterceptors(OnClass)
  @UseFilters(OnClass)
  class OrderController {
    @Handle(contract.run)
    @UseGuards(OnMethod)
    @UseInterceptors(OnMethod)
    run(): string {
      order.push('handler');
      return 'done';
    }
    @Handle(contract.fail)
    @UseFilters(OnMethod)
    fail(): void {
      order.push('handler');
      throw new Error('boom');
    }
  }
  @Module({ controllers: [OrderController] })
  class OrderModule {}

  const options = {
    middleware: [middleware],
    guards: [Global],
    interceptors: [Global],
    filters: [Global],
  };

  it('runs middleware, guards, interceptors, validation, the handler and the response', async () => {
    const { app } = await create(OrderModule, options);
    const res = await app.request('/order', { method: 'POST', json: 1 });
    expect(await res.json()).toBe('done');
    expect(order).toEqual([
      'middleware in',
      'guard Global',
      'guard OnClass',
      'guard OnMethod',
      'in Global',
      'in OnClass',
      'in OnMethod',
      'validate',
      'handler',
      'out OnMethod',
      'out OnClass',
      'out Global',
      'response',
      'middleware out',
    ]);
  });

  it('tries filters method, class, global and stops at the first result', async () => {
    const { app } = await create(OrderModule, options);
    const res = await app.request('/order/fail');
    expect(await res.json()).toEqual({ handled: 'OnClass' });
    expect(order.filter((step) => step.startsWith('filter'))).toEqual([
      'filter OnMethod',
      'filter OnClass',
    ]);
  });

  it('falls through method and class filters to the global filter', async () => {
    const fall = defineContract('/fall', { fail: get('/') });
    class Last extends OnClass {}
    @Controller(fall)
    @UseFilters(Global)
    class FallController {
      @Handle(fall.fail)
      @UseFilters(OnMethod)
      fail(): void {
        throw new Error('boom');
      }
    }
    @Module({ controllers: [FallController] })
    class FallModule {}
    const { app } = await create(FallModule, { filters: [Last] });
    expect(await (await app.request('/fall')).json()).toEqual({ handled: 'Last' });
    expect(order).toEqual(['filter OnMethod', 'filter Global', 'filter Last']);
  });

  it('inspects enhancers in the same run order', async () => {
    const { app } = await create(OrderModule, options);
    expect(inspect(OrderModule, options)).toEqual(app.inspect());
    expect(app.inspect().routes[0]).toMatchObject({
      guards: ['Global', 'OnClass', 'OnMethod'],
      interceptors: ['Global', 'OnClass', 'OnMethod'],
      filters: ['OnClass', 'Global'],
    });
    expect(app.inspect().routes[1]).toMatchObject({ filters: ['OnMethod', 'OnClass', 'Global'] });
  });
});

describe('guards', () => {
  const Roles = createMetadata<string>('roles');
  const contract = defineContract('/admin', {
    panel: post('/', { body: v.unknown(), response: v.string() }),
    other: get('/other', { response: v.string() }),
  });

  class RoleGuard implements CanActivate {
    canActivate(ctx: RequestContext): boolean {
      order.push('RoleGuard');
      const header = ctx.req.headers.get('x-role');
      if (header === null) throw new HttpError(401, 'UNAUTHORIZED');
      ctx.state.role = header;
      return header === ctx.getMetadata(Roles);
    }
  }
  class After implements CanActivate {
    canActivate(): boolean {
      order.push('After');
      return true;
    }
  }

  @Controller(contract)
  @Roles('user')
  @UseGuards(RoleGuard, After)
  class AdminController {
    @Handle(contract.panel)
    @Roles('admin')
    panel(ctx: Ctx<typeof contract.panel>): string {
      order.push('handler');
      return `${ctx.state.role}`;
    }
    @Handle(contract.other)
    other(ctx: Ctx<typeof contract.other>): string {
      return `${ctx.state.role}`;
    }
  }
  @Module({ controllers: [AdminController] })
  class AdminModule {}

  it('answers 403 FORBIDDEN for false and runs no later guard or handler', async () => {
    const { app } = await create(AdminModule);
    const res = await app.request('/admin', { method: 'POST', headers: { 'x-role': 'user' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FORBIDDEN', title: 'Forbidden' });
    expect(order).toEqual(['RoleGuard']);
  });

  it('answers a thrown HttpError', async () => {
    const { app } = await create(AdminModule);
    const res = await app.request('/admin', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('reads method metadata over class metadata and shares state with the handler', async () => {
    const { app } = await create(AdminModule);
    const panel = await app.request('/admin', { method: 'POST', headers: { 'x-role': 'admin' } });
    expect(await panel.json()).toBe('admin');
    expect(order).toEqual(['RoleGuard', 'After', 'handler']);
    const other = await app.request('/admin/other', { headers: { 'x-role': 'user' } });
    expect(await other.json()).toBe('user');
  });

  it('reads the body only after the guards', async () => {
    const { app } = await create(AdminModule, { bodyLimit: 16 });
    const init = { method: 'POST', body: 'not json' };
    const rejected = await app.request('/admin', { ...init, headers: { 'x-role': 'user' } });
    expect(rejected.status).toBe(403);
    const allowed = await app.request('/admin', { ...init, headers: { 'x-role': 'admin' } });
    expect(allowed.status).toBe(415);
    const chunk = new TextEncoder().encode('[1,2,3,4,5,6,7,8,9]');
    const big = (role: string) =>
      app.fetch(
        new Request('http://localhost/admin', {
          method: 'POST',
          duplex: 'half',
          headers: { 'x-role': role, 'content-type': 'application/json' },
          body: new ReadableStream({ pull: (controller) => controller.enqueue(chunk) }),
        }),
      );
    expect((await big('user')).status).toBe(403);
    expect((await big('admin')).status).toBe(413);
  });
});

describe('interceptors', () => {
  const contract = defineContract('/wrap', {
    mapped: get('/mapped', { response: v.unknown() }),
    cached: get('/cached', { response: v.number() }),
    rescued: get('/rescued', { response: v.string() }),
    retried: post('/retried', { body: v.object({ n: v.number() }), response: v.number() }),
  });
  class Envelope implements Interceptor {
    async intercept(_ctx: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
      return { data: await next() };
    }
  }
  class Cache implements Interceptor {
    intercept(): Promise<unknown> {
      return Promise.resolve(42);
    }
  }
  class Rescue implements Interceptor {
    async intercept(_ctx: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
      try {
        return await next();
      } catch {
        return 'rescued';
      }
    }
  }
  class Twice implements Interceptor {
    async intercept(_ctx: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
      await next();
      return next();
    }
  }
  @Controller(contract)
  class WrapController {
    @Handle(contract.mapped)
    @UseInterceptors(Envelope)
    mapped(): number {
      return 1;
    }
    @Handle(contract.cached)
    @UseInterceptors(Cache)
    cached(): number {
      order.push('handler');
      return 1;
    }
    @Handle(contract.rescued)
    @UseInterceptors(Rescue)
    rescued(): string {
      throw new Error('boom');
    }
    @Handle(contract.retried)
    @UseInterceptors(Twice)
    retried(ctx: Ctx<typeof contract.retried>): number {
      order.push('handler');
      return ctx.body.n;
    }
  }
  @Module({ controllers: [WrapController] })
  class WrapModule {}

  it('maps the handler value', async () => {
    const { app } = await create(WrapModule);
    expect(await (await app.request('/wrap/mapped')).json()).toEqual({ data: 1 });
  });

  it('short-circuits without calling next', async () => {
    const { app } = await create(WrapModule);
    expect(await (await app.request('/wrap/cached')).json()).toBe(42);
    expect(order).toEqual([]);
  });

  it('reads and validates the body once when next() runs twice', async () => {
    const { app, lines } = await create(WrapModule);
    const res = await app.request('/wrap/retried', { method: 'POST', json: { n: 7 } });
    expect(await res.json()).toBe(7);
    expect(order).toEqual(['handler', 'handler']);
    expect(lines).toEqual([]);
  });

  it('turns a handler error into a success', async () => {
    const { app, lines } = await create(WrapModule);
    const res = await app.request('/wrap/rescued');
    expect(res.status).toBe(200);
    expect(await res.json()).toBe('rescued');
    expect(lines).toEqual([]);
  });
});

describe('validation', () => {
  const Id = v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number));
  const Body = v.object({ items: v.array(v.object({ name: v.string() })), 'a/b~c': v.string() });
  const asyncQuery = stub(async (value) => {
    await Promise.resolve();
    const { list } = Object(value);
    if (list === 'bad') return { issues: [{ message: 'Bad item', path: ['list', 1] }] };
    return pass({ list: String(list) });
  });
  const tags = (jsonSchema?: StandardJSONSchemaV1.Converter) =>
    stub((value) => pass(Object(value)), jsonSchema);
  const converter: StandardJSONSchemaV1.Converter = {
    input: () => ({
      type: 'object',
      properties: { tags: { type: 'array' }, q: { type: 'string' }, n: true },
    }),
    output: () => ({}),
  };
  const throwing: StandardJSONSchemaV1.Converter = {
    input: () => {
      throw new Error('no conversion');
    },
    output: () => ({}),
  };
  const contract = defineContract('/orgs/:org/items', {
    update: post('/:id', {
      params: v.object({ id: Id }),
      query: asyncQuery,
      headers: v.object({ 'x-tenant': v.string() }),
      body: Body,
      response: v.unknown(),
    }),
    raw: get('/:id/raw', { response: v.unknown() }),
    root: post('/root', {
      body: v.object({}),
      headers: stub(() => ({ issues: [{ message: 'No' }] })),
    }),
    typed: get('/typed', { query: tags(converter), response: v.unknown() }),
    untyped: get('/untyped', { query: tags(), response: v.unknown() }),
    broken: get('/broken', { query: tags(throwing), response: v.unknown() }),
  });

  class SeeIssues implements ExceptionFilter {
    catch(error: unknown): Response | undefined {
      if (error instanceof HttpError && error.code === 'VALIDATION_FAILED') {
        return Response.json({ filtered: error.errors }, { status: 400 });
      }
      return undefined;
    }
  }

  @Controller(contract)
  class ItemsController {
    @Handle(contract.update)
    update(ctx: Ctx<typeof contract.update>): unknown {
      return { params: ctx.params, query: ctx.query, headers: ctx.headers, body: ctx.body };
    }
    @Handle(contract.raw)
    raw(ctx: Ctx<typeof contract.raw>): unknown {
      return { params: ctx.params, parts: ['query', 'headers', 'body'].filter((k) => k in ctx) };
    }
    @Handle(contract.root)
    @UseFilters(SeeIssues)
    root(): void {}
    @Handle(contract.typed)
    typed(ctx: Ctx<typeof contract.typed>): unknown {
      return ctx.query;
    }
    @Handle(contract.untyped)
    untyped(ctx: Ctx<typeof contract.untyped>): unknown {
      return ctx.query;
    }
    @Handle(contract.broken)
    broken(ctx: Ctx<typeof contract.broken>): unknown {
      return ctx.query;
    }
  }
  @Module({ controllers: [ItemsController] })
  class ItemsModule {}

  it('merges the issues of all four parts into one 400 with RFC 6901 pointers', async () => {
    const { app } = await create(ItemsModule);
    const res = await app.request('/orgs/acme/items/x?list=bad', {
      method: 'POST',
      json: { items: [{ name: 1 }], 'a/b~c': 2 },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'VALIDATION_FAILED', title: 'Bad Request' });
    expect(body).toHaveProperty('errors', [
      { in: 'params', pointer: '/id', message: expect.any(String) },
      { in: 'query', pointer: '/list/1', message: 'Bad item' },
      { in: 'headers', pointer: '/x-tenant', message: expect.any(String) },
      { in: 'body', pointer: '/items/0/name', message: expect.any(String) },
      { in: 'body', pointer: '/a~1b~0c', message: expect.any(String) },
    ]);
  });

  it('gives filters the validation error and points at the root with no path', async () => {
    const { app } = await create(ItemsModule);
    const res = await app.request('/orgs/acme/items/root', { method: 'POST', json: 5 });
    expect(await res.json()).toEqual({
      filtered: [
        { in: 'headers', pointer: '', message: 'No' },
        { in: 'body', pointer: '', message: expect.any(String) },
      ],
    });
  });

  it('passes validated outputs, merged over the prefix params, to the handler', async () => {
    const { app } = await create(ItemsModule);
    const res = await app.request('/orgs/acme/items/7?list=a', {
      method: 'POST',
      headers: { 'x-tenant': 't1' },
      json: { items: [{ name: 'n' }], 'a/b~c': 's', extra: true },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      params: { org: 'acme', id: 7 },
      query: { list: 'a' },
      headers: { 'x-tenant': 't1' },
      body: { items: [{ name: 'n' }], 'a/b~c': 's' },
    });
    const plain = await app.request('/orgs/acme/items/7/raw?a=1');
    expect(await plain.json()).toEqual({ params: { org: 'acme', id: '7' }, parts: [] });
  });

  it('makes repeated keys and JSON-Schema array keys arrays', async () => {
    const { app } = await create(ItemsModule);
    const query = '?tags=a&q=x&n=1&n=2';
    expect(await (await app.request(`/orgs/o/items/typed${query}`)).json()).toEqual({
      tags: ['a'],
      q: 'x',
      n: ['1', '2'],
    });
    for (const path of ['untyped', 'broken']) {
      expect(await (await app.request(`/orgs/o/items/${path}${query}`)).json()).toEqual({
        tags: 'a',
        q: 'x',
        n: ['1', '2'],
      });
    }
  });

  it('keeps a `__proto__` query key as an own key', async () => {
    const { app } = await create(ItemsModule);
    const res = await app.request('/orgs/o/items/untyped?__proto__=a&__proto__=b&q=x');
    expect(await res.json()).toEqual({ ['__proto__']: ['a', 'b'], q: 'x' });
  });
});

describe('response building', () => {
  const Count = v.object({ n: v.pipe(v.string(), v.transform(Number)) });
  const contract = defineContract('/out', {
    schema: get('/schema', { response: v.string() }),
    created: post('/created', { response: v.string(), status: 201 }),
    empty: post('/empty'),
    accepted: post('/accepted', { status: 202 }),
    text: get('/text', { response: raw('text/plain') }),
    stream: get('/stream', { response: raw('text/event-stream') }),
    bytes: get('/bytes', { response: raw() }),
    passthrough: get('/passthrough', { response: raw() }),
    bad: get('/bad', { response: raw('text/csv') }),
    count: get('/count', { response: Count }),
    wrong: get('/wrong', { response: Count }),
  });

  @Controller(contract)
  class OutController {
    @Handle(contract.schema)
    schema(): string {
      return 'ok';
    }
    @Handle(contract.created)
    created(): string {
      return 'new';
    }
    @Handle(contract.empty)
    empty(): void {}
    @Handle(contract.accepted)
    accepted(): void {}
    @Handle(contract.text)
    text(): string {
      return 'plain';
    }
    @Handle(contract.stream)
    stream(): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      const chunks = ['a', 'b', 'c'];
      return new ReadableStream({
        pull(controller) {
          const chunk = chunks.shift();
          if (chunk === undefined) controller.close();
          else controller.enqueue(encoder.encode(chunk));
        },
      });
    }
    @Handle(contract.bytes)
    bytes(): Uint8Array {
      return new Uint8Array([1, 2, 3]);
    }
    @Handle(contract.passthrough)
    passthrough(): Response {
      return new Response('gone', { status: 410, headers: { 'x-kept': 'yes' } });
    }
    @Handle(contract.bad)
    bad(ctx: Ctx<typeof contract.bad>): unknown {
      if (ctx.req.headers.has('x-null')) return Object.create(null);
      return ctx.req.headers.has('x-number') ? 5 : { rows: [] };
    }
    @Handle(contract.count)
    count(): { n: string } {
      return { n: '5' };
    }
    // @ts-expect-error -- the handler breaks its contract on purpose
    @Handle(contract.wrong)
    wrong(): unknown {
      return { n: 5 };
    }
  }
  @Module({ controllers: [OutController] })
  class OutModule {}

  it('answers schema routes with 200 or the declared status', async () => {
    const { app } = await create(OutModule);
    const schema = await app.request('/out/schema');
    expect([schema.status, await schema.json()]).toEqual([200, 'ok']);
    const created = await app.request('/out/created', { method: 'POST' });
    expect([created.status, await created.json()]).toEqual([201, 'new']);
  });

  it('answers routes without a response with 204 or the declared status', async () => {
    const { app } = await create(OutModule);
    const empty = await app.request('/out/empty', { method: 'POST' });
    expect([empty.status, await empty.text()]).toEqual([204, '']);
    const accepted = await app.request('/out/accepted', { method: 'POST' });
    expect([accepted.status, await accepted.text()]).toEqual([202, '']);
  });

  it('sends raw strings, streams and bytes with the declared content type', async () => {
    const { app } = await create(OutModule);
    const text = await app.request('/out/text');
    expect(text.headers.get('content-type')).toBe('text/plain');
    expect(await text.text()).toBe('plain');
    const stream = await app.request('/out/stream');
    expect(stream.headers.get('content-type')).toBe('text/event-stream');
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    // oxlint-disable-next-line typescript/no-non-null-assertion -- a stream route has a body
    for await (const chunk of stream.body!) chunks.push(decoder.decode(chunk));
    expect(chunks).toEqual(['a', 'b', 'c']);
    const bytes = await app.request('/out/bytes');
    expect(bytes.headers.get('content-type')).toBe('application/octet-stream');
    expect([...new Uint8Array(await bytes.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('passes a Response through with its status and headers', async () => {
    const { app } = await create(OutModule);
    const res = await app.request('/out/passthrough');
    expect(res.status).toBe(410);
    expect(res.headers.get('x-kept')).toBe('yes');
    expect(await res.text()).toBe('gone');
  });

  it('answers a raw result that is not a body with 500 and logs VIBE9505', async () => {
    const { app, lines } = await create(OutModule);
    const res = await app.request('/out/bad');
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
    await app.request('/out/bad', { headers: { 'x-number': '1' } });
    await app.request('/out/bad', { headers: { 'x-null': '1' } });
    expect(lines).toMatchObject([
      { level: 'error', code: 'VIBE9505', cause: { code: 'VIBE9505' } },
      { level: 'error', code: 'VIBE9505' },
      { level: 'error', code: 'VIBE9505' },
    ]);
    expect(lines[0].msg).toContain('GET /out/bad');
    expect(lines[0].msg).toContain('Object');
    expect(lines[1].msg).toContain('number');
    expect(lines[2].msg).toContain('Object');
  });

  it('keeps the headers and drops the body for HEAD on a raw route', async () => {
    const { app } = await create(OutModule);
    const res = await app.request('/out/text', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(await res.text()).toBe('');
  });

  it('sends the output of the response schema', async () => {
    const { app } = await create(OutModule);
    expect(await (await app.request('/out/count')).json()).toEqual({ n: 5 });
  });

  it('answers a contract violation with a bare 500 and logs VIBE9501 with the issues', async () => {
    const { app, lines } = await create(OutModule, { basePath: '/api' });
    const res = await app.request('/api/out/wrong');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_ERROR',
      requestId: res.headers.get('x-request-id'),
    });
    expect(lines).toMatchObject([{ level: 'error', code: 'VIBE9501' }]);
    expect(lines[0].msg).toContain('GET /api/out/wrong');
    expect(lines[0].msg).toContain('/n: ');
  });

  it('sends the value unvalidated with validateResponses: false', async () => {
    const { app, lines } = await create(OutModule, { validateResponses: false });
    const res = await app.request('/out/wrong');
    expect([res.status, await res.json()]).toEqual([200, { n: 5 }]);
    expect(await (await app.request('/out/count')).json()).toEqual({ n: '5' });
    expect(lines).toEqual([]);
  });
});

describe('errors and filters', () => {
  const contract = defineContract('/err', {
    fail: get('/fail', { errors: { DECLARED: 409 } }),
  });

  /** Picks its behavior from the `x-mode` header. */
  class ModeFilter implements ExceptionFilter {
    async catch(error: unknown, ctx: RequestContext): Promise<Response | HttpError | undefined> {
      const mode = ctx.req.headers.get('x-mode');
      if (mode === 'response') {
        return Response.json({ route: ctx.route.path, role: ctx.state.role }, { status: 418 });
      }
      if (mode === 'http') return new HttpError(422, 'DECLARED', 'Mapped.', { cause: error });
      if (mode === 'throw') throw new Error('filter failed');
      if (mode === 'throw-http') throw new HttpError(409, 'UNKNOWN');
      return undefined;
    }
  }
  class SetRole implements CanActivate {
    canActivate(ctx: RequestContext): boolean {
      ctx.state.role = 'tester';
      return true;
    }
  }

  @Controller(contract)
  @UseGuards(SetRole)
  class ErrController {
    @Handle(contract.fail)
    fail(ctx: Ctx<typeof contract.fail>): void {
      const code = ctx.req.headers.get('x-code');
      if (code === 'DECLARED') ctx.fail('DECLARED');
      if (code) throw new HttpError(Number(ctx.req.headers.get('x-status') ?? 409), code);
      throw new Error('secret detail', { cause: new Error('secret cause') });
    }
  }
  @Module({ controllers: [ErrController] })
  class ErrModule {}

  const send = async (headers: Record<string, string>) => {
    const { app, lines } = await create(ErrModule, { filters: [ModeFilter] });
    return { res: await app.request('/err/fail', { headers }), lines };
  };

  it('uses a Response from a filter that sees the same context', async () => {
    const { res } = await send({ 'x-mode': 'response' });
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ route: '/err/fail', role: 'tester' });
  });

  it('renders an HttpError from a filter as a problem', async () => {
    const { res, lines } = await send({ 'x-mode': 'http', 'x-request-id': 'r9' });
    expect(res.status).toBe(422);
    expect(res.headers.get('x-request-id')).toBe('r9');
    expect(await res.json()).toEqual({
      type: 'about:blank',
      title: 'Unprocessable Content',
      status: 422,
      code: 'DECLARED',
      detail: 'Mapped.',
      requestId: 'r9',
    });
    expect(lines).toEqual([]);
  });

  it('answers a throwing filter with a logged 500', async () => {
    const { res, lines } = await send({ 'x-mode': 'throw' });
    expect(res.status).toBe(500);
    expect(lines).toMatchObject([{ code: 'VIBE9503', cause: { message: 'filter failed' } }]);
  });

  it('warns with VIBE9502 when a filter throws an undeclared HttpError code', async () => {
    const { res, lines } = await send({ 'x-mode': 'throw-http' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'UNKNOWN' });
    expect(lines).toEqual([expect.objectContaining({ level: 'warn', code: 'VIBE9502' })]);
  });

  it('never leaks the detail or cause of a 500 and logs VIBE9503 with the cause', async () => {
    const { res, lines } = await send({});
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('secret');
    expect(JSON.parse(text)).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(lines).toMatchObject([
      {
        level: 'error',
        code: 'VIBE9503',
        cause: { message: 'secret detail', cause: { message: 'secret cause' } },
      },
    ]);
  });

  it('warns with VIBE9502 for an undeclared code and still answers it', async () => {
    const { res, lines } = await send({ 'x-code': 'UNKNOWN' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'UNKNOWN' });
    expect(lines).toEqual([
      expect.objectContaining({ level: 'warn', code: 'VIBE9502', requestId: expect.any(String) }),
    ]);
    expect(lines[0].msg).toContain('GET /err/fail');
    expect(lines[0].msg).toContain('UNKNOWN');
  });

  it('logs only VIBE9503 for an undeclared code with a status outside 400-599', async () => {
    const { res, lines } = await send({ 'x-code': 'UNKNOWN', 'x-status': '600' });
    expect(res.status).toBe(500);
    expect(lines).toMatchObject([{ level: 'error', code: 'VIBE9503' }]);
    expect(lines).toHaveLength(1);
  });

  it.each(['DECLARED', 'FORBIDDEN'])('logs nothing for the code %s', async (code) => {
    const { res, lines } = await send({ 'x-code': code });
    expect(res.status).toBe(409);
    expect(lines).toEqual([]);
  });
});
