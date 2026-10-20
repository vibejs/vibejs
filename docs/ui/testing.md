---
title: Testing components
description: Test .vibe components and composables in Vitest with mount, wrappers, CSS selectors, events, props and the router.
---

# Testing components

Component tests run in Vitest with jsdom. `@vibejs-org/ui/testing` mounts a component in a real app, returns a wrapper to query and drive the rendered DOM, and cleans up after each test.

## Setup

The `vibe()` plugin compiles `.vibe` files for the tests as it does for the app:

```ts
import { vibe } from '@vibejs-org/compiler/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vibe()],
  test: {
    environment: 'jsdom',
    include: ['ui/src/**/*.test.ts'],
  },
});
```

The app template already has this config. Tests sit next to the component: `Counter.test.ts` next to `Counter.vibe`.

## Mounting

```ts
import { mount } from '@vibejs-org/ui/testing';
import { expect, it } from 'vitest';
import Counter from './Counter.vibe';

it('counts clicks', async () => {
  const wrapper = mount(Counter, { props: { start: 1 } });
  await wrapper.get('button').trigger('click');
  expect(wrapper.get('button').text()).toBe('Count: 2');
});
```

`mount(component, options)` takes:

- `props`: the props, including `on*` listeners. Required when the component has required props.
- `slots`: slot content by name, as text, a component, or a function of the slot props that returns text or nodes.
- `provide`: values the app provides, by key, such as `{ [API]: api }` for an `InjectionKey`.
- `plugins`: plugins the app installs, in order, such as the router.
- `attachTo`: where the host element is appended, an element or a selector; `document.body` by default.

Other options fail with [VIBE7206](/errors/VIBE7206), which names the replacement.

A component mounted in a test body or a `beforeEach` unmounts when the test finishes. When a test fails, its error ends with the rendered HTML of each mounted component. A component mounted in `beforeAll` stays until you call `wrapper.unmount()`.

## Finding elements

Wrappers query the rendered DOM with CSS selectors:

- `get(selector)` returns the first match, or fails with [VIBE7201](/errors/VIBE7201) and the rendered HTML.
- `find(selector)` returns the first match, or a wrapper whose `exists()` is `false`; using it fails with [VIBE7202](/errors/VIBE7202).
- `findAll(selector)` returns every match in document order.

A wrapper reads its element with `text()`, `html()`, `attributes(name?)`, `classes(name?)`, `isVisible()` and `exists()`, and `element` is the DOM element itself. Select by what the user sees and by stable hooks: element names, roles and labels as attributes, classes, or `data-test` attributes.

```ts
import { mount } from '@vibejs-org/ui/testing';
import { expect } from 'vitest';
import TodoList from './TodoList.vibe';
// ---cut---
const wrapper = mount(TodoList);
expect(wrapper.findAll('li')).toHaveLength(3);
expect(wrapper.get('li.done').text()).toBe('Write the tests');
expect(wrapper.get('[aria-label="New todo"]').attributes('placeholder')).toBe('What next?');
expect(wrapper.find('.empty').exists()).toBe(false);
```

`wrapper.element` and every element of `findAll()` are plain DOM elements, so any DOM testing library works on them too.

## Events and input

`trigger(event, init?)` dispatches a bubbling, cancelable event of the right class, and `setValue(value)` sets an input, a textarea, a checkbox, a radio button or a select, then fires the events that `v-model` listens to. Both wait for the DOM update.

```ts
import { mount } from '@vibejs-org/ui/testing';
import { expect } from 'vitest';
import TodoList from './TodoList.vibe';
// ---cut---
const wrapper = mount(TodoList);
await wrapper.get('input').setValue('Ship it');
await wrapper.get('input').trigger('keydown', { key: 'Enter' });
expect(wrapper.findAll('li').at(-1)?.text()).toBe('Ship it');
```

A key or a modifier goes in the event init, never in the event name: `trigger('keydown.enter')` fails with [VIBE7203](/errors/VIBE7203). A disabled element receives no event.

## Props and events

`setProps(props)` assigns props and waits for the update. `emitted()` returns the arguments of every event the component emitted, by event name, typed by `defineEmits`.

```ts
import { mount } from '@vibejs-org/ui/testing';
import { expect } from 'vitest';
import Picker from './Picker.vibe';
// ---cut---
const wrapper = mount(Picker, { props: { options: ['a', 'b'] } });
await wrapper.setProps({ options: ['a', 'b', 'c'] });
await wrapper.findAll('button')[2].trigger('click');
expect(wrapper.emitted('pick')).toEqual([['c']]);
```

## Waiting for async work

`flushPromises()` resolves after the pending promise callbacks ran, and with them the DOM updates they caused. Await it after anything that loads data. It also works with `vi.useFakeTimers()`.

```ts
import { flushPromises, mount } from '@vibejs-org/ui/testing';
import { expect } from 'vitest';
import UserCard from './UserCard.vibe';
// ---cut---
const wrapper = mount(UserCard, { props: { id: 1 } });
await flushPromises();
expect(wrapper.get('h2').text()).toBe('Ada');
```

## Composables

`mountComposable(fn, options?)` runs `fn` as the setup of a component, so it can use `inject()`, lifecycle hooks and watchers, and returns its `result`. It takes `provide` and `plugins` and unmounts like `mount()`.

```ts
import { nextTick, ref, watch } from '@vibejs-org/ui';
import { mountComposable } from '@vibejs-org/ui/testing';
import { expect } from 'vitest';

function useHistory<T>(initial: T) {
  const value = ref(initial);
  const past: T[] = [];
  watch(value, (_, old) => past.push(old));
  return { value, past };
}

const { result } = mountComposable(() => useHistory(1));
result.value.value = 2;
await nextTick();
expect(result.past).toEqual([1]);
```

## Testing with the router

Install a router with a memory history through `plugins`, then wait for the first navigation with `router.isReady()`. Use the app's own routes, imported from `routes.ts`, so that the test covers the real records:

```ts
import type { RouteRecordRaw } from '@vibejs-org/ui/router';
declare const routes: RouteRecordRaw[];
// ---cut---
import { createMemoryHistory, createRouter } from '@vibejs-org/ui/router';
import { flushPromises, mount } from '@vibejs-org/ui/testing';
import { expect, it } from 'vitest';
import App from '../App.vibe';

it('opens a user from the list', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes });
  const wrapper = mount(App, { plugins: [router] });
  await router.isReady();

  await wrapper.get('a[href="/users/1"]').trigger('click');
  await flushPromises();
  expect(router.currentRoute.value.fullPath).toBe('/users/1');
  expect(wrapper.get('h1').text()).toBe('User 1');
});
```

To start on another route, `await router.push('/users/1')` after `router.isReady()`. `await router.push()` waits for the guards and the lazy page; after a navigation that loads data, also await `flushPromises()`.

## Replacing a child component

Children render as they do in the app. To keep a heavy child out of a test, mock its module with Vitest:

```ts
import { vi } from 'vitest';

vi.mock('./Chart.vibe', () => import('./test/ChartStub.vibe'));
```

`ChartStub.vibe` is a small component with the same props, such as `<div class="chart-stub" />`.

## Coverage

`vibejs check` reports the coverage of every file and warns with [VIBE8302](/errors/VIBE8302) below 100%. To make full coverage a requirement, uncomment the threshold line in `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
// ---cut---
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: { 100: true, perFile: true },
    },
  },
});
```
