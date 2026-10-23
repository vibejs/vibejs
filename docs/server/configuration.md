---
title: Configuration
description: Typed environment config, logging, CORS, cookies, request limits, shutdown and the TypeScript setup of a vibe.js server.
---

# Configuration

## Environment config

`defineConfig(schema)` returns a class whose constructor validates the environment variables named by the schema keys. Provide it like any class and inject it where it is needed:

```ts
import { defineConfig, inject, Module } from '@usevibejs/server';
import * as v from 'valibot';
// ---cut---
export class AppConfig extends defineConfig({
  DATABASE_URL: v.pipe(v.string(), v.url()),
  PORT: v.optional(v.pipe(v.string(), v.transform(Number)), '3000'),
}) {}

class Db {
  private readonly config = inject(AppConfig);

  url(): string {
    return this.config.DATABASE_URL;
  }
}

@Module({ global: true, providers: [AppConfig, Db], exports: [AppConfig, Db] })
export class CoreModule {}
```

The config is validated once, when the application is created. Every failing key is reported at once as [VIBE9601](/errors/VIBE9601); the message names the keys and never prints the values. Schemas must be synchronous ([VIBE9602](/errors/VIBE9602)). The validated object is frozen.

## Logging

The application logger is provided as `Logger` in every module. Inject it to log with the same sink as the framework:

```ts
import { inject, Logger } from '@usevibejs/server';
// ---cut---
class Mailer {
  private readonly log = inject(Logger);

  send(to: string): void {
    this.log.info('mail sent', { to });
  }
}
```

The default logger is `JsonLogger`, which writes one JSON line per entry: `{ time, level, msg, ...fields }`. Pass another one in `AppOptions.logger`:

```ts
import { JsonLogger, type AppOptions } from '@usevibejs/server';
// ---cut---
export const appOptions: AppOptions = {
  basePath: '/api',
  logger: new JsonLogger({ level: 'debug', fields: { service: 'todo' } }),
};
```

Levels are `debug`, `info` (default), `warn`, `error` and `silent`. Each request is logged at `debug` with its method, path, status and duration. `ctx.log` in a handler is a child logger that adds the `requestId`. To send logs elsewhere, extend the abstract `Logger` class, or pass `write` to `JsonLogger`.

## CORS

`cors(options)` is a middleware. It answers preflight requests and adds the CORS headers to the responses for allowed origins:

```ts
import { cors, type AppOptions } from '@usevibejs/server';
// ---cut---
export const appOptions: AppOptions = {
  basePath: '/api',
  middleware: [cors({ origin: ['https://app.example.com'], credentials: true, maxAge: 600 })],
};
```

`origin` is `'*'`, a list of origins or a predicate. `'*'` together with `credentials: true` is rejected ([VIBE9404](/errors/VIBE9404)), because browsers ignore it. When the UI and the API share an origin, which is the default layout, no CORS is needed.

## Cookies

`ctx.cookies` reads the request cookies and sets response cookies. New cookies are `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/` unless the options say otherwise:

```ts
import { defineContract, post } from '@usevibejs/contract';
import { Controller, Handle, type Ctx } from '@usevibejs/server';
const session = defineContract('/session', { start: post('/'), end: post('/end') });
// ---cut---
@Controller(session)
export class SessionController {
  @Handle(session.start)
  start(ctx: Ctx<typeof session.start>): void {
    ctx.cookies.set('session', crypto.randomUUID(), { maxAge: 60 * 60 * 24 });
  }

  @Handle(session.end)
  end(ctx: Ctx<typeof session.end>): void {
    ctx.cookies.delete('session');
  }
}
```

A cookie name must be an RFC 9110 token ([VIBE9504](/errors/VIBE9504)).

## Limits and shutdown

| Option              | Default   | Meaning                                                                       |
| ------------------- | --------- | ----------------------------------------------------------------------------- |
| `basePath`          | `''`      | Prefix of every route, such as `/api` ([VIBE9405](/errors/VIBE9405)).         |
| `bodyLimit`         | 1 MiB     | The largest request body in bytes; larger bodies get 413.                     |
| `shutdownTimeout`   | 10 000 ms | How long `close()` waits for running requests ([VIBE9402](/errors/VIBE9402)). |
| `validateResponses` | `true`    | Validates handler results; see [Handlers](./handlers.md#validation).          |

## TypeScript setup

The server decorators are TypeScript legacy decorators. The server `tsconfig.json` enables them:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

- Never enable `emitDecoratorMetadata` and never import `reflect-metadata`: dependencies are declared with `inject()`, not read from types.
- Without `experimentalDecorators`, the decorators throw [VIBE9301](/errors/VIBE9301) when the decorated class is defined.
- Vite and Vitest compile decorators with Oxc, which imports its helpers from `@oxc-project/runtime`. Keep `@oxc-project/runtime` as a direct dependency of the server package so that the helpers resolve.
