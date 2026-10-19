import { validate } from '@scalar/openapi-parser';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { defineContract, del, get, post, put, raw } from '@vibejs-org/contract';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import * as arktype from '../test/openapi/arktype.ts';
import * as valibot from '../test/openapi/valibot.ts';
import * as zod from '../test/openapi/zod.ts';
import { caught } from '../test/log.ts';
import type { Middleware } from './http/app.ts';
import type { Ctx } from './http/context.ts';
import { Controller, Handle } from './module/decorators.ts';
import { generateOpenApi, type OpenApiOptions } from './openapi.ts';
import { Test } from './testing.ts';

type Json = Record<string, unknown>;
const info = { title: 'API', version: '1.0.0' };

/** A Standard schema whose converter returns `input` and `output` as given. */
const fake = (input: Json, output: Json = input): StandardSchemaV1 & StandardJSONSchemaV1 => ({
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => ({ value }),
    jsonSchema: { input: () => input, output: () => output },
  },
});

/** A Standard schema without a JSON Schema converter. */
const bare: StandardSchemaV1 = {
  '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) },
};

const op = (doc: { paths: Record<string, Json> }, path: string, method: string): Json =>
  Object(doc.paths[path]?.[method]);

describe('generateOpenApi: vendor matrix', () => {
  it.each([
    ['zod', zod],
    ['valibot', valibot],
    ['arktype', arktype],
  ])('%s fixture is a valid OpenAPI 3.1 document', async (name, fixture) => {
    const doc = generateOpenApi(fixture.contracts, {
      info,
      servers: [{ url: '/api' }],
      ...(fixture.libraryOptions && { libraryOptions: fixture.libraryOptions }),
    });
    const result = await validate(JSON.parse(JSON.stringify(doc)));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    await expect(`${JSON.stringify(doc, null, 2)}\n`).toMatchFileSnapshot(
      `../test/openapi/${name}.json`,
    );
  });
});

