---
title: UI essentials
description: Write a .vibe component, mount the app, handle errors and warnings, and find the pages on reactivity, templates, components, lifecycle and provide/inject.
---

# UI essentials

The UI of a vibe.js app is made of components written in `.vibe` files and the reactive state they read. Everything a component imports comes from `@vibejs-org/ui`; the compiler and the language tools type-check the script and the template together.

## A component

A `.vibe` file has up to three blocks: the setup script, the template and the scoped styles.

```vibe
<script setup lang="ts">
import { computed, ref } from '@vibejs-org/ui';

const { label = 'Count' } = defineProps<{ label?: string }>();

const count = ref(0);
const doubled = computed(() => count.value * 2);
</script>

<template>
  <button type="button" @click="count++">{{ label }}: {{ count }} (twice: {{ doubled }})</button>
</template>

<style scoped>
button {
  font-weight: 600;
}
</style>
```

- `<script setup lang="ts">` runs once for each instance of the component. Its top-level bindings and imports are available in the template, and refs are unwrapped there: the template writes `count`, the script writes `count.value`.
- `<template>` describes the DOM. It is compiled to code that creates the elements once and updates only the text, attributes and lists that read changed state.
- `<style scoped>` applies only to the elements of this component.

`defineProps` and the other `define*` calls are compiler macros: they are available without an import. [Components](./components.md) lists them.

## Mounting the app

`createApp()` takes the root component; `mount()` renders it into an element or the element a selector matches, replacing its content.

```ts
import { createApp, type Component } from '@vibejs-org/ui';
declare const App: Component;
// ---cut---
const app = createApp(App);

app.config.errorHandler = (err, instance, info) => {
  console.error(`Error in ${instance?.name ?? 'the app'} (${info})`, err);
};
app.config.warnHandler = (message, instance, trace) => {
  console.warn(message, trace);
};

app.mount('#app');
```

In a real app, `App` is the default import of `./App.vibe`.

- `errorHandler` receives every error that no `onErrorCaptured` hook stopped: errors thrown in setup, in a render, in a watcher, in an event handler or in a lifecycle hook. `info` names the source, such as `'setup function'` or `'native event handler'`. Without a handler, the error is logged as [VIBE5102](/errors/VIBE5102).
- `warnHandler` receives the development warnings instead of the console, with the trace of component names. Warnings are not emitted in production builds.
- `app.unmount()` unmounts the root component and removes its nodes.

## Hot updates

In development, saving a `.vibe` file updates the running page without a reload:

- An edit of the template re-renders each instance of the component and keeps its setup state. Child components rendered by that template are created again, so their own state starts over.
- An edit of the script mounts the component again, with new state.

## Where to go next

- [Reactivity](./reactivity.md): `ref`, `reactive`, `computed`, `watch` and the other primitives.
- [Template syntax](./template-syntax.md): interpolation, bindings, events, conditions, lists, `v-model` and template refs.
- [Components](./components.md): props, events, slots, models, attributes and exposed values.
- [Lifecycle](./lifecycle.md): the lifecycle hooks, their order and error handling.
- [Provide and inject](./provide-inject.md): passing values down the component tree.
- [Extending vibe.js](../guides/extending.md): plugins and composables.
