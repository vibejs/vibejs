---
title: Routing
description: Declare typed routes, render them with RouterView and RouterLink, read the route, guard navigations, load pages lazily and control scrolling.
---

# Routing

The router maps the URL to a chain of route records and renders their components. It comes from `@vibejs-org/ui/router`, and its types follow your routes: route names, params and links are checked by TypeScript, in scripts and in templates.

## Routes

Routes live in one file, `ui/src/routes.ts`. `defineRoutes()` returns the array unchanged and keeps its literal names and paths, which type the router.

```ts
import { defineRoutes } from '@vibejs-org/ui/router';
import type { Component } from '@vibejs-org/ui';
declare const HomePage: Component;
declare const UsersLayout: Component;
declare const UserList: Component;
declare const NotFound: Component;
// ---cut---
export const routes = defineRoutes([
  { path: '/', name: 'home', component: HomePage },
  {
    path: '/users',
    component: UsersLayout,
    children: [
      { path: '', name: 'users', component: UserList },
      { path: ':id(\\d+)', name: 'user', component: () => import('./pages/UserPage.vibe') },
    ],
  },
  { path: '/people', redirect: { name: 'users' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFound },
]);
```

In the app, `HomePage` and the other components are default imports of `.vibe` files.

A record takes `path`, `name`, `component`, `props`, `children`, `redirect`, `meta` and `beforeEnter`. Any other key fails at startup with [VIBE7103](/errors/VIBE7103), so a misspelled option is never ignored. Names are unique ([VIBE7102](/errors/VIBE7102)).

## Creating the router

`createRouter()` takes the history, the routes and an optional `scrollBehavior`. `app.use(router)` installs it and starts the first navigation.

```ts
import { createApp, type Component } from '@vibejs-org/ui';
import { createRouter, createWebHistory, defineRoutes } from '@vibejs-org/ui/router';
declare const App: Component;
declare const Page: Component;
// Snippets share one program: these routes type the router in every docs snippet.
const routes = defineRoutes([
  { path: '/', name: 'home', component: Page },
  { path: '/login', name: 'login', component: Page },
  { path: '/users', name: 'users', component: Page },
  { path: '/users/:id', name: 'user', component: Page },
]);
// ---cut---
const router = createRouter({ history: createWebHistory(), routes });

declare module '@vibejs-org/ui/router' {
  interface Register {
    router: typeof router;
  }
}

createApp(App).use(router).mount('#app');
```

- `createWebHistory(base?)` uses the browser's URL and history. Pass `base` when the app is served under a path, such as `'/app'`.
- `createMemoryHistory(base?)` keeps the history in memory: for tests and for environments without a window ([VIBE7117](/errors/VIBE7117)).

The `Register` declaration types every router API with your routes: `useRoute()`, `useRouter()`, `router.push()`, guards and the `to` of `RouterLink`. Declare it once per app, next to `createRouter()`.

## RouterView and RouterLink

`RouterView` renders the component of the matched record, and a `RouterView` inside that component renders the matched child. `RouterLink` renders an `<a>` that navigates inside the app. Both are imported where they are used; there are no global components.

```vibe
<script setup lang="ts">
import { RouterLink, RouterView } from '@vibejs-org/ui/router';
</script>

<template>
  <nav>
    <RouterLink to="/">Home</RouterLink>
    <RouterLink :to="{ name: 'user', params: { id: 42 } }">User 42</RouterLink>
  </nav>
  <main>
    <RouterView />
  </main>
</template>
```

- `to` is a path or a location object: `{ name, params, query, hash }` or `{ path, query, hash }`. A name that does not exist, a missing param or a param of the wrong type is a type error in the template.
- `replace` replaces the current history entry instead of adding one.
- The link gets the class `router-link-active` while its route is part of the current route, and `router-link-exact-active` and `aria-current="page"` while it is the current route. `activeClass`, `exactActiveClass` and `ariaCurrentValue` change them.
- Clicks with a modifier key, with the middle button, or on a link with `target="_blank"` are left to the browser.
- `to` is always a location inside the app. Use a plain `<a href>` for other sites ([VIBE7114](/errors/VIBE7114)).
- `RouterView` takes no slot content ([VIBE7115](/errors/VIBE7115)).

When a link needs other markup, build it with `useLink()`. It returns `href`, `isActive`, `isExactActive`, the resolved `route`, and `navigate(event)`, which applies the same click rules:

```vibe
<script setup lang="ts">
import { useLink, type RouteLocationRaw } from '@vibejs-org/ui/router';

const props = defineProps<{ to: RouteLocationRaw; label: string }>();
const { href, isActive, navigate } = useLink({ to: () => props.to });
</script>

<template>
  <li :class="{ selected: isActive }">
    <a :href="href" @click="navigate">{{ label }}</a>
  </li>
</template>
```

## Reading the route

`useRoute()` returns the current route; it is reactive, so templates and computed values that read it update on every navigation. `useRouter()` returns the router.

```vibe
<script setup lang="ts">
import { computed } from '@vibejs-org/ui';
import { useRoute, useRouter } from '@vibejs-org/ui/router';

const route = useRoute('user');
const router = useRouter();
const id = computed(() => Number(route.params.id));
</script>

<template>
  <h1>User {{ id }}</h1>
  <button type="button" @click="router.push({ name: 'user', params: { id: id + 1 } })">
    Next
  </button>
</template>
```

`useRoute('user')` types `params` by the `user` route. It throws [VIBE7113](/errors/VIBE7113) when that route is not part of the current route, so call it only in the page of that route and its children. A route has `path`, `fullPath`, `name`, `params`, `query`, `hash`, `matched`, `meta` and `redirectedFrom`.

