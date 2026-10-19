---
title: Coming from Vue
description: What carries over from Vue 3 to vibe.js, the Vue idioms that change and the error code that reports each one, the APIs that behave differently, and what vibe.js leaves out.
---

# Coming from Vue

Most of what you know from Vue 3 with `<script setup>` carries over:

- **Single-file components:** a `.vibe` file has `<script setup lang="ts">`, `<template>` and `<style scoped>` blocks, and the template uses the same directives: `v-if`, `v-for`, `v-show`, `v-model`, `v-bind`, `v-on`, `v-slot`, `v-html` and `v-text`, with the same shorthands and modifiers.
- **Reactivity:** `ref`, `shallowRef`, `reactive`, `readonly`, `computed`, `watch`, `watchEffect`, `effectScope`, `nextTick`, `toRef`, `toRefs` and `toValue` have the same signatures, types and semantics. They are imported from `@vibejs-org/ui`.
- **Components:** `defineProps`, `defineEmits`, `defineSlots`, `defineModel`, `defineExpose` and `defineOptions` are macros, the lifecycle hooks have the same names, and `provide`/`inject` with an `InjectionKey`, `useTemplateRef`, `useAttrs`, `useSlots` and `useId` work as in Vue.
- **The app:** `createApp(App).mount('#app')`, `app.use()`, `app.provide()`, `app.config.errorHandler` and `app.config.warnHandler`.

The template compiles to code that creates DOM nodes directly and updates only the bindings whose state changed; there is no virtual DOM. Everything is TypeScript, and the compiler reports a Vue form that vibe.js does not support with a `VIBE####` code whose page shows the replacement.

## Idioms

| Vue                                                    | vibe.js                                                                                           | What catches the Vue form                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `app.component('TodoItem', TodoItem)`                  | `import TodoItem from './TodoItem.vibe'` in each file that uses it                                | [VIBE5301](/errors/VIBE5301)                               |
| `app.mixin({ ... })`                                   | a composable such as `useFeature()`                                                               | [VIBE5301](/errors/VIBE5301)                               |
| `app.directive('focus', ...)`, `v-focus`               | `useTemplateRef('input')` with `onMounted()`                                                      | [VIBE2908](/errors/VIBE2908), [VIBE5301](/errors/VIBE5301) |
| `<script>` with `export default { data() {} }`         | `<script setup lang="ts">`                                                                        | [VIBE1004](/errors/VIBE1004)                               |
| `<script setup>` without `lang`, or `lang="js"`        | `<script setup lang="ts">`                                                                        | [VIBE1005](/errors/VIBE1005)                               |
| `<todo-item>`                                          | `<TodoItem>`                                                                                      | [VIBE2002](/errors/VIBE2002)                               |
| `ref="input"` with `const input = ref(null)`           | `const input = useTemplateRef<HTMLInputElement>('input')`                                         | [VIBE2701](/errors/VIBE2701)                               |
| `defineProps({ title: String })`                       | `defineProps<{ title: string }>()`                                                                | [VIBE3101](/errors/VIBE3101)                               |
| `withDefaults(defineProps<Props>(), { size: 'md' })`   | `const { size = 'md' } = defineProps<Props>()`                                                    | [VIBE3006](/errors/VIBE3006)                               |
| `const { title, ...rest } = defineProps<Props>()`      | `const { title } = defineProps<Props>()` and `$attrs`                                             | [VIBE3104](/errors/VIBE3104)                               |
| `defineEmits(['pick'])`                                | `defineEmits<{ pick: [id: string] }>()`                                                           | [VIBE3201](/errors/VIBE3201)                               |
| `defineEmits<{ (e: 'pick', id: string): void }>()`     | `defineEmits<{ pick: [id: string] }>()`                                                           | [VIBE3202](/errors/VIBE3202)                               |
| `<script setup lang="ts" generic="T">`                 | `defineProps<{ items: Item[] }>()` with a concrete type                                           | [VIBE1013](/errors/VIBE1013)                               |
| `<component is="TodoItem">`, `:is="'TodoItem'"`        | `<component :is="TodoItem">` with the imported component                                          | [VIBE2006](/errors/VIBE2006), [VIBE5207](/errors/VIBE5207) |
| `$el`, `$parent`, `$refs` or `this` in a template      | `useTemplateRef('name')` and bindings of `<script setup>`                                         | [VIBE2008](/errors/VIBE2008)                               |
| `v-model="title"` where `title` is a prop              | `const title = defineModel<string>('title')`                                                      | [VIBE2504](/errors/VIBE2504)                               |
| `v-for` without `:key`                                 | `v-for="item in items" :key="item.id"`                                                            | [VIBE2203](/errors/VIBE2203)                               |
| `v-if` and `v-for` on one element                      | `<template v-for>` around the `v-if`, or a `computed` list                                        | [VIBE2103](/errors/VIBE2103)                               |
| `<Teleport to="body">`                                 | a native `<dialog>` or the `popover` attribute                                                    | [VIBE2901](/errors/VIBE2901)                               |
| `<KeepAlive>`                                          | `v-show`, or state kept in a composable                                                           | [VIBE2902](/errors/VIBE2902)                               |
| `<Transition>`                                         | CSS transitions on a `:class` binding                                                             | [VIBE2903](/errors/VIBE2903)                               |
| `<TransitionGroup>`                                    | CSS animations on keyed `v-for` items                                                             | [VIBE2904](/errors/VIBE2904)                               |
| `<Suspense>`                                           | a `ref` filled when the data arrives, and `v-if`                                                  | [VIBE2905](/errors/VIBE2905)                               |
| `v-memo`                                               | `computed`                                                                                        | [VIBE2906](/errors/VIBE2906)                               |
| `v-once`                                               | a `const` of `<script setup>`                                                                     | [VIBE2907](/errors/VIBE2907)                               |
| `v-cloak`                                              | a plain `<div id="app"></div>`: templates are compiled ahead of time, so no raw template is shown | [VIBE2909](/errors/VIBE2909)                               |
| `@vue:mounted`, `@vnode-mounted`                       | `onMounted()` with `useTemplateRef()`                                                             | [VIBE2910](/errors/VIBE2910)                               |
| `async setup()`, top-level `await` in `<script setup>` | `const data = ref()` filled by a promise                                                          | [VIBE3002](/errors/VIBE3002), [VIBE5204](/errors/VIBE5204) |
| `<style module>`                                       | `<style scoped>`                                                                                  | [VIBE1007](/errors/VIBE1007)                               |
| `v-bind(color)` in `<style>`                           | `:style="{ '--color': color }"` and `var(--color)`                                                | [VIBE4003](/errors/VIBE4003)                               |
| `>>> .child`, `/deep/ .child`, `::v-deep`              | `:deep(.child)`                                                                                   | [VIBE4004](/errors/VIBE4004)                               |
| `<template src="./list.html">`                         | the content written inside `<template>`                                                           | [VIBE1006](/errors/VIBE1006)                               |
| `@pick.once="onPick"` on a component                   | `@pick="onPick"` and the check inside `onPick`                                                    | [VIBE2305](/errors/VIBE2305)                               |
| `v-on="{ click, focus }"`                              | `@click="click" @focus="focus"`                                                                   | [VIBE2302](/errors/VIBE2302)                               |
| `<template #[name]>`                                   | `<template v-if="wide" #wide>` with static names                                                  | [VIBE2605](/errors/VIBE2605)                               |

