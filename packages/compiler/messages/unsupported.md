# Unsupported template features

These codes report template features that vibe.js does not provide, with the way to reach the same result.

## VIBE2901: Teleport is not supported

> `<Teleport>` is not supported.

`<Teleport>` is not a built-in component and no binding of the file has this name.

### Fix

- Render the content where it belongs, or move it with `document.body.append` from a template ref in `onMounted`.
- Import a component named `Teleport` if the file should render one.

## VIBE2902: KeepAlive is not supported

> `<KeepAlive>` is not supported.

`<KeepAlive>` is not a built-in component and no binding of the file has this name.

### Fix

- Keep the state in a parent component or a shared module and render the children with `v-if`.
- Import a component named `KeepAlive` if the file should render one.

## VIBE2903: Transition is not supported

> `<Transition>` is not supported.

`<Transition>` is not a built-in component and no binding of the file has this name.

### Fix

- Animate with CSS transitions or animations on a class bound with `:class`.
- Import a component named `Transition` if the file should render one.

## VIBE2904: TransitionGroup is not supported

> `<TransitionGroup>` is not supported.

`<TransitionGroup>` is not a built-in component and no binding of the file has this name.

### Fix

- Animate list items with CSS animations on their class.
- Import a component named `TransitionGroup` if the file should render one.

## VIBE2905: Suspense is not supported

> `<Suspense>` is not supported.

`<Suspense>` is not a built-in component and no binding of the file has this name.

### Fix

- Load async data with `useAsync` and render a loading state with `v-if`.
- Import a component named `Suspense` if the file should render one.

## VIBE2906: v-memo is not supported

> `v-memo` is not supported.

Templates update only the bindings whose values change, so a memo is not needed.

### Fix

- Remove `v-memo`.

## VIBE2907: v-once is not supported

> `v-once` is not supported.

Every binding of a template stays reactive.

### Fix

- Remove `v-once`.
- Read the value once in `<script setup lang="ts">` and render that constant.

## VIBE2908: Custom directive

> `v-{name}` is not a built-in directive, and custom directives are not supported.

The built-in directives are `v-bind`, `v-on`, `v-model`, `v-if`, `v-else-if`, `v-else`, `v-for`, `v-slot`, `v-show`, `v-html`, `v-text` and `v-pre`.

### Fix

- Reach the element with `useTemplateRef` and run the code in `onMounted` or a `watch`.
- Move reusable element logic into a composable that takes the template ref.

## VIBE2909: v-cloak is not supported

> `v-cloak` is not supported.

Templates are compiled ahead of time, so uncompiled markup is never shown.

### Fix

- Remove `v-cloak`.

## VIBE2910: Lifecycle listener

> `{name}` is not supported.

Element lifecycle listeners such as `@vue:mounted` and `@vnode-mounted` are not events of the rendered element.

### Fix

- Use `onMounted` or `onUnmounted` with a template ref in `<script setup lang="ts">`.
