---
title: Modules and providers
description: Modules, providers, field injection with inject(), tokens, exports, global modules and lifecycle hooks.
---

# Modules and providers

## Modules

A module is a class with `@Module()`. It lists what it provides, which controllers it registers, which modules it imports and which of its providers other modules may use:

```ts
import { Module } from '@vibejs-org/server';
class TodosController {}
// ---cut---
class TodosService {
  list(): string[] {
    return [];
  }
}

@Module({ providers: [TodosService], controllers: [], exports: [TodosService] })
export class TodosModule {}

@Module({ imports: [TodosModule] })
export class AppModule {}
```

A module sees its own providers, the exports of the modules it imports and the exports of global modules. Anything else fails at startup with [VIBE9102](/errors/VIBE9102), which names the module and the chain that asked for the token. Modules cannot import each other in a cycle ([VIBE9202](/errors/VIBE9202)), and every imported class needs its own `@Module()` ([VIBE9201](/errors/VIBE9201)).

A module can export an imported module, which passes that module's exports on to its own importers. `@Module({ global: true })` makes the exports visible everywhere without an import; use it for cross-cutting services such as a database client.

## Injecting dependencies

Dependencies are fields initialized with `inject(Token)`:

```ts
import { inject } from '@vibejs-org/server';
class Db {
  query(sql: string): string[] {
    return [sql];
  }
}
// ---cut---
class TodosService {
  private readonly db = inject(Db);

  list(): string[] {
    return this.db.query('select * from todos');
  }
}
```

- Providers are created with `new Cls()`. A constructor with parameters is rejected with [VIBE9104](/errors/VIBE9104); move each parameter to an `inject()` field.
- `inject()` works while the container builds an object: in field initializers, in the constructor body and in the synchronous part of a factory. Anywhere else it throws [VIBE9101](/errors/VIBE9101).
- Make injected fields `private`. A public field is part of the class's declared type, so with `isolatedDeclarations` it needs an explicit type annotation (TS9012): `readonly db: Db = inject(Db)`.
- `inject(Token, { optional: true })` returns `undefined` when no provider is visible.

## Providers

A provider is a class, or an object that names a token in `provide` and says how to create its value:

```ts
import { token, type Provider } from '@vibejs-org/server';
class TodosService {}
class MemoryTodosService extends TodosService {}
// ---cut---
const ApiUrl = token<string>('ApiUrl');
const Clock = token<() => number>('Clock');
const Now = token<() => number>('Now');

export const providers: Provider[] = [
  { provide: TodosService, useClass: MemoryTodosService },
  { provide: ApiUrl, useValue: 'https://api.example.com' },
  { provide: Clock, useFactory: () => () => Date.now() },
  { provide: Now, useExisting: Clock },
];
```

`token<T>(description)` creates a typed token for a value that is not a class. A class is its own token. When a module lists the same token twice, the last entry wins.

A factory receives the tokens listed in `inject` as parameters, and may be async:

```ts
import { token, type Provider } from '@vibejs-org/server';
declare function connect(url: string): Promise<{ close(): Promise<void> }>;
// ---cut---
const DatabaseUrl = token<string>('DatabaseUrl');
const Database = token<{ close(): Promise<void> }>('Database');

export const database: Provider[] = [
  { provide: DatabaseUrl, useValue: 'postgres://localhost/app' },
  { provide: Database, useFactory: (url: string) => connect(url), inject: [DatabaseUrl] },
];
```

Every factory settles before any class is created, so classes can inject a factory's value directly. A class that a factory needs while it is being built can only inject factories that have already settled; list such a dependency in the factory's `inject` array so it settles first ([VIBE9106](/errors/VIBE9106)).

## Lifecycle hooks

A provider, controller, enhancer or module class can implement these hooks:

| Hook                             | When                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- |
| `onModuleInit()`                 | After every object is created, in module order (deepest import first). |
| `onApplicationBootstrap()`       | After every `onModuleInit`.                                            |
| `onModuleDestroy()`              | On `close()`, in reverse order.                                        |
| `onApplicationShutdown(signal?)` | After every `onModuleDestroy`.                                         |

```ts
import { inject, token, type OnModuleDestroy, type OnModuleInit } from '@vibejs-org/server';
const Database = token<{ connect(): Promise<void>; close(): Promise<void> }>('Database');
// ---cut---
class Migrations implements OnModuleInit, OnModuleDestroy {
  private readonly db = inject(Database);

  async onModuleInit(): Promise<void> {
    await this.db.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.close();
  }
}
```

Init hooks are awaited one by one, and the first error stops startup. Shutdown hooks all run even when one fails; the failures are reported together as [VIBE9204](/errors/VIBE9204).