describe('generateOpenApi: mapping', () => {
  const users = defineContract('/users', {
    findOne: get('/:id', { response: fake({ type: 'object' }) }),
  });

  it('maps a single contract, a record and a nested record', () => {
    expect(generateOpenApi(users, { info }).paths['/users/{id}']?.get).toMatchObject({
      operationId: 'findOne',
    });
    expect(op(generateOpenApi(users, { info }), '/users/{id}', 'get')).not.toHaveProperty('tags');
    expect(op(generateOpenApi({ users }, { info }), '/users/{id}', 'get')).toMatchObject({
      operationId: 'users.findOne',
      tags: ['users'],
    });
    expect(op(generateOpenApi({ admin: { users } }, { info }), '/users/{id}', 'get')).toMatchObject(
      { operationId: 'admin.users.findOne', tags: ['admin'] },
    );
  });

  it('writes the document header and skips non-route values', () => {
    const servers = [{ url: '/api', description: 'API' }];
    const doc = generateOpenApi(
      { users, n: 1, s: 'x', none: null, empty: {} },
      { info: { ...info, description: 'All' }, servers },
    );
    expect(doc).toEqual({
      openapi: '3.1.1',
      info: { ...info, description: 'All' },
      servers,
      paths: { '/users/{id}': { get: expect.any(Object) } },
      components: { schemas: {} },
    });
    expect(doc.servers).not.toBe(servers);
    expect(generateOpenApi(users, { info })).not.toHaveProperty('servers');
  });

  it('maps path params with and without a params schema', () => {
    const c = defineContract('/orgs/:org/users', {
      a: get('/:id', { params: z.object({ org: z.string(), id: z.uuid() }) }),
      b: put('/:id'),
    });
    const doc = generateOpenApi(c, { info });
    expect(op(doc, '/orgs/{org}/users/{id}', 'get')).toMatchObject({
      parameters: [
        { name: 'org', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
    });
    expect(op(doc, '/orgs/{org}/users/{id}', 'put')).toMatchObject({
      parameters: [
        { name: 'org', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
    });
    // A params schema without a property for a param falls back to a string.
    const sparse = defineContract('/x', {
      a: get('/:id', { params: z.object({ id: z.string() }) }),
    });
    const fallback = generateOpenApi(sparse, {
      info,
      libraryOptions: { override: (ctx: { jsonSchema: Json }) => delete ctx.jsonSchema.properties },
    });
    expect(op(fallback, '/x/{id}', 'get')).toMatchObject({
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    });
  });

  it('maps query and header parameters with required from the schema', () => {
    const c = defineContract('/s', {
      search: get('/', {
        query: z.object({ q: z.string(), page: z.string().optional() }),
        headers: fake({ type: 'object', properties: { 'x-tenant': { type: 'string' } } }),
      }),
    });
    expect(op(generateOpenApi(c, { info }), '/s', 'get')).toMatchObject({
      parameters: [
        { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'page', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'x-tenant', in: 'header', required: false, schema: { type: 'string' } },
      ],
    });
    // A schema without properties gives no parameters.
    const empty = defineContract('/e', { a: get('/', { query: fake({ type: 'object' }) }) });
    expect(op(generateOpenApi(empty, { info }), '/e', 'get')).not.toHaveProperty('parameters');
  });

  it('maps the request body, success responses, summary and description', () => {
    const c = defineContract('/u', {
      create: post('/', {
        body: z.object({ name: z.string() }),
        response: z.object({ id: z.string() }),
        status: 201,
        summary: 'Create',
        description: 'Creates one.',
      }),
      file: get('/file', { response: raw('text/csv') }),
      octet: get('/octet', { response: raw() }),
      remove: del('/'),
    });
    const doc = generateOpenApi(c, { info });
    expect(op(doc, '/u', 'post')).toEqual({
      operationId: 'create',
      summary: 'Create',
      description: 'Creates one.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          },
        },
      },
      responses: {
        201: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
                additionalProperties: false,
              },
            },
          },
        },
        400: expect.any(Object),
      },
    });
    expect(op(doc, '/u/file', 'get')).toEqual({
      operationId: 'file',
      responses: { 200: { description: 'OK', content: { 'text/csv': {} } } },
    });
    expect(op(doc, '/u/octet', 'get')).toMatchObject({
      responses: { 200: { content: { 'application/octet-stream': {} } } },
    });
    expect(op(doc, '/u', 'delete')).toEqual({
      operationId: 'remove',
      responses: { 204: { description: 'No Content' } },
    });
  });

  it('groups declared errors by status and adds VALIDATION_FAILED for routes with input', () => {
    const c = defineContract('/e', {
      plain: get('/', { errors: { NOT_MINE: 403, GONE: 404, MISSING: 404 } }),
      input: post('/', { body: fake({}), errors: { BAD_NAME: 400, GONE: 404 } }),
      query: get('/q', { query: fake({}) }),
      headers: get('/h', { headers: fake({}) }),
      params: get('/:id', { params: z.object({ id: z.string() }) }),
    });
    const doc = generateOpenApi(c, { info });
    const plain = op(doc, '/e', 'get');
    expect(Object.keys(Object(plain.responses))).toEqual(['204', '403', '404']);
    expect(plain).toMatchObject({
      responses: {
        404: {
          description: 'GONE, MISSING',
          content: {
            'application/problem+json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'integer', const: 404 },
                  code: { type: 'string', enum: ['GONE', 'MISSING'] },
                },
                required: ['type', 'title', 'status', 'code'],
              },
            },
          },
        },
      },
    });
    const codes = (path: string, method: string, status: number) =>
      JSON.stringify(op(doc, path, method)).match(
        new RegExp(`"const":${status}},"code":\\{"type":"string","enum":(\\[[^\\]]*\\])`),
      )?.[1];
    expect(codes('/e', 'post', 400)).toBe('["VALIDATION_FAILED","BAD_NAME"]');
    expect(codes('/e/q', 'get', 400)).toBe('["VALIDATION_FAILED"]');
    expect(codes('/e/h', 'get', 400)).toBe('["VALIDATION_FAILED"]');
    expect(codes('/e/{id}', 'get', 400)).toBe('["VALIDATION_FAILED"]');
    expect(codes('/e', 'get', 400)).toBeUndefined();
  });

  it('drops $schema, returns plain JSON and leaves the input unchanged', () => {
    const json = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string' };
    const c = defineContract('/p', { a: get('/', { response: fake(json) }) });
    const before = structuredClone(json);
    const doc = generateOpenApi(c, { info });
    expect(op(doc, '/p', 'get')).toMatchObject({
      responses: { 200: { content: { 'application/json': { schema: { type: 'string' } } } } },
    });
    expect(JSON.stringify(doc)).not.toContain('$schema');
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
    expect(generateOpenApi(c, { info })).toEqual(doc);
    expect(json).toEqual(before);
  });
});

