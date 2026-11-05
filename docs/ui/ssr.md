---
title: Server rendering
description: Render one HTML document with renderToString, and wait for the first route with renderToStringAsync.
---

# Server rendering

`renderToString()` runs the same component code that `mount()` runs in the browser and returns one complete HTML document. There is no second compiler and no streamed HTML. This render does not wait for the router: the root is a component tree.

`useHead()` records are written into the document head. `mount()` is unchanged and remains the way a SPA starts.

```ts
import { createApp, createHead, type Component } from '@usevibejs/ui';
import { renderToString } from '@usevibejs/ui/server';

declare const App: Component;

const html = renderToString(createApp(App).use(createHead()));
```

`renderToString()` mounts the app once, reads the document, and unmounts it. The same app cannot be mounted again. A second call throws [VIBE5306](/errors/VIBE5306). Create a new app for each render.

`renderToStringAsync()` waits until the installed router's first navigation settles, then returns the same kind of document. A redirect or a lazy page is included. An app with no router renders the same tree as `renderToString()`. A navigation that throws rejects the render with that error. A guard that cancels the first navigation leaves the document on the start location.

`options.state` is a JSON value. It is written into `<script type="application/json" id="vibe-state">` in the head, with `<` escaped. `readServerState()` parses it. Pass the object returned by `dehydrate` from `@usevibejs/query`, and pass `readServerState()` to that package's `hydrate` before the client renders, so the query cache matches the document. A value JSON cannot write throws [VIBE5309](/errors/VIBE5309). Damaged JSON throws [VIBE5310](/errors/VIBE5310).

```ts
import { createApp, type Component } from '@usevibejs/ui';
import { renderToStringAsync } from '@usevibejs/ui/server';

declare const App: Component;
declare const router: { install(app: unknown): void };
declare const state: { queries: unknown[] };

const html = await renderToStringAsync(createApp(App).use(router), { state });
```

`hydrate()` attaches a new app to the nodes that string already contains. The same nodes stay when the client render matches. A different tag or text throws [VIBE5307](/errors/VIBE5307) and the container is left as it was. `mount()` still replaces its container. `hydrateAsync()` waits for the same first navigation, then hydrates, so a routed page matches the server HTML.

```ts
import { createApp, hydrate, type Component } from '@usevibejs/ui';

declare const App: Component;
declare const root: HTMLElement;

hydrate(createApp(App), root);
```

```vibe
<script setup lang="ts">
import { useHead } from '@usevibejs/ui';

useHead({ title: 'Hello' });
</script>

<template>
  <p>Hello</p>
</template>
```