## Same API, different behavior

- `onBeforeMount` runs after the component's DOM is built and before it is inserted, so a child's runs before its parent's, and template refs are already set. See [Hook order](../ui/lifecycle.md#hook-order).
- Each read of a prop calls into the parent and evaluates the bound expression again; put expensive derivations in `computed`. See [Reading props](../ui/components.md#reading-props).
- Slot fallback content renders only when the parent passes no content for the slot, not when the passed content renders nothing. See [Fallback content](../ui/components.md#fallback-content).
- A template ref on a component holds only what the component passes to `defineExpose()`, never its instance. See [Exposing values](../ui/components.md#exposing-values).
- Event listeners are attached to the elements themselves, without delegation. See [Events](../ui/template-syntax.md#events).
- In development, a template edit keeps the component's state but creates its child components again. See [Hot updates](../ui/index.md#hot-updates).
- Calling a slot function in the script renders the slot and creates its DOM; test `$slots.name` instead. See [Slots in script](../ui/components.md#slots-in-script).

## Not in vibe.js

Importing one of these from `@vibejs-org/ui` fails to type-check with TS2305 (module has no exported member).

- `h()`, render functions and JSX: write a template; choose a component at runtime with `<component :is>`.
- `defineAsyncComponent`: the router loads a route component from `() => import('./Page.vibe')` itself.
- `customRef`: a `shallowRef` with a `watch`, or a `computed` with `get` and `set`.
- `proxyRefs`: templates unwrap the top-level refs of `<script setup>`; in script, use `.value` or `reactive()`.
- `effect`: `watchEffect` or `watchSyncEffect`.
- `getCurrentInstance`: `useAttrs()`, `useSlots()`, `useId()` and `inject()` cover the uses of the instance.
- `app.config.globalProperties`: `app.provide()` and a composable that injects the value.
- `defineCustomElement`: planned for a later version.
- `defineStore` and Pinia: module-scope state in a composable. See [Shared state](../ui/reactivity.md#shared-state).
- Server-side rendering and hydration: v0.1 renders in the browser only; server rendering is planned for a later version.
