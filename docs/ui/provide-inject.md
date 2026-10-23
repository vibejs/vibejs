---
title: Provide and inject
description: Pass values to every descendant of a component or to the whole app with provide and inject, typed by an InjectionKey.
---

# Provide and inject

`provide(key, value)` makes a value available to every descendant of a component, and `inject(key)` reads the value of the nearest ancestor that provided `key`. The components in between do not pass it along as props.

## Typed keys

An `InjectionKey<T>` is a symbol that carries the type of its value, so `provide()` checks the value and `inject()` returns `T`. Export the key from a `.ts` module that both sides import:

```ts [theme.ts]
import { inject, type InjectionKey, type Ref } from '@usevibejs/ui';

export interface Theme {
  mode: Ref<'light' | 'dark'>;
  toggle: () => void;
}

export const ThemeKey: InjectionKey<Theme> = Symbol('theme');

/** The nearest provided theme; `undefined` without a provider. */
export const useTheme = (): Theme | undefined => inject(ThemeKey);
```

The provider creates the value in its setup:

```vibe
<script setup lang="ts">
import { provide, ref } from '@usevibejs/ui';
import Toolbar from './Toolbar.vibe';
import { ThemeKey } from './theme.ts';

const mode = ref<'light' | 'dark'>('light');
provide(ThemeKey, {
  mode,
  toggle: () => (mode.value = mode.value === 'light' ? 'dark' : 'light'),
});
</script>

<template>
  <main :class="mode">
    <Toolbar />
  </main>
</template>
```

Any descendant injects it, here through the `useTheme()` composable of `theme.ts`:

```vibe
<script setup lang="ts">
import { useTheme } from './theme.ts';

const theme = useTheme();
</script>

<template>
  <button v-if="theme" type="button" @click="theme.toggle()">{{ theme.mode.value }}</button>
</template>
```

Provide a ref or a reactive object, as `mode` above, when descendants should see changes. A string key works too, but its value is not typed.

## Defaults

Without a provider, `inject(key)` returns `undefined` and warns VIBE5206 in development. A default makes the value required:

```ts
import { inject, ref, type InjectionKey, type Ref } from '@usevibejs/ui';

const LocaleKey: InjectionKey<Ref<string>> = Symbol('locale');
// ---cut---
// A default value.
const locale = inject(LocaleKey, ref('en'));

// A factory, called only when nothing is provided.
const fallback = inject(LocaleKey, () => ref(navigator.language), true);
console.log(locale.value, fallback.value);
```

The third argument, `true`, tells `inject()` to call the default instead of returning the function itself.

## App-level values

`app.provide(key, value)` provides a value to every component of the app. A component's `provide()` of the same key takes precedence for its descendants.

```ts
import { createApp, ref, type Component, type InjectionKey, type Ref } from '@usevibejs/ui';

declare const App: Component;
const LocaleKey: InjectionKey<Ref<string>> = Symbol('locale');
// ---cut---
const app = createApp(App);
app.provide(LocaleKey, ref('en'));
app.mount('#app');
```

## Outside setup

`provide()` and `inject()` work during a component's setup. `hasInjectionContext()` returns whether `inject()` can be called at that point, which lets a composable fail with a clear message or fall back. `app.runWithContext(fn)` runs `fn` with the app as the injection context, so code outside any component, such as a router guard or a test, can read the app's values:

```ts
import {
  createApp,
  hasInjectionContext,
  inject,
  ref,
  type Component,
  type InjectionKey,
  type Ref,
} from '@usevibejs/ui';

declare const App: Component;
const LocaleKey: InjectionKey<Ref<string>> = Symbol('locale');
// ---cut---
const app = createApp(App).provide(LocaleKey, ref('de'));

const locale = app.runWithContext(() => {
  console.log(hasInjectionContext()); // true
  return inject(LocaleKey);
});
console.log(locale?.value); // 'de'
```

## UI and server

`inject(key)` in a component reads values provided in the component tree. It is unrelated to the server's field `inject(Token)` of `@usevibejs/server`, which resolves providers from the dependency injection container of a module. The two never share values.