const withUser = (def: Json) => ({ $ref: '#/$defs/User', $defs: { User: def } });

describe('generateOpenApi: $defs', () => {
  const user = { type: 'object', properties: { id: { type: 'string' } } };

  it('shares a named schema across routes and rewrites its refs', () => {
    const c = defineContract('/d', {
      a: get('/a', {
        response: fake({ type: 'array', items: { $ref: '#/$defs/User' }, $defs: { User: user } }),
      }),
      b: get('/b', { response: fake({ ...withUser(user), $defs: { User: user, Id: {} } }) }),
    });
    const doc = generateOpenApi(c, { info });
    expect(doc.components.schemas).toEqual({ User: user, Id: {} });
    expect(JSON.stringify(doc.paths)).not.toContain('$defs');
    expect(op(doc, '/d/b', 'get')).toMatchObject({
      responses: {
        200: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
        },
      },
    });
    // Refs inside definitions and arrays are rewritten too; other `$ref` values stay.
    const nested = defineContract('/n', {
      a: get('/', {
        response: fake({
          $ref: '#/$defs/List',
          $defs: { List: { type: 'array', items: [{ $ref: '#/$defs/Item' }, { $ref: 7 }] } },
        }),
      }),
    });
    expect(generateOpenApi(nested, { info }).components.schemas).toEqual({
      List: { type: 'array', items: [{ $ref: '#/components/schemas/Item' }, { $ref: 7 }] },
    });
  });

  it('throws VIBE9802 for two different schemas under one name', () => {
    const c = defineContract('/d', {
      a: get('/a', { response: fake(withUser(user)) }),
      b: get('/b', { response: fake(withUser({ type: 'string' })) }),
    });
    const error = Object(
      (() => {
        try {
          return generateOpenApi(c, { info });
        } catch (thrown) {
          return thrown;
        }
      })(),
    );
    expect(error.code).toBe('VIBE9802');
    expect(error.message).toContain('User');
    expect(error.message).toContain('GET /d/b');
  });

  it('keeps definitions named after Object.prototype members', () => {
    const c = defineContract('/p', {
      a: get('/', {
        response: fake({
          $ref: '#/$defs/constructor',
          $defs: { constructor: { type: 'string' }, ['__proto__']: { type: 'number' } },
        }),
      }),
    });
    const { schemas } = generateOpenApi(c, { info }).components;
    expect(Object.hasOwn(schemas, 'constructor')).toBe(true);
    expect(Object.hasOwn(schemas, '__proto__')).toBe(true);
    expect(JSON.stringify(schemas)).toBe(
      '{"constructor":{"type":"string"},"__proto__":{"type":"number"}}',
    );
  });
});

const run = (contracts: object, options: Partial<OpenApiOptions> = {}) =>
  caught(() => generateOpenApi(contracts, { info, ...options }));

