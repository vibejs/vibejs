# Components

## VIBE5201: Attributes not inherited

> The component {name} received attributes, but its template has no single root element to put them on.

Attributes and listeners that a parent passes and the component does not declare as props or events fall through to its root: an element, a component that is the only root, or a `v-if` branch that renders one element. A component with several roots, a `v-for` root or a text root has no single place for them, so they are dropped and this warning is reported in development builds.

### Fix

- Bind the attributes where they belong with `v-bind="$attrs"`, and turn off inheritance with `inheritAttrs: false` in `defineOptions()`.
- Wrap the roots of the template in one element.
- Declare the attribute as a prop with `defineProps()` or the listener as an event with `defineEmits()`.

## VIBE5202: Undeclared event

> The component {name} emitted {event}, which it does not declare.

`defineEmits()` declares the events of a component. A parent listens to them with `@event`, and the listener of a declared event is not passed down as a fallthrough attribute. An undeclared event still calls a matching listener, but it is missing from the type of the component and its listener also falls through to the root element. This warning is reported in development builds.

### Fix

- Add {event} to the record passed to `defineEmits()`.
- Check the spelling of the event name.

## VIBE5203: Prop mutation

> Cannot assign to the prop {key}: props are readonly.

Props flow from the parent to the child. The child reads them and cannot assign to them, so the write is ignored and this warning is reported in development builds.

### Fix

- Emit an event and let the parent change the value it passes, or use `defineModel()` for a two-way binding.
- Copy the prop into a local `ref()` when the child keeps its own value.

## VIBE5204: Async setup

> The setup of the component {name} returned a promise: components cannot have an async setup.

A component renders synchronously when it is created, so its `<script setup>` cannot use top-level `await` or return a promise. This error is thrown in every build.

### Fix

- Load async data with `useAsync()` in setup, and render a loading state until `loading` is false.
- Move the `await` into a function that the component calls instead of awaiting in setup.

## VIBE5205: Setup-only API called outside setup

> {api}() can only be called synchronously inside a component's setup.

Lifecycle hooks, `provide()`, `inject()`, `useTemplateRef()`, `useAttrs()`, `useSlots()`, `useId()` and `useModel()` belong to the component whose setup is running. Called anywhere else, such as after an `await` or in a timer, there is no component to attach them to, so the call does nothing and this warning is reported in development builds.

### Fix

- Call {api}() at the top level of `<script setup>` or of a composable called from it.
- Call {api}() before the first `await` of the setup code.
- Use `app.runWithContext()` to call `inject()` outside a component.

## VIBE5206: Injection not found

> Nothing provides the injection key {key}.

`inject()` looks up the key in the values provided by the parent components and by the app. When no parent and no plugin provides it and no default is given, `inject()` returns `undefined` and this warning is reported in development builds.

### Fix

- Call `provide()` with {key} in a parent component, or `app.provide()` before mounting.
- Pass a default value as the second argument of `inject()`.
- Use the same key object for `provide()` and `inject()`: two `Symbol()` calls create two different keys.

## VIBE5207: Invalid dynamic component

> `<component :is>` received {type}, which is not a component.

`<component :is>` renders the component it receives, and nothing for `null` or `undefined`. Any other value, such as a string or a plain object without a render function, cannot be rendered. This error is raised in every build and, like any error of a render, goes to `onErrorCaptured` and `app.config.errorHandler`.

### Fix

- Import the component and pass it to `:is`, not its name as a string.
- Render a native element with its own tag and `v-if` instead of `<component :is>`.

## VIBE5208: Template ref misuse

> The template ref {key} is registered twice, or a template uses it without a matching useTemplateRef().

Each template ref needs exactly one `useTemplateRef()` with its key in the component that owns the template. A second registration of the same key would leave the first ref empty, and a `ref` attribute without a registration has nowhere to store the element. This warning is reported in development builds.

### Fix

- Call `useTemplateRef('{key}')` once in the setup of the component whose template has `ref="{key}"`.
- Give each template ref its own key.
