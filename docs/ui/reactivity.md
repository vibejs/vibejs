---
title: Reactivity
description: Reactive state with ref, shallowRef, reactive, readonly and computed; side effects with watch and watchEffect; effect scopes, nextTick and shared state in composables.
---

# Reactivity

Reactive values record who reads them. When a value changes, the computed values, watchers and template bindings that read it run again, and nothing else does. All of these functions are imported from `@usevibejs/ui`.

## ref

`ref()` holds one value in `.value`. An object value is made deeply reactive, so changes to its nested properties are tracked too.

```ts
import { ref } from '@usevibejs/ui';

const count = ref(0);
count.value++;

const user = ref({ name: 'Ada', tags: ['admin'] });
user.value.tags.push('editor'); // tracked
```

`ref<T>()` without an argument holds `T | undefined`. In a template, and in a `reactive()` object, a ref is unwrapped: the template writes `count`, not `count.value`.

## shallowRef

`shallowRef()` tracks only the assignment of `.value`. Use it for large values that are replaced rather than changed in place, and for objects that must stay plain, such as class instances of a library.

```ts
import { shallowRef, triggerRef } from '@usevibejs/ui';

const rows = shallowRef<number[]>([]);
rows.value = [...rows.value, 1]; // tracked

rows.value.push(2); // not tracked
triggerRef(rows); // runs what reads rows now
```

`markRaw(object)` keeps an object plain wherever it is stored, even inside reactive state.

## reactive and readonly

`reactive()` returns a deeply reactive proxy of an object, an array, a `Map` or a `Set`. Nested refs are unwrapped when read.

```ts
import { reactive, readonly, ref } from '@usevibejs/ui';

const state = reactive({ count: ref(0), items: new Map<string, number>() });
state.count++; // no .value: the nested ref is unwrapped
state.items.set('a', 1);

const view = readonly(state);
// view.count++ fails to type-check, and warns VIBE5002 at runtime
```

- A proxy is not the original object: compare with `toRaw(value)` when identity matters.
- Replacing a whole `reactive()` object loses the connection; keep it in a `ref()` instead, or change its properties.
- `shallowReactive()` and `shallowReadonly()` apply only to the top-level properties.
- `isRef()`, `isReactive()`, `isReadonly()`, `isShallow()` and `isProxy()` test a value.

## computed

`computed()` derives a value from other reactive values. It runs only when read after one of its sources changed, and its result is cached until then.

```ts
import { computed, ref } from '@usevibejs/ui';

const first = ref('Ada');
const last = ref('Lovelace');

const full = computed(() => `${first.value} ${last.value}`);

const editable = computed({
  get: () => `${first.value} ${last.value}`,
  set(value: string) {
    [first.value = '', last.value = ''] = value.split(' ');
  },
});
editable.value = 'Grace Hopper';
```

A computed with only a getter is readonly. The getter receives the previous value, which helps return the same object when nothing relevant changed. A getter should not change state; use a watcher for that.

## watch

`watch(source, callback, options?)` calls `callback(value, oldValue, onCleanup)` when the source changes. A source is a ref, a computed, a getter, a reactive object or an array of these.

```ts
import { reactive, ref, watch } from '@usevibejs/ui';

const query = ref('');
const filters = reactive({ done: false });

watch(query, (value, oldValue) => {
  console.log(`query: ${oldValue} -> ${value}`);
});

// A getter watches part of an object.
watch(
  () => filters.done,
  (done) => console.log(done),
);

// An array watches several sources.
watch([query, () => filters.done], ([text, done]) => console.log(text, done));

// A reactive object is watched deeply.
watch(filters, (value) => console.log(value.done));
```

The options:

- `immediate: true` calls the callback once right away, with `undefined` as the old value.
- `deep: true` tracks nested values of a ref or getter source; a number tracks that many levels.
- `once: true` stops the watcher after the first call.
- `flush` sets when the callback runs: `'pre'` (the default) before the DOM updates, `'post'` after them, `'sync'` inside the assignment.

The returned handle stops the watcher when called, and has `stop()`, `pause()` and `resume()`. A watcher created in a component's setup stops when the component unmounts.

## watchEffect

`watchEffect(effect)` runs `effect` now and again whenever something it read changes. `watchPostEffect()` and `watchSyncEffect()` are the `'post'` and `'sync'` flush forms.

```ts
import { onWatcherCleanup, ref, watchEffect } from '@usevibejs/ui';

const id = ref(1);

watchEffect(() => {
  const controller = new AbortController();
  void fetch(`/api/items/${id.value}`, { signal: controller.signal });
  // Runs before the effect runs again, and when it stops.
  onWatcherCleanup(() => controller.abort());
});
```

`onWatcherCleanup()` registers a cleanup for the running watcher or effect. The `onCleanup` argument of the callback does the same and also works after an `await`.

## Effect scopes

Watchers and computed values created during `scope.run()` belong to the scope, and `scope.stop()` stops them all. A component's setup runs in its own scope, so most code never creates one. Use `effectScope()` for state that lives outside a component.

```ts
import { effectScope, onScopeDispose, ref, watch } from '@usevibejs/ui';

const scope = effectScope();

scope.run(() => {
  const width = ref(window.innerWidth);
  const update = () => (width.value = window.innerWidth);
  window.addEventListener('resize', update);
  onScopeDispose(() => window.removeEventListener('resize', update));
  watch(width, (value) => console.log(value));
});

scope.stop(); // stops the watcher and removes the listener
```

`onScopeDispose()` registers a cleanup on the current scope; in a component, it runs when the component unmounts. `getCurrentScope()` returns the current scope.

## nextTick

State changes update the DOM in a batch, before the browser paints. `await nextTick()` waits until the pending updates are applied.

```ts
import { nextTick, ref } from '@usevibejs/ui';

const open = ref(false);

async function show(): Promise<void> {
  open.value = true;
  await nextTick();
  document.querySelector<HTMLInputElement>('#search')?.focus();
}
```

## toRef, toRefs and toValue

These convert between refs, getters and plain values:

```ts
import { computed, reactive, toRef, toRefs, toValue, type MaybeRefOrGetter } from '@usevibejs/ui';

const state = reactive({ x: 0, y: 0 });

const x = toRef(state, 'x'); // a ref that reads and writes state.x
const { y } = toRefs(state); // a ref for every property
const label = toRef(() => `(${state.x}, ${state.y})`); // a readonly ref of a getter
x.value++;
y.value++;

// A function that accepts a value, a ref or a getter.
function useDouble(input: MaybeRefOrGetter<number>) {
  return computed(() => toValue(input) * 2);
}
console.log(useDouble(x).value, useDouble(() => state.y).value, useDouble(2).value, label.value);
```

`unref(value)` returns the value of a ref and any other value as it is.

## Shared state

A composable is a function that creates and returns reactive state. State created at module scope, outside any function, is shared by every component that imports it:

```ts
import { computed, ref } from '@usevibejs/ui';

interface Item {
  id: number;
  title: string;
}

// One cart for the whole app.
const items = ref<Item[]>([]);

export function useCart() {
  const count = computed(() => items.value.length);
  const add = (item: Item) => items.value.push(item);
  return { items, count, add };
}
```

Each call of `useCart()` returns the same `items`. Put the state inside the function instead to give each caller its own. For state that only part of the tree should share, [provide it](./provide-inject.md).
