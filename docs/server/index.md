---
title: Server
description: The layout of a vibe.js server application, how it is created, served and shut down, and what is deployed.
---

# Server

A vibe.js server is a tree of modules. The root module imports feature modules; each module lists its providers and controllers; each controller serves one contract. The server is built on the Fetch API: an application is a `fetch(Request): Promise<Response>` function that also listens on Node.

## Application layout

```
contracts/src/todos.contract.ts     the contract shared with the UI
server/src/app.module.ts            AppModule and appOptions
server/src/main.ts                  creates the app and listens
server/src/todos/todos.module.ts    a feature module
server/src/todos/todos.controller.ts
server/src/todos/todos.service.ts
```

`server/src/app.module.ts` exports the root module and the application options. The dev server, the tools and the tests import this file, so it has no side effects:

```ts
import { Module, type AppOptions } from '@vibejs-org/server';
// ---cut---
@Module({ imports: [] })
export class AppModule {}

export const appOptions: AppOptions = { basePath: '/api' };
```

`server/src/main.ts` is the production entry. It creates the application, closes it on `SIGTERM` and `SIGINT`, and listens:

```ts
import { Module, VibeFactory, type AppOptions } from '@vibejs-org/server';
declare const process: { env: Record<string, string | undefined> };
@Module({})
class AppModule {}
const appOptions: AppOptions = { basePath: '/api' };
// ---cut---
const app = await VibeFactory.create(AppModule, appOptions);
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 3000));
```

## Creating the application

`VibeFactory.create(root, options)` scans the module graph, creates every provider and controller, and runs the `onModuleInit` and `onApplicationBootstrap` hooks. It does not listen. A graph error, such as a missing provider ([VIBE9102](/errors/VIBE9102)) or an unhandled route ([VIBE9303](/errors/VIBE9303)), rejects `create` before any request is served.

The created `App`:

| Member                          | What it does                                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch(req)`                    | Handles one request. It is bound, so it can be passed on as a plain function.                                                                                                     |
| `request(path, init?)`          | Sends a request in process; `init.json` sets a JSON body.                                                                                                                         |
| `listen(port?, hostname?)`      | Serves the app over HTTP on Node; the port defaults to 3000.                                                                                                                      |
| `enableShutdownHooks(signals?)` | Calls `close()` on each signal, then re-raises it.                                                                                                                                |
| `close(signal?)`                | Rejects new requests with 503, waits for running ones up to `shutdownTimeout`, stops the server and runs `onModuleDestroy` and `onApplicationShutdown`. Calling it twice is safe. |
| `get(token)`                    | Reads a provider, for scripts and tests.                                                                                                                                          |
| `inspect()`                     | Lists the routes and modules, for tools.                                                                                                                                          |

`inspect(root, options)` returns the same description without creating the application: no provider, controller, enhancer or hook runs, so tools and tests can read the graph safely.

```ts
import { inspect, Module } from '@vibejs-org/server';
@Module({})
class AppModule {}
// ---cut---
const { routes, modules } = inspect(AppModule, { basePath: '/api' });
console.log(routes.map((r) => `${r.method} ${r.path} -> ${r.handler}`));
console.log(modules.map((m) => m.path));
```

## Deploying

`vibejs build` writes two deployables:

- `ui/dist`: the static UI, served by any static file host or CDN.
- `server/dist/main.js`: the server, run with `node server/dist/main.js`. It reads `PORT` and answers under `/api`.

Route `/api` to the server and everything else to the static files. During development, `vibejs dev` serves both on one port.

## Next

- [Modules and providers](./modules.md)
- [Contracts](./contracts.md)
- [Handlers](./handlers.md)
- [Middleware, guards, interceptors and filters](./pipeline.md)
- [Configuration](./configuration.md)
- [Testing](./testing.md)
