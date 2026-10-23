---
title: Contracts
description: Declare an API once with defineContract, serve it from a controller, call it from the UI with createClient and generate OpenAPI from it.
---

# Contracts

A contract declares the routes of one resource: method, path, inputs, response and errors. The server serves it, the UI calls it, and both are type-checked against the same declaration, with no code generation.

```ts
import { defineContract, del, get, patch, post } from '@usevibejs/contract';
import * as v from 'valibot';

export const Todo = v.object({ id: v.string(), title: v.string(), done: v.boolean() });

export const todos = defineContract('/todos', {
  list: get('/', { query: v.object({ done: v.optional(v.string()) }), response: v.array(Todo) }),
  create: post('/', {
    body: v.object({ title: v.pipe(v.string(), v.trim(), v.minLength(1)) }),
    response: Todo,
    status: 201,
  }),
  toggle: patch('/:id', { response: Todo, errors: { TODO_NOT_FOUND: 404 } }),
  remove: del('/:id', { errors: { TODO_NOT_FOUND: 404 } }),
});
```

Contract files (`*.contract.ts`) import only `@usevibejs/contract` and a schema library, so the UI can import them without pulling in server code.

## Routes

The route helpers are `get`, `post`, `put`, `patch` and `del`. Each takes a path and an optional definition:

| Field                    | Meaning                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `params`                 | A schema for the path params; without one they are strings.                                  |
| `query`                  | A schema for the query string. A key repeated in the URL, or typed as an array, is an array. |
| `headers`                | A schema for the request headers, with lowercase names.                                      |
| `body`                   | A schema for the JSON request body; not allowed on `get` ([VIBE9004](/errors/VIBE9004)).     |
| `response`               | A schema for the JSON success body, or `raw()`. Without one the route answers 204.           |
| `status`                 | The success status: 200 (default), 201 or 202.                                               |
| `errors`                 | The error codes the route raises, each with its HTTP status.                                 |
| `summary`, `description` | Text for the OpenAPI document.                                                               |

Paths are `/` or segments such as `/users/:id/posts`; params start with `:` ([VIBE9001](/errors/VIBE9001)). The full path of a route is the contract prefix followed by the route path, and the application's `basePath` is prepended when it is served.

`raw(contentType?)` declares a response that is sent as is, such as a file. The handler returns a `Response` or a body such as a string or a stream, and the client receives the `Response`:

```ts
import { defineContract, get, raw } from '@usevibejs/contract';
// ---cut---
export const reports = defineContract('/reports', {
  csv: get('/:year', { response: raw('text/csv') }),
});
```

## Errors

A route declares the errors a client should handle as `errors: { CODE: status }`. The handler raises them with `ctx.fail('CODE', detail?)`, and the client receives an `application/problem+json` response:

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "code": "TODO_NOT_FOUND",
  "detail": "No todo 7",
  "requestId": "9a7c..."
}
```

Besides the declared codes, every route can answer the built-in codes `BAD_REQUEST`, `VALIDATION_FAILED`, `INVALID_JSON`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `BODY_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_ERROR` and `SERVICE_UNAVAILABLE`. A `VALIDATION_FAILED` problem lists each issue in `errors` as `{ in, pointer, message }`.

## Schema libraries

Any [Standard Schema](https://standardschema.dev) library works, and one contract may mix them.

- **valibot** is the recommended default for code that ships to the browser, because only the validators you use end up in the bundle.
- **zod** works as well. Dates travel as strings in JSON, so declare them with `z.iso.datetime()` rather than `z.date()`.

Schemas run on the server. It validates the request parts before the handler runs and passes the schema output to the handler, so `v.trim()` in a body schema trims on the server. The client sends its typed input as JSON without validating it, and types the response from the schema without validating it again.

## Calling a contract

`createClient(contracts, options)` returns one function per route. A call never throws for HTTP or network failures; it resolves to an `ApiResult` that you narrow on `ok`, then on `error.code`:

```ts
import { createClient, defineContract, get } from '@usevibejs/contract';
import * as v from 'valibot';
const todos = defineContract('/todos', {
  one: get('/:id', { response: v.object({ title: v.string() }), errors: { TODO_NOT_FOUND: 404 } }),
});
// ---cut---
const api = createClient({ todos }, { baseUrl: '/api' });

const result = await api.todos.one({ params: { id: '7' } });
if (result.ok) {
  console.log(result.data.title);
} else if (result.error.code === 'TODO_NOT_FOUND') {
  const status: 404 = result.error.status;
  console.log(status, result.error.detail);
} else {
  console.log(result.error.code, result.error.status);
}
```

- The input object has `params`, `query`, `headers` and `body`, each typed from the route.
- The second argument takes `{ signal, headers }`. `options.headers` may be a function, called for every request, such as one that adds an authorization header.
- A network failure resolves with `code: 'NETWORK_ERROR'` and `status: 0`, an abort with `ABORTED`, and a failed response that is not a problem, or a body that is not JSON, with `UNEXPECTED_RESPONSE`.
- Tests pass `fetch: app.fetch` to call an application in process; see [Testing](./testing.md).

## OpenAPI

`generateOpenApi(contracts, options)` from `@usevibejs/server/openapi` returns an OpenAPI 3.1 document for the same record of contracts the client takes. Serve it with a middleware. A middleware sees the full request path, base path included, so the recipe below answers `/api/openapi.json` under the base path `/api`:

```ts
import { defineContract, get } from '@usevibejs/contract';
import type { Middleware } from '@usevibejs/server';
import { generateOpenApi } from '@usevibejs/server/openapi';
const todos = defineContract('/todos', { list: get('/') });
// ---cut---
const doc = generateOpenApi(
  { todos },
  { info: { title: 'Todo API', version: '1.0.0' }, servers: [{ url: '/api' }] },
);

export const openapi: Middleware = (req, next) =>
  new URL(req.url).pathname.endsWith('/openapi.json')
    ? Promise.resolve(Response.json(doc))
    : next();
```

Each schema is converted with its Standard JSON Schema converter. zod schemas carry one; wrap valibot schemas with `toStandardJsonSchema()` from `@valibot/to-json-schema`, or pass a `toJsonSchema(schema, io)` fallback. A schema that cannot be converted throws [VIBE9801](/errors/VIBE9801), two different schemas with one name throw [VIBE9802](/errors/VIBE9802), and an error status outside 400–599 throws [VIBE9803](/errors/VIBE9803).
