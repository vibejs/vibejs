---
title: Extending vibe.js
description: Package reusable server features as configurable modules, middleware, guards, interceptors, filters and metadata.
---

# Extending vibe.js

Everything an application uses to extend vibe.js is public API, so a feature can move from an app into a package without changes.

## Server

### Configurable modules

A module that needs options exposes a static `forRoot(options)` that returns a `DynamicModule`: the module class plus extra providers and exports. The options become a provider, so the module's own classes inject them:

```ts
import { inject, Module, token, type DynamicModule } from '@vibejs-org/server';
// ---cut---
export interface MailOptions {
  readonly from: string;
  readonly send: (message: { from: string; to: string; text: string }) => Promise<void>;
}

const MAIL_OPTIONS = token<MailOptions>('MailOptions');

export class Mailer {
  private readonly options = inject(MAIL_OPTIONS);

  send(to: string, text: string): Promise<void> {
    return this.options.send({ from: this.options.from, to, text });
  }
}

@Module({ providers: [Mailer], exports: [Mailer] })
export class MailModule {
  static forRoot(options: MailOptions): DynamicModule {
    return {
      module: MailModule,
      global: true,
      providers: [{ provide: MAIL_OPTIONS, useValue: options }],
    };
  }
}
```

An application imports `MailModule.forRoot({ ... })`. The providers, controllers, imports and exports of the returned object are added to those of `@Module()`. Each `forRoot()` call returns a new object, which is a separate module instance; import the result once and export it, or make it `global`, to share one instance. For options that come from other providers, provide them with `useFactory` and `inject` instead of `useValue`.

### Middleware packages

A middleware is a function, so a package exports a factory that takes options and returns a `Middleware`:

```ts
import { HttpError, type Middleware } from '@vibejs-org/server';
// ---cut---
export function requireHeader(name: string): Middleware {
  return (req, next) => {
    if (!req.headers.has(name)) throw new HttpError(400, 'BAD_REQUEST', `Missing ${name}`);
    return next();
  };
}
```

The application adds it to `AppOptions.middleware`. An error thrown in a middleware is answered as a problem, like an error in a handler.

### Reusable guards, interceptors and filters

Enhancers are classes without constructor parameters that `inject()` what they need, so a package can export them next to a module that provides their dependencies. Configure them through an options token from `forRoot()`, as above, rather than through constructor arguments, which the container does not pass.

### Metadata

`createMetadata<T>(name)` gives a package a typed decorator and the key to read it back in its guards and interceptors with `ctx.getMetadata(key)`:

```ts
import { createMetadata, type Interceptor, type RequestContext } from '@vibejs-org/server';
// ---cut---
export const CacheFor = createMetadata<number>('cacheFor');

export class CacheHeaders implements Interceptor {
  async intercept(ctx: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
    const seconds = ctx.getMetadata(CacheFor);
    if (seconds !== undefined) ctx.responseHeaders.set('cache-control', `max-age=${seconds}`);
    return next();
  }
}
```

Applications then write `@CacheFor(60)` on a handler and register `CacheHeaders` globally or with `@UseInterceptors()`.

See [Modules and providers](../server/modules.md) and [Middleware, guards, interceptors and filters](../server/pipeline.md) for the rules these building blocks follow.

## UI

UI plugins with `app.use()` and provide/inject are documented together with the UI guides.
