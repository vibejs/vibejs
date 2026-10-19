---
title: Coming from NestJS
description: The NestJS idioms you know, their vibe.js form, and the error that points you there when the old form slips in.
---

# Coming from NestJS

Modules, providers, controllers, guards, interceptors, filters and lifecycle hooks work the way you expect. Three things differ, and most of the table below follows from them:

- **No reflected types.** vibe.js does not use `emitDecoratorMetadata` or `reflect-metadata`. Dependencies are fields initialized with `inject(Token)`, so they are explicit under every compiler.
- **Contracts instead of route decorators.** Routes, inputs, responses and errors are declared once with `defineContract`. The server handles them with `@Handle(route)`; the UI calls them with `createClient`, fully typed and without code generation.
- **One typed `ctx` instead of parameter decorators.** A handler takes `ctx: Ctx<typeof contract.route>`, which holds the validated params, query, headers and body.

## Idioms

| NestJS                                                                           | vibe.js                                                                                   | What catches the old form                                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `@Injectable()` on a provider                                                    | A plain class listed in `providers`                                                       | `@Injectable` is not exported, a compile error; see [Providers](../server/modules.md#providers)                |
| Constructor injection: `constructor(private db: Db)`                             | `private readonly db = inject(Db)`                                                        | [VIBE9104](/errors/VIBE9104) at startup                                                                        |
| `@Inject(TOKEN)` with a string or symbol token                                   | `token<T>('Name')` and `inject(Token)`                                                    | [VIBE9102](/errors/VIBE9102) when the token is not provided                                                    |
| `@Global()`                                                                      | `@Module({ global: true })`                                                               | [VIBE9102](/errors/VIBE9102) when a module relies on it                                                        |
| `@Get()`, `@Post(':id')` on methods                                              | A route in `defineContract`, served by `@Handle(contract.route)`                          | [VIBE9303](/errors/VIBE9303) for a route without a handler                                                     |
| `@Controller('users')`                                                           | `@Controller(contract)`; the path prefix is part of the contract                          | [VIBE9302](/errors/VIBE9302) for a controller without a contract                                               |
| `@Body()`, `@Param()`, `@Query()`, `@Headers()`, `@Req()`                        | `ctx.body`, `ctx.params`, `ctx.query`, `ctx.headers`, `ctx.req`                           | [TS1241 on @Handle](../server/handlers.md#ts1241-on-handle) for a signature that does not match the route      |
| `ValidationPipe`, DTO classes, `ParseIntPipe`                                    | Standard Schema schemas in the contract: `body`, `query`, `params`                        | 400 `VALIDATION_FAILED` before the handler runs; see [Validation](../server/handlers.md#validation)            |
| `NotFoundException` and other exception classes                                  | `ctx.fail('CODE', detail?)` with `errors: { CODE: 404 }` in the contract, or `HttpError`  | [VIBE9502](/errors/VIBE9502) for a code that the route does not declare                                        |
| `NestFactory.create(AppModule)`                                                  | `VibeFactory.create(AppModule, appOptions)`, then `listen()`                              | [VIBE9405](/errors/VIBE9405) for an invalid `basePath` (the global prefix)                                     |
| `app.useGlobalGuards()`, `app.useGlobalInterceptors()`, `app.useGlobalFilters()` | `guards`, `interceptors` and `filters` in `AppOptions`                                    | [VIBE9102](/errors/VIBE9102) when a global enhancer injects a token the root module cannot see                 |
| `app.use()` and Express middleware                                               | `Middleware`: `(req, next) => Promise<Response>` on Fetch `Request` and `Response`        | [VIBE9404](/errors/VIBE9404) for an invalid `cors()` setup; see [Middleware](../server/pipeline.md#middleware) |
| `@SetMetadata()` and `Reflector`                                                 | `createMetadata<T>(name)` and `ctx.getMetadata(key)`                                      | [VIBE9307](/errors/VIBE9307) on a static method                                                                |
| `@nestjs/testing`                                                                | `Test.createTestingModule()` from `@vibejs-org/server/testing`, with `overrideProvider()` | [VIBE9701](/errors/VIBE9701) for an override that replaces nothing                                             |
| Supertest against `app.getHttpServer()`                                          | `createClient(contracts, { baseUrl: '/api', fetch: app.fetch })`                          | [VIBE9091](/errors/VIBE9091) for a call without a path param                                                   |
| `@nestjs/swagger` decorators                                                     | `generateOpenApi(contracts, options)` from `@vibejs-org/server/openapi`                   | [VIBE9801](/errors/VIBE9801) for a schema that has no JSON Schema form                                         |
| `@nestjs/config` and `ConfigService.get()`                                       | `defineConfig(schema)`, a typed config class to provide and inject                        | [VIBE9601](/errors/VIBE9601) for missing or invalid variables                                                  |
| `reflect-metadata` and `emitDecoratorMetadata`                                   | Neither; only `experimentalDecorators: true`                                              | [VIBE9301](/errors/VIBE9301) when `experimentalDecorators` is off                                              |
| `forwardRef()` for circular providers                                            | Move the shared part into a third provider that both `inject()`                           | [VIBE9103](/errors/VIBE9103) for a provider cycle                                                              |
| `forRoot()` dynamic modules                                                      | The same: a static method that returns a `DynamicModule`                                  | [VIBE9201](/errors/VIBE9201) when the module class lacks `@Module()`                                           |

## A controller, side by side

The NestJS controller

```text
@Controller('todos')
export class TodosController {
  constructor(private readonly todos: TodosService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    const todo = this.todos.find(id);
    if (!todo) throw new NotFoundException();
    return todo;
  }
}
```

becomes a contract and a controller:

```ts
import { defineContract, get } from '@vibejs-org/contract';
import { Controller, Handle, inject, type Ctx } from '@vibejs-org/server';
import * as v from 'valibot';
const Todo = v.object({ id: v.string(), title: v.string() });
class TodosService {
  find(id: string): v.InferOutput<typeof Todo> | undefined {
    return id === '1' ? { id, title: 'a' } : undefined;
  }
}
// ---cut---
export const todos = defineContract('/todos', {
  findOne: get('/:id', { response: Todo, errors: { TODO_NOT_FOUND: 404 } }),
});

@Controller(todos)
export class TodosController {
  private readonly todos = inject(TodosService);

  @Handle(todos.findOne)
  findOne(ctx: Ctx<typeof todos.findOne>): v.InferOutput<typeof Todo> {
    return this.todos.find(ctx.params.id) ?? ctx.fail('TODO_NOT_FOUND');
  }
}
```

The UI calls the same route with `api.todos.findOne({ params: { id } })` and narrows the result to `TODO_NOT_FOUND` with status 404.

## Not in vibe.js v0.1

- Request-scoped and transient providers: every provider is a singleton. Per-request values go on `ctx.state`.
- Parameter decorators and custom pipes: a handler has one `ctx`, and schemas transform inputs.
- Microservices, WebSockets, GraphQL and the CLI schematics of NestJS.