When the same page stays on screen for another param, such as from `/users/1` to `/users/2`, the component instance is kept: read the params reactively instead of copying them once in setup.

### Params as props

With `props: true` on a record, the page receives the params as props. Type them with `RouteParams`:

```vibe
<script setup lang="ts">
import type { RouteParams } from '@vibejs-org/ui/router';

const { id } = defineProps<RouteParams<'user'>>();
</script>

<template>
  <h1>User {{ id }}</h1>
</template>
```

`props` also takes an object of fixed props, or a function from the route to the props.

## Paths and params

A path is a list of segments separated by `/`. Each segment is static text or exactly one param ([VIBE7101](/errors/VIBE7101)):

| Segment    | Matches                            | Param type         |
| ---------- | ---------------------------------- | ------------------ |
| `:id`      | one segment                        | `string`           |
| `:id(\d+)` | one segment that matches the regex | `string`           |
| `:id?`     | an optional segment                | `string`, optional |
| `:parts+`  | one or more segments               | `string[]`         |
| `:parts*`  | zero or more segments              | `string[]`         |

Paths match case-insensitively, a trailing slash is optional, and the most specific path wins regardless of the order of the records. When you navigate, params also accept numbers. `/:pathMatch(.*)*` matches every path that no other route matches.

## Navigating

`router.push(to)` and `router.replace(to)` take the same locations as `RouterLink`. They resolve once the navigation is over: with `undefined` when it succeeded, or with a navigation failure when a guard cancelled it, a newer navigation replaced it, or the target is the current route. They reject only when a guard, a redirect or a lazy loader throws, after the error reached `router.onError()`.

```ts
import { isNavigationFailure, NavigationFailureType, type Router } from '@vibejs-org/ui/router';
declare const router: Router;
// ---cut---
const failure = await router.push({ path: '/users', query: { page: '2' } });
if (isNavigationFailure(failure, NavigationFailureType.aborted)) {
  console.log('A guard kept the current page.');
}
```

`router.back()`, `router.forward()` and `router.go(delta)` move through the history. `router.resolve(to)` returns the route and its `href` without navigating.

## Guards

A guard receives `to` and `from` and decides with its return value:

- nothing or `true`: continue;
- `false`: cancel, and stay on the current route;
- a location: redirect there.

A guard may be async. It never takes a third parameter ([VIBE7107](/errors/VIBE7107)).

```ts
import type { Router } from '@vibejs-org/ui/router';
declare const router: Router;
declare function isSignedIn(): boolean;
// ---cut---
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isSignedIn())
    return { path: '/login', query: { next: to.fullPath } };
});
```

The guards of one navigation run in this order, each after the previous one finished:

1. `onBeforeRouteLeave` of the pages that are leaving, innermost first.
2. `router.beforeEach`.
3. `onBeforeRouteUpdate` of the pages that stay.
4. `beforeEnter` of the entering records.
5. The lazy components of the entering records load.
6. `router.beforeResolve`.

Then the route changes, the views render, and `router.afterEach(to, from, failure?)` runs. Guards, redirects, loaders and hooks run in the app's injection context, so they can call `inject()` for values that the app provides. A guard that throws cancels the navigation; the error reaches `router.onError()`, or the console when no handler is registered.

A page guards its own route with `onBeforeRouteLeave` and `onBeforeRouteUpdate` in its setup. They are removed when the page unmounts.

```vibe
<script setup lang="ts">
import { ref } from '@vibejs-org/ui';
import { onBeforeRouteLeave } from '@vibejs-org/ui/router';

const draft = ref('');
onBeforeRouteLeave(() => draft.value === '' || window.confirm('Discard the draft?'));
</script>

<template>
  <textarea v-model="draft"></textarea>
</template>
```

They work only in a component that a `RouterView` renders, and its children ([VIBE7112](/errors/VIBE7112)).

## Lazy pages

A `component` that is a function is loaded on the first navigation to its route, before the route changes, and kept for later navigations: `() => import('./pages/UserPage.vibe')`. The build puts each lazy page in its own chunk.

After a deploy, an open tab can ask for a chunk that no longer exists. The navigation then fails with [VIBE7109](/errors/VIBE7109); load the target as a full page to get the new version:

```ts
import { isVibeError } from '@vibejs-org/ui';
import type { Router } from '@vibejs-org/ui/router';
declare const router: Router;
// ---cut---
router.onError((error, to) => {
  if (isVibeError(error, 'VIBE7109')) window.location.assign(to.fullPath);
});
```

## Scroll behavior

With the web history, the router restores the scroll position on back and forward, scrolls to the element of a hash, keeps the position when only the query changes, and scrolls to the top otherwise. `scrollBehavior` replaces this: it returns a position, `{ el }` for an element, `false` to leave the scroll as it is, or nothing for the top.

```ts
import { createRouter, createWebHistory, type RouteRecordRaw } from '@vibejs-org/ui/router';
declare const routes: RouteRecordRaw[];
// ---cut---
const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
});
```

An element scrolls into view with its `scroll-margin-top`, which leaves room for a fixed header.

## Announcing route changes

A screen reader does not notice that the page changed. Announce the new page in a live region after each navigation, and give each page a `document.title`:

```ts
import type { Router } from '@vibejs-org/ui/router';
declare const router: Router;
// ---cut---
const status = document.createElement('p');
status.setAttribute('aria-live', 'polite');
status.className = 'visually-hidden';
document.body.append(status);

router.afterEach((to, from, failure) => {
  if (failure) return;
  status.textContent = `${document.title}, page loaded`;
});
```

## See also

- [Data loading](./data.md): load data for the current route with `useAsync`.
- [Testing components](./testing.md#testing-with-the-router): test pages with a memory history.
