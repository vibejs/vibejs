---
title: Middleware, guards, interceptors and filters
description: The request pipeline of a vibe.js server, the run order of its enhancers, typed metadata and global enhancers.
---

# Middleware, guards, interceptors and filters

A request passes through these steps:

1. **Middleware**, around everything, in the order of `AppOptions.middleware`.
2. **Routing**: 404, or 405 with `Allow`, when no route matches.
3. **Guards**: global, then controller, then method. The first one that returns `false` ends the request with 403 `FORBIDDEN`.
4. **Interceptors**: global, then controller, then method; the first one is the outermost.
5. **Validation** of the request parts, then the **handler**.
6. **Response** building and response validation.
7. **Filters** for any error of steps 3 to 6: method, then controller, then global.

`app.inspect()` and `inspect(root, options)` list each route's guards, interceptors and filters in exactly this order, globals included.

## Middleware

A middleware wraps the whole request at the Fetch level. It runs before routing, so it sees every request, including those that match no route:

```ts
import type { Middleware } from '@vibejs-org/server';
// ---cut---
export const timing: Middleware = async (req, next) => {
  const started = performance.now();
  const res = await next();
  // A copy has mutable headers, even for a redirect.
  const out = new Response(res.body, res);
  out.headers.set('server-timing', `app;dur=${Math.round(performance.now() - started)}`);
  return out;
};
```

`next(req?)` continues with the same request or with a replacement. Middleware is a plain function, so a package can export a factory of middleware, such as the built-in `cors()`.

## Guards

A guard decides whether a request may reach its handler:

```ts
import type { CanActivate, RequestContext } from '@vibejs-org/server';
declare module '@vibejs-org/server' {
  interface RequestState {
    user?: { readonly id: string };
  }
}
// ---cut---
export class SessionGuard implements CanActivate {
  canActivate(ctx: RequestContext): boolean {
    const id = ctx.cookies.get('session');
    if (id) ctx.state.user = { id };
    return id !== undefined;
  }
}
```

Apply it with `@UseGuards(SessionGuard)` on a controller or a handler, or globally with `AppOptions.guards`. To answer something other than 403, throw an `HttpError`, such as `new HttpError(401, 'UNAUTHORIZED')`.

`ctx.state` carries values from guards and interceptors to handlers. Type its fields by augmenting `RequestState`:

```ts
declare module '@vibejs-org/server' {
  interface RequestState {
    user?: { readonly id: string };
  }
}
```

## Interceptors

An interceptor wraps the handler. `next()` runs the rest of the chain and resolves to the handler's result, so an interceptor can measure, retry or replace it:

```ts
import type { Interceptor, RequestContext } from '@vibejs-org/server';
// ---cut---
export class LogDuration implements Interceptor {
  async intercept(ctx: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
    const started = performance.now();
    try {
      return await next();
    } finally {
      ctx.log.info('handled', { ms: Math.round(performance.now() - started) });
    }
  }
}
```

## Filters

A filter turns an error into a response. It returns a `Response`, an `HttpError` to send as a problem, or `undefined` to pass the error to the next filter. Errors that no filter handles are answered as described in [Handlers](./handlers.md#errors).

```ts
import { HttpError, type ExceptionFilter } from '@vibejs-org/server';
class NotFoundInDb extends Error {}
// ---cut---
export class DbErrors implements ExceptionFilter {
  catch(error: unknown): HttpError | undefined {
    return error instanceof NotFoundInDb ? new HttpError(404, 'NOT_FOUND') : undefined;
  }
}
```

Guards, interceptors and filters are classes without constructor parameters. They are created once, in the scope of the module of their controller (globals in the root module), so they can `inject()` providers.

## Metadata

`createMetadata<T>(name)` creates a typed decorator that is also the key to read the value back. Method values override controller values:

```ts
import {
  Controller,
  createMetadata,
  Handle,
  HttpError,
  UseGuards,
  type CanActivate,
  type RequestContext,
} from '@vibejs-org/server';
import { defineContract, get } from '@vibejs-org/contract';
const admin = defineContract('/admin', { stats: get('/stats') });
declare module '@vibejs-org/server' {
  interface RequestState {
    roles?: readonly string[];
  }
}
// ---cut---
export const Roles = createMetadata<readonly string[]>('roles');

class RolesGuard implements CanActivate {
  canActivate(ctx: RequestContext): boolean {
    const needed = ctx.getMetadata(Roles) ?? [];
    if (!needed.every((role) => ctx.state.roles?.includes(role))) {
      throw new HttpError(403, 'FORBIDDEN', `Needs ${needed.join(', ')}`);
    }
    return true;
  }
}

@Controller(admin)
@UseGuards(RolesGuard)
@Roles(['admin'])
export class AdminController {
  @Handle(admin.stats)
  stats(): void {}
}
```

## Global enhancers

`AppOptions` applies middleware and enhancers to every route:

```ts
import {
  cors,
  type AppOptions,
  type CanActivate,
  type ExceptionFilter,
  type Interceptor,
} from '@vibejs-org/server';
declare class SessionGuard implements CanActivate {
  canActivate(): boolean;
}
declare class LogDuration implements Interceptor {
  intercept(ctx: unknown, next: () => Promise<unknown>): Promise<unknown>;
}
declare class DbErrors implements ExceptionFilter {
  catch(): undefined;
}
// ---cut---
export const appOptions: AppOptions = {
  basePath: '/api',
  middleware: [cors({ origin: ['https://app.example.com'], credentials: true })],
  guards: [SessionGuard],
  interceptors: [LogDuration],
  filters: [DbErrors],
};
```
