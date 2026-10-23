---
title: Coming from vue-router and Vue Test Utils
description: The vue-router and Vue Test Utils idioms you know, their vibe.js form, and the error that points you there when the old form slips in.
---

# Coming from vue-router and Vue Test Utils

`createRouter`, `RouterView`, `RouterLink`, `useRoute`, nested routes, guards that return a location, `mount` and wrappers work the way you expect. What differs follows from four choices:

- **Typed routes from one file.** Routes are declared once with `defineRoutes()` and registered with `Register`, so names, params and every `to` are checked, in templates too. Routes are static: there is no `addRoute()`.
- **Explicit imports.** There are no global components and no instance properties in templates: `RouterLink` and `RouterView` are imported, and the route comes from `useRoute()`.
- **Guards return their decision.** A guard returns `false`, a location or nothing; there is no `next()`.
- **Tests drive the real tree.** `mount()` renders the real children with the real app; there are no stubs, no shallow mounting and no component instance to reach into. Tests query the DOM with CSS selectors.

## Router

| vue-router                                                                       | vibe.js                                                                                                           | What catches the old form                                                                                 |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `next()`, `next(false)`, `next('/login')` in a guard                             | `return`, `return false`, `return '/login'`                                                                       | [VIBE7107](/errors/VIBE7107) for a guard with a third parameter                                           |
| `createWebHashHistory()`                                                         | `createWebHistory()`, with the server falling back to `index.html`                                                | Not exported, a compile error                                                                             |
| `alias`, `sensitive`, `strict`, `parseQuery` and the other deferred options      | A redirecting route instead of an alias; the fixed matching rules                                                 | [VIBE7103](/errors/VIBE7103), which names the alternative                                                 |
| `router.addRoute()`, `router.removeRoute()`                                      | Every route in `routes.ts`; guards and `meta` for routes that depend on the user                                  | Not on `Router`, a compile error; see [Routes](../ui/routing.md#routes)                                   |
| Named views: `components: { default, sidebar }`                                  | Nested child routes, each with one component                                                                      | [VIBE7103](/errors/VIBE7103)                                                                              |
| `<RouterView v-slot="{ Component }">` with `KeepAlive` or `Transition`           | `<RouterView />` without content                                                                                  | [VIBE7115](/errors/VIBE7115)                                                                              |
| `<RouterLink custom v-slot="{ href, navigate }">`                                | `useLink({ to })` in your own link component                                                                      | `custom` is not a prop, a template type error; see [useLink](../ui/routing.md#routerview-and-routerlink)  |
| `<RouterLink to="https://example.com">`                                          | A plain `<a href>`                                                                                                | [VIBE7114](/errors/VIBE7114)                                                                              |
| `<router-link>` and `<router-view>`                                              | `<RouterLink>` and `<RouterView>`                                                                                 | [VIBE2002](/errors/VIBE2002) once the component is imported                                               |
| `RouterLink` used without an import (global registration)                        | `import { RouterLink, RouterView } from '@usevibejs/ui/router'`                                                   | [VIBE2001](/errors/VIBE2001)                                                                              |
| `$route` and `$router` in a template                                             | `const route = useRoute()` and `const router = useRouter()` in `<script setup lang="ts">`                         | [VIBE2008](/errors/VIBE2008)                                                                              |
| `beforeRouteEnter`, `beforeRouteLeave` and `beforeRouteUpdate` component options | `beforeEnter` on the record or `router.beforeEach()`; `onBeforeRouteLeave()` and `onBeforeRouteUpdate()` in setup | [VIBE1004](/errors/VIBE1004) for an options `<script>`, [VIBE3331](/errors/VIBE3331) in `defineOptions()` |
| Typed routes from a generated file or a `RouteNamedMap`                          | `defineRoutes([...])` and `interface Register { router: typeof router }`                                          | A wrong name or param is a type error; see [Typed routes](../ui/routing.md#creating-the-router)           |
| `useRoute()` with `route.params.id as string`                                    | `useRoute('user')`, whose params are typed                                                                        | [VIBE7113](/errors/VIBE7113) when that route is not shown                                                 |
| Pinia `defineStore()` and `storeToRefs()`                                        | A module-scope composable that returns refs and functions                                                         | Not exported, a compile error; see [Shared state](../ui/data.md#shared-state)                             |

## Component testing

| Vue Test Utils                                   | vibe.js                                                               | What catches the old form                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `mount(C, { global: { plugins: [router] } })`    | `mount(C, { plugins: [router] })`                                     | [VIBE7206](/errors/VIBE7206)                                                                   |
| `global.provide`                                 | `provide`                                                             | [VIBE7206](/errors/VIBE7206)                                                                   |
| `global.stubs`, `stubs`, `shallow: true`         | The real children, or `vi.mock('./Child.vibe', ...)` for one child    | [VIBE7206](/errors/VIBE7206)                                                                   |
| `shallowMount()`                                 | `mount()`                                                             | Not exported, a compile error                                                                  |
| `wrapper.findComponent(Child)`, `getComponent()` | A CSS selector on what the child renders                              | Not on the wrapper, a compile error; see [Finding elements](../ui/testing.md#finding-elements) |
| `wrapper.vm.count`, `setData()`                  | Assert the DOM; start from `props`                                    | Not on the wrapper, a compile error; `data` is [VIBE7206](/errors/VIBE7206)                    |
| `trigger('keydown.enter')`                       | `trigger('keydown', { key: 'Enter' })`                                | [VIBE7203](/errors/VIBE7203)                                                                   |
| `enableAutoUnmount(afterEach)`                   | Nothing: every test unmounts what it mounted                          | Not exported, a compile error                                                                  |
| `attrs`                                          | Attributes in `props`                                                 | [VIBE7206](/errors/VIBE7206)                                                                   |
| `findByRole()` and other Testing Library queries | CSS selectors on the wrapper, or any DOM library on `wrapper.element` | Not exported, a compile error                                                                  |
| `environment: 'happy-dom'`                       | `environment: 'jsdom'`, the environment the test API is tested in     | Nothing at compile time; see [Setup](../ui/testing.md#setup)                                   |

## A guard, side by side

The vue-router guard

```text
router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth && !isSignedIn()) next({ name: 'login' });
  else next();
});
```

returns its decision:

```ts
import type { Router } from '@usevibejs/ui/router';
declare const router: Router;
declare function isSignedIn(): boolean;
// ---cut---
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isSignedIn()) return { name: 'login' };
});
```

## A test, side by side

The Vue Test Utils test

```text
const wrapper = mount(App, { global: { plugins: [router], stubs: { Chart: true } } });
expect(wrapper.findComponent(UserCard).props('id')).toBe(1);
```

drives the real tree and reads the DOM:

```ts
import type { RouteRecordRaw } from '@usevibejs/ui/router';
declare const routes: RouteRecordRaw[];
// ---cut---
import { createMemoryHistory, createRouter } from '@usevibejs/ui/router';
import { flushPromises, mount } from '@usevibejs/ui/testing';
import { expect, vi } from 'vitest';
import App from './App.vibe';

vi.mock('./Chart.vibe', () => import('./test/ChartStub.vibe'));

const router = createRouter({ history: createMemoryHistory(), routes });
const wrapper = mount(App, { plugins: [router] });
await router.isReady();
await router.push('/users/1');
await flushPromises();
expect(wrapper.get('.user-card h2').text()).toBe('Ada');
```

## Where to go next

- [Routing](../ui/routing.md), [Testing components](../ui/testing.md) and [Data loading](../ui/data.md).
