---
title: Tutorial
description: Build a users API and a page that lists the users, find a template type error with vibejs check, then build, serve and develop the app.
order: 2
---

# Tutorial

In this tutorial you add a `users` API to a new app, write a page that lists the users, let `vibejs check` catch a type error in a template, then build and serve the app. It takes about ten minutes. You need Node.js `^24.15.0 || >=26` and pnpm.

Every command and file on this page is run, in this order, by the vibe.js test suite on each change, so the steps work as written.

## 1. Create the app

```sh
pnpm create vibejs my-app
cd my-app
```

The app has three parts: `contracts/` for the API contracts, `server/` for the server and `ui/` for the UI. See [Getting started](./getting-started.md) for the layout and the editor setup.

## 2. Check it

```sh
pnpm vibejs check
```

`vibejs check` runs the type checker on the TypeScript and the `.vibe` templates, the linter, the format check and the tests with coverage. A new app passes with every file fully covered.

## 3. Generate a resource, a page and a component

```sh
pnpm vibejs g resource users
pnpm vibejs g page Users
pnpm vibejs g component UserCard
pnpm vibejs check
```

Each generator writes its files with tests, and registers them where they belong:

- `g resource users` writes the contract `contracts/src/users.contract.ts` with routes to list, get, create, update and remove users, and a server module with a controller, an in-memory service and a test. It adds the module to `server/src/app.module.ts` and the contract to the UI's API client in `ui/src/api.ts`.
- `g page Users` writes `ui/src/pages/UsersPage.vibe` with a test, and adds the route `/users` to `ui/src/routes.ts`.
- `g component UserCard` writes `ui/src/components/UserCard.vibe`, a component with a `title` prop, and its test.

A contract declares each route once, with its params, body, response and errors, and both sides are typed from it. The contract of the example todo app looks the same:

<<< @/../examples/todo/contracts/src/todos.contract.ts

The server handles each route of the contract with a typed handler ([Controllers and handlers](../server/handlers.md)), and the UI calls it through a typed client without code generation ([Contracts](../server/contracts.md)). Generators never overwrite your changes: run one again and it skips the files that exist.

## 4. List the users

Make the page load the users from the API and show one `UserCard` per user, numbered. First, the test of the page: it mounts the app at `/users` with an API client whose `fetch` answers with one user.

```ts [ui/src/pages/UsersPage.test.ts]
import { createMemoryHistory, createRouter } from '@vibejs-org/ui/router';
import { flushPromises, mount } from '@vibejs-org/ui/testing';
import { expect, it } from 'vitest';
import App from '../App.vibe';
import { API, createApi } from '../api.ts';
import { routes } from '../routes.ts';

it('lists the users from the API at /users', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes });
  const api = createApi(async () => Response.json([{ id: '1', name: 'Ada' }]));
  const wrapper = mount(App, { plugins: [router, (app) => void app.provide(API, api)] });
  await router.push('/users');
  await flushPromises();
  expect(wrapper.get('h1').text()).toBe('Users');
  expect(wrapper.findAll('.user-card').map((card) => card.text())).toEqual(['1. Ada']);
});
```

Then the page. `useAsync` loads the list when the page mounts, and the client's result is either `{ ok: true, data }` or `{ ok: false, error }` ([Data loading](../ui/data.md)). This first version has a mistake:

```vibe [ui/src/pages/UsersPage.vibe]
<script setup lang="ts">
import { computed, inject, useAsync } from '@vibejs-org/ui';
import { API } from '../api.ts';
import UserCard from '../components/UserCard.vibe';

const api = inject(API)!;
// Loads the users on mount; a failed request shows an empty list.
const { data } = useAsync((signal) => api.users.list(undefined, { signal }));
const users = computed(() => (data.value?.ok ? data.value.data : []));
</script>

<template>
  <h1>Users</h1>
  <UserCard v-for="(user, index) in users" :key="user.id" :title="index + 1" />
</template>
```

## 5. Let check find the mistake

```sh exit=1
pnpm vibejs check
```

The check fails. Templates are type-checked like TypeScript, so the type error is reported at its line and column in the `.vibe` file. The page's test fails as well, because the card shows `1`:

```txt
ui/src/pages/UsersPage.vibe:14:60  error  TS2322  Type 'number' is not assignable to type 'string'.
ui/src/pages/UsersPage.test.ts:8:1  error  test-failed  AssertionError: expected [ '1' ] to deeply equal [ '1. Ada' ]
```

`title` is a `string` prop and `index + 1` is a number. Your editor shows the same error while you type. Pass a string:

```vibe [ui/src/pages/UsersPage.vibe]
<script setup lang="ts">
import { computed, inject, useAsync } from '@vibejs-org/ui';
import { API } from '../api.ts';
import UserCard from '../components/UserCard.vibe';

const api = inject(API)!;
// Loads the users on mount; a failed request shows an empty list.
const { data } = useAsync((signal) => api.users.list(undefined, { signal }));
const users = computed(() => (data.value?.ok ? data.value.data : []));
</script>

<template>
  <h1>Users</h1>
  <UserCard v-for="(user, index) in users" :key="user.id" :title="`${index + 1}. ${user.name}`" />
</template>
```

```sh
pnpm vibejs check
```

The check passes again, tests and full coverage included.

## 6. Build and serve

```sh
pnpm vibejs build
pnpm start
```

`vibejs build` writes the UI to `ui/dist` and the server to `server/dist/main.js`. `pnpm start` runs the built server on port 3000, or on the port in `PORT`: `/api/health` answers `{"status":"ok"}` and `/api/users` answers the list of users, empty for now. Stop it with Ctrl+C. The two outputs are deployed separately: the UI as static files, the server as a Node.js process ([Deploying](../server/index.md#deploying)).

## 7. Develop

```sh
pnpm dev
```

`pnpm dev` serves the UI and the API on one port and prints its URL; open `/users` on it. Keep it running while you work:

- Edit `ui/src/components/UserCard.vibe`, for example its markup: the page updates in place and keeps its state.
- Edit a file under `server/`, for example the service: the server restarts in well under a second and the next request reaches the new code.
- Errors of the build, the browser and the server go to `.vibejs/dev.log`; `pnpm vibejs errors` lists them.

A second `pnpm dev` in the same app reports the running server instead of starting another one.

## Next

- [Routing](../ui/routing.md) and [Testing components](../ui/testing.md) for the UI.
- [Server](../server/index.md) and [Modules and providers](../server/modules.md) for the server.
- [CLI and AI agents](./ai-agents.md) to let a coding agent work on the app with the same commands.
