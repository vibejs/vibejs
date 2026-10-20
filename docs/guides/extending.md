---
title: Extending vibe.js
description: Package reusable features as UI plugins and composables, and as configurable server modules, middleware, guards, interceptors, filters and metadata.
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

### Plugins

A plugin is a function that receives the app, or an object with an `install(app)` method. `app.use(plugin, ...options)` installs it once, and checks the options against the plugin's `Plugin<Options>` type; a second call with the same plugin warns [VIBE5304](/errors/VIBE5304) and does nothing. A plugin provides values to every component with `app.provide()`, and registers cleanup with `app.onUnmount()`.

The feature flags package of the example todo app exports a plugin factory: it takes options, loads the flags once, and provides them under a private injection key.

<<< @/../examples/todo-flags/ui/flags.ts#plugin

The application installs it next to the router:

```ts
import { createApp, type Component, type Plugin } from '@vibejs-org/ui';
declare const App: Component;
declare function flagsPlugin(): Plugin;
// ---cut---
createApp(App).use(flagsPlugin()).mount('#app');
```

### Provide and inject

`app.provide(key, value)` makes a value available to every component of the app; `provide(key, value)` in a component's setup makes it available to that component's descendants. `inject(key)` reads the nearest one, and `inject(key, fallback)` returns `fallback` when nothing provides `key`. Type keys with `InjectionKey<T>`, a symbol that carries the type of its value, so `inject()` returns that type.

### Composables

A composable is a function that setup calls to reuse stateful logic: it may read injections, create refs and computed values, and register lifecycle hooks of the calling component. The flags package reads its injection in a composable, so components never see the key, and an app without the plugin gets `false` for every flag:

<<< @/../examples/todo-flags/ui/flags.ts#composable

A page then calls `useFlag('removeDone')` in its setup and uses the ref in its template.

### Limits

- There are no global components, custom directives, mixins or global properties: `app.component()`, `app.directive()` and `app.mixin()` throw [VIBE5301](/errors/VIBE5301). Export components for import, element behavior as composables that take a template ref, and shared values through `app.provide()`.
- Packages that ship `.vibe` components are planned for v0.2. Until then, a package exports plugins, composables, injection keys and types.
