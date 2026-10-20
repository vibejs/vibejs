---
title: Data loading
description: Load data with useAsync, keep it in sync with the route, abort stale requests, narrow typed API results and share state between components.
---

# Data loading

`useAsync()` from `@vibejs-org/ui` loads data in a component and keeps it current. Together with the typed API client, every request is aborted when it is no longer needed, and every outcome, failures included, is a typed value.

## useAsync

`useAsync(fn)` calls `fn(signal)` right away and returns four values:

- `data`: a ref with the value that the last run resolved to, or `undefined` before the first one finished.
- `error`: a ref with what the last run threw, or `undefined`.
- `loading`: a ref that is `true` while a run is in progress.
- `refresh()`: runs `fn` again; the promise resolves once that run is over and never rejects.

```vibe
<script setup lang="ts">
import { inject, useAsync } from '@vibejs-org/ui';
import { useRoute } from '@vibejs-org/ui/router';
import { API } from '../api.ts';

const api = inject(API)!;
const route = useRoute('todo');
const { data, loading, refresh } = useAsync((signal) =>
  api.todos.one({ params: { id: route.params.id } }, { signal }),
);
</script>

<template>
  <p v-if="loading">Loading…</p>
  <article v-else-if="data?.ok">
    <h1>{{ data.data.title }}</h1>
    <button type="button" @click="refresh()">Reload</button>
  </article>
  <p v-else-if="data" role="alert">{{ data.error.code }}</p>
</template>
```

`API` is the injection key under which the app provides its client.

## Tracking and reruns

`fn` runs again when a reactive value that it read **before its first `await`** changes. Above, `route.params.id` is read synchronously, so moving from `/todos/1` to `/todos/2` loads the new todo while the page stays on screen. A value read after an `await` is not tracked: read every input first, then await.

```ts
import { ref, useAsync } from '@vibejs-org/ui';
declare function search(q: string, page: number, signal: AbortSignal): Promise<string[]>;
// ---cut---
const query = ref('');
const page = ref(1);

const results = useAsync(async (signal) => {
  const q = query.value; // tracked
  const p = page.value; // tracked
  return search(q, p, signal);
});
```

## Aborting

Each run gets its own `AbortSignal`. When a new run starts, the previous signal aborts; when the component unmounts, the current one aborts. Pass the signal to the client call, `{ signal }`, or to `fetch`, so that the request stops. An aborted run never writes `data`, `error` or `loading`, so a slow response can never overwrite a newer one.

`useAsync()` belongs in setup or in a composable that setup calls; it needs a component or an effect scope that owns it ([VIBE7301](/errors/VIBE7301)).

## Typed results

The API client never rejects for an HTTP or network failure: each call resolves to a result that is either `{ ok: true, data }` or `{ ok: false, error }`. So with the client, failures arrive in `data`, and `error` holds only real bugs, such as an exception in `fn`.

Narrow on `ok` before reading the payload: in the template with `v-if="data?.ok"`, and in the script with `data.value?.ok`.

```ts
import { computed, useAsync } from '@vibejs-org/ui';
type Result = { ok: true; data: { status: 'ok' } } | { ok: false; error: { code: string } };
declare function health(options: { signal: AbortSignal }): Promise<Result>;
// ---cut---
const { data } = useAsync((signal) => health({ signal }));

const status = computed(() =>
  data.value?.ok ? data.value.data.status : (data.value?.error.code ?? 'checking'),
);
```

`error.code` is one of the codes that the route declares in its contract, or a client code such as `NETWORK_ERROR`, so a `switch` over it is checked by TypeScript.

## Shared state

State that several components read, such as the signed-in user or a cart, lives in a module: create it once at module scope and expose it through a composable.

```ts
import { computed, readonly, ref } from '@vibejs-org/ui';

interface Item {
  id: number;
  price: number;
}

const items = ref<Item[]>([]);
const total = computed(() => items.value.reduce((sum, item) => sum + item.price, 0));

export function useCart() {
  return {
    items: readonly(items),
    total,
    add(item: Item) {
      items.value.push(item);
    },
    clear() {
      items.value = [];
    },
  };
}
```

Every component that calls `useCart()` reads and changes the same state, and the template unwraps the refs as usual. Keep the writes in the composable's functions, so that every change goes through one place. In tests, reset the state with `clear()` in a `beforeEach`, because the module stays loaded between tests of the same file.

For state that belongs to one part of the tree, or that a test must replace, provide it with `provide()` and read it with `inject()` instead.

## See also

- [Routing](./routing.md): params, guards and lazy pages.
- [Testing components](./testing.md#waiting-for-async-work): `flushPromises()` after data loads.
