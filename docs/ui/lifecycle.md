---
title: Lifecycle
description: The lifecycle hooks of a component, the order in which they run, and how errors travel through onErrorCaptured to app.config.errorHandler.
---

# Lifecycle

A component's setup runs once, when the component is created. The lifecycle hooks register functions that run at later points. They are called during setup, synchronously: a hook called anywhere else, such as after an `await`, warns VIBE5205.

```vibe
<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUpdated, ref, useTemplateRef } from '@vibejs-org/ui';

const box = useTemplateRef<HTMLDivElement>('box');
const width = ref(0);
const observer = new ResizeObserver(([entry]) => (width.value = entry?.contentRect.width ?? 0));

onMounted(() => {
  if (box.value) observer.observe(box.value);
});
onUpdated(() => console.log('rendered', width.value));
onBeforeUnmount(() => observer.disconnect());
</script>

<template>
  <div ref="box">{{ width }}px wide</div>
</template>
```

## The hooks

| Hook              | Runs                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `onBeforeMount`   | after the component's DOM is created, before it is inserted into the document |
| `onMounted`       | after the DOM is inserted; template refs are set                              |
| `onBeforeUpdate`  | before a state change updates the component's DOM                             |
| `onUpdated`       | after the update, once per batch of changes                                   |
| `onBeforeUnmount` | before the component is removed; the DOM and template refs are still there    |
| `onUnmounted`     | after the component is removed and its watchers are stopped                   |
| `onErrorCaptured` | when a descendant throws; see [Errors](#errors)                               |

Effects that set up something outside the component, such as listeners on `window`, a timer or an observer, start in `onMounted` and stop in `onBeforeUnmount` or `onUnmounted`. Watchers and computed values created in setup stop by themselves. `onScopeDispose()` registers a cleanup that runs at unmount too, and also works in composables called outside a component.

## Hook order

- **Mounting:** each component creates its DOM, then runs `onBeforeMount`, then inserts the DOM. A child creates and inserts its DOM while its parent builds its own, so a child's `onBeforeMount` and `onMounted` run before its parent's. When `onMounted` runs, the whole subtree is in the document.
- **Updating:** a state change re-runs only the bindings that read it, in a batch before the browser paints. `onBeforeUpdate` and `onUpdated` run for each component whose template bindings run in that batch.
- **Unmounting:** a parent's `onBeforeUnmount` runs before its children's; `onUnmounted` hooks run after the DOM is removed.

`onBeforeMount` runs after the DOM is built, so template refs already point at the elements, which are not yet in the document: they have no layout and no size.

## Errors

An error thrown in setup, in a template binding, in a watcher, in an event handler or in a hook travels up the component tree:

1. Each ancestor's `onErrorCaptured(err, instance, info)` hook runs, nearest first. `instance` is the component where the error happened and `info` names the source, such as `'render effect'` or `'native event handler'`. Returning `false` stops the error there.
2. If no hook stopped it, `app.config.errorHandler` receives it.
3. Without an `errorHandler`, the error is logged as [VIBE5102](/errors/VIBE5102), with the component trace in development.

```vibe
<script setup lang="ts">
import { onErrorCaptured, ref } from '@vibejs-org/ui';
import Chart from './Chart.vibe';

const failed = ref(false);

onErrorCaptured((err, instance, info) => {
  console.warn(`${instance?.name ?? 'A component'} failed in ${info}`, err);
  failed.value = true;
  return false;
});
</script>

<template>
  <p v-if="failed">The chart is not available.</p>
  <Chart v-else />
</template>
```

A component whose setup or render throws renders nothing, and the rest of the page keeps working. Setup cannot be `async`, and `<script setup>` cannot `await` at the top level ([VIBE3002](/errors/VIBE3002), [VIBE5204](/errors/VIBE5204)): start the work in setup and store the result in a ref when it arrives.
