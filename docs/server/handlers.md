---
title: Controllers and handlers
description: Serve a contract with @Controller and @Handle, read the typed ctx, raise declared errors and fix TS1241 on @Handle.
---

# Controllers and handlers

A controller serves one contract. Each route of the contract has exactly one handler method, marked with `@Handle(route)`:

```ts
import { defineContract, del, get, post } from '@usevibejs/contract';
import { Controller, Handle, inject, type Ctx } from '@usevibejs/server';
import * as v from 'valibot';
const Todo = v.object({ id: v.string(), title: v.string(), done: v.boolean() });
type Todo = v.InferOutput<typeof Todo>;
const todos = defineContract('/todos', {
  list: get('/', { response: v.array(Todo) }),
  create: post('/', { body: v.object({ title: v.string() }), response: Todo, status: 201 }),
  remove: del('/:id', { errors: { TODO_NOT_FOUND: 404 } }),
});
class TodosService {
  list(): Todo[] {
    return [];
  }
  create(title: string): Todo {
    return { id: '1', title, done: false };
  }
  remove(id: string): boolean {
    return id === '1';
  }
}
// ---cut---
@Controller(todos)
export class TodosController {
  private readonly todos = inject(TodosService);

  @Handle(todos.list)
  list(): Todo[] {
    return this.todos.list();
  }

  @Handle(todos.create)
  create(ctx: Ctx<typeof todos.create>): Todo {
    return this.todos.create(ctx.body.title);
  }

  @Handle(todos.remove)
  remove(ctx: Ctx<typeof todos.remove>): void {
    if (!this.todos.remove(ctx.params.id)) ctx.fail('TODO_NOT_FOUND', `No todo ${ctx.params.id}`);
  }
}
```

Register the controller in the `controllers` of a module. At startup the application checks that every route has one handler ([VIBE9303](/errors/VIBE9303), [VIBE9304](/errors/VIBE9304)), that each handler belongs to the controller's contract ([VIBE9305](/errors/VIBE9305)) and that each contract has one controller ([VIBE9306](/errors/VIBE9306)).

## The context

A handler receives one argument, `ctx: Ctx<typeof contract.route>`:

| Field                                | Value                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `params`, `query`, `headers`, `body` | The validated request parts; each exists only when the route declares it (params always). |
| `fail(code, detail?)`                | Ends the request with a declared error code of the route.                                 |
| `req`, `url`                         | The `Request` and its parsed URL.                                                         |
| `requestId`                          | The `x-request-id` header, or a generated id; it is sent back on the response.            |
| `log`                                | The application logger with the `requestId` attached.                                     |
| `cookies`                            | `get`, `set` and `delete`; see [Configuration](./configuration.md#cookies).               |
| `responseHeaders`                    | Headers added to the response.                                                            |
| `signal`                             | Aborted when the client disconnects.                                                      |
| `state`                              | Values that guards and interceptors share with the handler.                               |
| `getMetadata(key)`                   | Metadata set with `createMetadata`; see [Pipeline](./pipeline.md#metadata).               |

A handler may be async. It returns the route's response type: the schema's input type for a JSON response, nothing for a route without a response, and a `Response` or a body for a `raw()` route. Returning a `Response` from any handler sends it as is.

## Errors

- **Declared errors.** `ctx.fail('CODE', detail?)` throws an `HttpError` with the status the contract declares. The codes are typed: only the route's declared codes are accepted.
- **Other client errors.** `throw new HttpError(status, code, detail?)` from a handler, guard, interceptor or service. Prefer a declared code or a built-in one such as `NOT_FOUND`; an undeclared code is still sent, with the warning [VIBE9502](/errors/VIBE9502).
- **Bugs.** Any other error is logged with its cause ([VIBE9503](/errors/VIBE9503)) and answered with 500 `INTERNAL_ERROR`, without details.

Every error response is `application/problem+json`: `{ type, title, status, code, detail?, errors?, requestId }`.

```ts
import { HttpError } from '@usevibejs/server';
// ---cut---
export function requireUser(id: string | undefined): string {
  if (!id) throw new HttpError(401, 'UNAUTHORIZED', 'Sign in first');
  return id;
}
```

## Validation

Before the handler runs, the application validates `params`, `query`, `headers` and `body` against the route's schemas and puts the schema output on `ctx`. When any part fails, the client receives 400 `VALIDATION_FAILED` with every issue in `errors`, and the handler does not run. A body that is not JSON is 400 `INVALID_JSON`; a body over `bodyLimit` is 413 `BODY_TOO_LARGE`.

With `validateResponses` (on by default), the handler's result is validated against the response schema and the schema output is sent. A mismatch is a server bug: it is logged as [VIBE9501](/errors/VIBE9501) and answered with 500.

Sending the schema output means the schema decides which keys reach the client:

- valibot `v.object()` and zod `z.object()` drop keys the schema does not declare, so an internal field such as `passwordHash` is not sent.
- arktype keeps undeclared keys unless the type sets `"+": "delete"`.
- With `validateResponses: false`, the result is sent unchanged.

Declare an explicit response schema for every route that returns stored data, and keep `validateResponses` on.

## TS1241 on @Handle

`TS1241: Unable to resolve signature of method decorator when called as an expression` on a `@Handle(...)` line means that the method does not match the route. `vibejs check` reports it with this fix:

> the handler must be `(ctx: Ctx<typeof contract.route>)` and return the route response type; do not cast or use `any`

Check, in this order:

1. The parameter is `ctx: Ctx<typeof contract.route>` for the same route that `@Handle` names, or the method has no parameter.
2. The return type is the response type: a missing field or a wrong type in the returned object is the usual cause. Add an explicit return type to the method to see the exact field in the error.
3. A route without a `response` returns `void`.

```ts
import { defineContract, get } from '@usevibejs/contract';
import { Controller, Handle, type Ctx } from '@usevibejs/server';
import * as v from 'valibot';
const users = defineContract('/users', {
  one: get('/:id', { response: v.object({ id: v.string() }) }),
});
// ---cut---
@Controller(users)
export class UsersController {
  // @ts-expect-error -- TS1241: `id` must be a string
  @Handle(users.one)
  one(ctx: Ctx<typeof users.one>): { id: number } {
    return { id: Number(ctx.params.id) };
  }
}
```

The fix is to return `{ id: ctx.params.id }` with the return type `{ id: string }`. Never silence the error with a cast or `any`: the decorator is what keeps the handler and the client in sync.
