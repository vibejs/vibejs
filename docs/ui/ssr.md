---
title: Server rendering
description: Render a component tree to one HTML document with renderToString, including the head records from useHead.
---

# Server rendering

`renderToString()` runs the same component code that `mount()` runs in the browser and returns one complete HTML document. There is no second compiler and no streamed HTML. This render does not start the router: the root is a component tree.

`useHead()` records are written into the document head. `mount()` is unchanged and remains the way a SPA starts.

```ts
import { createApp, createHead, type Component } from '@usevibejs/ui';
import { renderToString } from '@usevibejs/ui/server';

declare const App: Component;

const html = renderToString(createApp(App).use(createHead()));
```

`renderToString()` mounts the app once, reads the document, and unmounts it. The same app cannot be mounted again. A second call throws [VIBE5306](/errors/VIBE5306). Create a new app for each render.

`hydrate()` attaches a new app to the nodes that string already contains. The same nodes stay when the client render matches. A different tag or text throws [VIBE5307](/errors/VIBE5307) and the container is left as it was. `mount()` still replaces its container.

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
