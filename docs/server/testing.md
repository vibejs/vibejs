---
title: Testing the server
description: Test modules in process with Test.createTestingModule, replace providers, call routes through the typed client and check the graph with inspect().
---

# Testing the server

Server tests run in process: no port, no network. `Test.createTestingModule()` from `@usevibejs/server/testing` builds the same `App` as production from the modules you list, and `app.fetch` serves the requests.

```ts
import { createClient, defineContract, get } from '@usevibejs/contract';
import { Controller, Handle, JsonLogger, Module } from '@usevibejs/server';
import { Test } from '@usevibejs/server/testing';
import * as v from 'valibot';
declare function expect(value: unknown): { toEqual(expected: unknown): void };
const todos = defineContract('/todos', { list: get('/', { response: v.array(v.string()) }) });
@Controller(todos)
class TodosController {
  @Handle(todos.list)
  list(): string[] {
    return ['write tests'];
  }
}
@Module({ controllers: [TodosController] })
class TodosModule {}
// ---cut---
const app = await Test.createTestingModule({
  imports: [TodosModule],
  basePath: '/api',
  logger: new JsonLogger({ level: 'silent' }),
}).compile();
const api = createClient({ todos }, { baseUrl: '/api', fetch: app.fetch });

const result = await api.todos.list();
if (!result.ok) throw new Error(result.error.code);
expect(result.data).toEqual(['write tests']);

await app.close();
```

`createTestingModule()` takes module options (`imports`, `providers`, `controllers`) and application options (`basePath`, `logger`, `guards`, …) in one object. Spread `appOptions` from `app.module.ts` to test with the production options.

Calling routes through `createClient` checks the contract too: a test fails to compile when a route, an input or a response type changes. Narrow the result as the UI does:

```ts
import { createClient, defineContract, del } from '@usevibejs/contract';
declare function expect(value: unknown): { toBe(expected: unknown): void };
const todos = defineContract('/todos', {
  remove: del('/:id', { errors: { TODO_NOT_FOUND: 404 } }),
});
declare const app: { fetch(req: Request): Promise<Response> };
// ---cut---
const api = createClient({ todos }, { baseUrl: '/api', fetch: app.fetch });
const removed = await api.todos.remove({ params: { id: 'missing' } });
if (removed.ok || removed.error.code !== 'TODO_NOT_FOUND') throw new Error('expected a 404');
expect(removed.error.status).toBe(404);
```

For requests outside a contract, such as a missing route or a malformed body, use `app.request(path, init?)`; `init.json` sends a JSON body.

## Replacing providers

`overrideProvider(token)` replaces a provider by its token in every module that provides it, before anything is created:

```ts
import { JsonLogger, Module } from '@usevibejs/server';
import { Test } from '@usevibejs/server/testing';
class Mailer {
  send(to: string): string {
    return to;
  }
}
@Module({ providers: [Mailer], exports: [Mailer] })
class MailModule {}
// ---cut---
const sent: string[] = [];
const app = await Test.createTestingModule({
  imports: [MailModule],
  logger: new JsonLogger({ level: 'silent' }),
})
  .overrideProvider(Mailer)
  .useValue({ send: (to: string) => (sent.push(to), to) })
  .compile();

app.get(Mailer).send('ada@example.com');
```

`useValue`, `useClass` and `useFactory` are available. Overriding a token that no module provides fails with [VIBE9701](/errors/VIBE9701). `app.get(token)` reads a provider, such as a service whose state a test checks.

## Logs

Pass `logger: new JsonLogger({ level: 'silent' })` to keep test output clean, or a `JsonLogger` with a `write` function to assert on log entries. The framework's own request, error and lifecycle logs go to this logger; overriding `Logger` reaches only the code that injects it.

## Checking the graph

`inspect(root, options)` lists the routes and modules without creating anything. A snapshot of it catches an unintended route, guard or module change:

```ts
import { inspect, Module, type AppOptions } from '@usevibejs/server';
declare function expect(value: unknown): { toMatchSnapshot(): void };
@Module({})
class AppModule {}
const appOptions: AppOptions = { basePath: '/api' };
// ---cut---
expect(inspect(AppModule, appOptions)).toMatchSnapshot();
```