describe('generateOpenApi: fallbacks', () => {
  it('throws VIBE9801 for an unnamed recursive schema and accepts a named one', async () => {
    const Cat = z.object({
      name: z.string(),
      get kids() {
        return z.array(Cat);
      },
    });
    const error = Object(await run(defineContract('/c', { a: get('/', { response: Cat }) })));
    expect(error.code).toBe('VIBE9801');
    expect(error.message).toContain('The response schema of GET /c');
    expect(error.message).toContain('$ref: "#"');

    const Named = z
      .object({
        name: z.string(),
        get kids() {
          return z.array(Named);
        },
      })
      .meta({ id: 'Named' });
    const doc = generateOpenApi(defineContract('/c', { a: get('/', { response: Named }) }), {
      info,
    });
    expect(JSON.stringify(doc)).not.toContain('"$ref":"#"');
    expect(Object.keys(doc.components.schemas)).toEqual(['Named']);
  });

  it('forwards libraryOptions to the converter', () => {
    const input = vi.fn<() => Json>(() => ({ type: 'object' }));
    const output = vi.fn<() => Json>(() => ({ type: 'string' }));
    const spy: StandardSchemaV1 & StandardJSONSchemaV1 = {
      '~standard': { ...fake({})['~standard'], jsonSchema: { input, output } },
    };
    const c = defineContract('/l', { a: post('/', { body: spy, response: spy }) });
    const libraryOptions = { unrepresentable: 'any' };
    generateOpenApi(c, { info, libraryOptions });
    expect(input).toHaveBeenCalledWith({ target: 'draft-2020-12', libraryOptions });
    expect(output).toHaveBeenCalledWith({ target: 'draft-2020-12', libraryOptions });
  });

  it('uses toJsonSchema without a converter and when the converter throws', () => {
    const date = z.date();
    const toJsonSchema = vi.fn<NonNullable<OpenApiOptions['toJsonSchema']>>(() => ({
      type: 'string',
      format: 'date-time',
    }));
    const c = defineContract('/f', {
      a: post('/', { body: bare, response: date }),
    });
    const doc = generateOpenApi(c, { info, toJsonSchema });
    expect(toJsonSchema.mock.calls).toEqual([
      [bare, 'input'],
      [date, 'output'],
    ]);
    expect(JSON.stringify(op(doc, '/f', 'post'))).toContain('"format":"date-time"');
  });

  it('throws VIBE9801 with route, part and cause when nothing converts', async () => {
    const missing = Object(await run(defineContract('/f', { a: get('/:id', { query: bare }) })));
    expect(missing.code).toBe('VIBE9801');
    expect(missing.message).toContain('The query schema of GET /f/:id');
    expect(missing.message).toContain('no Standard JSON Schema converter');
    expect(missing.cause).toBeUndefined();

    const throwing = Object(
      await run(defineContract('/f', { a: get('/', { response: z.date() }) })),
    );
    expect(throwing.code).toBe('VIBE9801');
    expect(throwing.message).toContain('The response schema of GET /f');
    expect(throwing.message).toContain('Date cannot be represented in JSON Schema');
    expect(throwing.cause).toBeInstanceOf(Error);

    const cause = new Error('fallback failed');
    const fallback = Object(
      await run(defineContract('/f', { a: post('/', { body: bare }) }), {
        toJsonSchema: () => {
          throw cause;
        },
      }),
    );
    expect(fallback.code).toBe('VIBE9801');
    expect(fallback.message).toContain('The body schema of POST /f');
    expect(fallback.message).toContain('fallback failed');
    expect(fallback.cause).toBe(cause);

    const text = Object(
      await run(defineContract('/f', { a: get('/:id', { headers: bare }) }), {
        toJsonSchema: () => {
          // oxlint-disable-next-line no-throw-literal -- a converter may throw a non-error
          throw 'not convertible';
        },
      }),
    );
    expect(text.message).toContain('The headers schema of GET /f/:id');
    expect(text.message).toContain('not convertible');
    expect(text.cause).toBe('not convertible');
  });
});

describe('generateOpenApi: recipe', () => {
  it('serves the document from a middleware', async () => {
    const users = defineContract('/users', {
      findOne: get('/:id', { response: z.object({ id: z.string() }) }),
    });

    @Controller(users)
    class UsersController {
      @Handle(users.findOne)
      findOne(ctx: Ctx<typeof users.findOne>) {
        return { id: ctx.params.id };
      }
    }

    // The recipe from the JSDoc of generateOpenApi, verbatim.
    const doc = generateOpenApi(
      { users },
      { info: { title: 'API', version: '1.0.0' }, servers: [{ url: '/api' }] },
    );
    const openapi: Middleware = (req, next) =>
      new URL(req.url).pathname === '/openapi.json' ? Promise.resolve(Response.json(doc)) : next();

    const app = await Test.createTestingModule({
      controllers: [UsersController],
      middleware: [openapi],
    }).compile();
    const served = await app.fetch(new Request('http://localhost/openapi.json'));
    expect(served.status).toBe(200);
    expect(await served.json()).toEqual(doc);
    const user = await app.fetch(new Request('http://localhost/users/7'));
    expect(await user.json()).toEqual({ id: '7' });
    await app.close();
  });
});
