# Template

These codes report template markup that the compiler cannot render: unknown tags, misused directives, slots and refs, and names in template expressions that the compiled render function cannot read.

## VIBE2001: Unknown component

> `<{tag}>` is not a component of this file.

A PascalCase or dotted tag names a component that the template can reach: an import or a binding of `<script setup>`, a namespace binding for a dotted tag such as `Form.Input`, or the file itself by its own name. There are no globally registered components.

### Fix

- Import the component in `<script setup lang="ts">`, as in `import {tag} from './{tag}.vibe'`.
- Fix the spelling of `<{tag}>`.

## VIBE2002: Component tag not in PascalCase

> `<{tag}>` refers to the component `{name}`, and component tags are written in PascalCase.

A tag in kebab case or in lowercase is an element. When the PascalCase form of the tag names a component of the file, the tag is almost certainly meant as that component.

### Fix

- Write the tag as `<{name}>`.

## VIBE2003: Unknown element

> `<{tag}>` is not an HTML, SVG or MathML element.

A lowercase tag without a hyphen must be a standard element. Custom elements have a hyphen in their name, and components are written in PascalCase.

### Fix

- Fix the spelling of `<{tag}>`.
- Write a component tag in PascalCase and import the component.
- Give a custom element a name with a hyphen, as in `<my-{tag}>`.

## VIBE2004: Template without a directive

> A `<template>` element needs `v-if`, `v-else-if`, `v-else`, `v-for` or `v-slot`.

A nested `<template>` only groups content for a directive and renders no element of its own. Without one of those directives it has no meaning.

### Fix

- Add the directive that the group needs, as in `<template v-if="ok">`.
- Replace `<template>` with an element such as `<div>`, or remove it and keep its children.

## VIBE2005: Text inside a table or select element

> Text cannot be a direct child of `<{tag}>`.

The HTML parser moves text out of table structure elements and drops it inside `<select>`, so the rendered page would not match the template.

### Fix

- Move the text into a cell, as in `<td>`, or into an `<option>`.
- Remove the text.

## VIBE2006: Component without a dynamic is

> `<component>` needs a bound `:is` with a component value.

`<component>` renders the component object its `:is` expression returns. A static `is` attribute or a string literal names no component, because there is no global registry.

### Fix

- Import the component and bind it, as in `<component :is="Item" />`.
- Write the component tag directly, as in `<Item />`, when it never changes.

## VIBE2007: Unknown identifier

> `{name}` is not defined in the template.

A template reads the bindings and imports of `<script setup>`, the props, the aliases of `v-for`, the props of `v-slot`, `$attrs`, `$slots`, `$emit`, `$props`, and these globals: `Infinity`, `undefined`, `NaN`, `isFinite`, `isNaN`, `parseFloat`, `parseInt`, `decodeURI`, `decodeURIComponent`, `encodeURI`, `encodeURIComponent`, `Math`, `Number`, `Date`, `Array`, `Object`, `Boolean`, `String`, `RegExp`, `Map`, `Set`, `JSON`, `Intl`, `BigInt`, `console`, `Error` and `Symbol`. When the name is close to one in scope, the first fix names it.

### Fix

- Fix the spelling of `{name}`.
- Declare or import `{name}` in `<script setup lang="ts">`.
- Declare `{name}` as a prop in `defineProps`.
- Read another global, such as `window`, in `<script setup lang="ts">` and use that binding in the template.

## VIBE2008: Instance access

> `{name}` is not available in templates.

A template has no component instance: `this` and instance properties such as `$refs`, `$el`, `$nextTick` and `$watch` do not exist. Everything a template reads comes from `<script setup>`, the props, and `$attrs`, `$slots`, `$emit` and `$props`.

### Fix

- Reach an element or a child component with `useTemplateRef('name')` in `<script setup lang="ts">` and a matching `ref="name"`.
- Import `nextTick` or `watch` from `@vibejs-org/ui` and call it in `<script setup lang="ts">`.
- Write `$attrs`, `$slots`, `$emit` or a binding of `<script setup lang="ts">` instead of `this`.
- Read the route with `const route = useRoute()` and the router with `useRouter()` in `<script setup lang="ts">`.

## VIBE2009: is attribute

> The `is` attribute is not supported on `<{tag}>`.

Elements are never replaced by components through `is`. Only `<component>` takes a bound `:is`.

### Fix

- Write the component tag directly, as in `<Item />`.
- Use `<component :is="Item" />` for a component chosen at runtime.

## VIBE2010: Reserved local name

> `{name}` is reserved and cannot name a template local.

Names that start with `_` are reserved for generated code in `v-for` aliases and `v-slot` props. `$setup`, `$props` and `$ctx` are the parameters of the render function, so no local in a template, including a parameter or variable inside an expression, may use them.

### Fix

- Rename `{name}`, as in `v-for="item in items"` instead of `v-for="_item in items"`.
- Give a destructured slot prop a new local name, as in `_id: id`.

## VIBE2011: Script or style in a template

> `<{tag}>` cannot appear inside the template.

Templates render markup only. Code belongs in `<script setup>` and styles in a top-level `<style>` block.

### Fix

- Move the code into `<script setup lang="ts">`.
- Move the styles into a `<style>` or `<style scoped>` block of the file.

## VIBE2012: Attribute on a template

> `{name}` has no effect on a `<template>` element.

A `<template>` with `v-if`, `v-else-if`, `v-else`, `v-for` or `v-slot` renders only its children, so attributes, bindings, listeners, `v-model` and `ref` on it would be lost. Only `:key` is kept, as the key of a `v-for` or keyed block.

### Fix

- Move `{name}` onto an element inside the `<template>`.
- Replace the `<template>` with an element such as `<div>` that carries `{name}`.

## VIBE2101: Condition without expression

> `{directive}` needs a condition.

`v-if` and `v-else-if` render their element when the expression is truthy, so the expression is required.

### Fix

- Write the condition, as in `{directive}="items.length"`.
- Write `v-else` for the last branch of a chain.

## VIBE2102: Branch without v-if

> `{directive}` has no `v-if` or `v-else-if` element right before it.

`v-else-if` and `v-else` continue the chain of the previous sibling element. Only whitespace and comments may stand between the branches.

### Fix

- Move the element right after the element with `v-if` or `v-else-if`.
- Replace `{directive}` with `v-if` to start a new chain.

## VIBE2103: v-if and v-for on one element

> `v-if` and `v-for` cannot be on the same element.

Which directive applies first is easy to misread, so the two must be on separate elements.

### Fix

- Wrap the element in `<template v-for="…">` and keep `v-if` on the element.
- Filter the list in a `computed` value and loop over that.

## VIBE2104: v-else with a value

> `v-else` takes no value.

`v-else` is the last branch of a chain and renders when no earlier condition holds.

### Fix

- Remove the value of `v-else`.
- Write `v-else-if` to test a condition.

## VIBE2201: v-for without expression

> `v-for` needs an expression.

`v-for` renders its element once per item of a source, written as `item in items`.

### Fix

- Write the loop, as in `v-for="item in items"`.

## VIBE2202: Malformed v-for

> The `v-for` expression must have the form `alias in source`.

The aliases name the item and optionally its key and index, as in `(item, index) in items`, and the source follows `in` or `of`.

### Fix

- Write the loop as `item in items` or `(item, index) in items`.

## VIBE2203: v-for without key

> Elements rendered by `v-for` need a `:key`.

The key identifies each item, so moved items keep their elements and state. Only a numeric range such as `n in 10` needs none.

### Fix

- Add a unique, stable key, as in `:key="item.id"`.

## VIBE2204: Key on a child of template v-for

> `:key` belongs on the `<template v-for>`, not on its child.

The children of `<template v-for>` render together as one item, which is identified by the key of the `<template>` element.

### Fix

- Move `:key` to the `<template v-for>` element.

## VIBE2301: v-on without expression

> `{name}` needs a handler.

An event listener calls its handler: a function name, a function or a statement list.

### Fix

- Write the handler, as in `{name}="save"`.
- Remove `{name}`.

## VIBE2302: v-on with an object

> `v-on` needs an event name and cannot take an object of listeners.

Each event is written as its own attribute, so the listeners of an element are visible in the template.

### Fix

- Write one `@event="handler"` attribute per event.

## VIBE2303: Dynamic event name

> The event name of `v-on` must be static.

Listeners are attached for names known at compile time.

### Fix

- Write a static event name and decide inside the handler what to do.
- Attach the listener with `addEventListener` from a template ref.

## VIBE2304: Unknown event modifier

> `.{modifier}` is not an event modifier.

The modifiers are `stop`, `prevent`, `self`, `exact`, `ctrl`, `alt`, `shift`, `meta`, `left`, `middle`, `right`, `once`, `capture` and `passive`. Key names such as `enter` or `page-down` are modifiers only on `keydown`, `keyup` and `keypress`.

### Fix

- Fix the spelling of `.{modifier}`.
- Check the key inside the handler.

## VIBE2305: Modifier on a component event

> `.{modifier}` cannot modify a component event.

A component event calls its handler with the emitted values, not with a DOM event, so event modifiers do not apply.

### Fix

- Remove `.{modifier}` and handle the case inside the handler.

## VIBE2401: v-bind without value

> `{name}` needs a value.

A bound attribute takes an expression. The same-name shorthand, as in `:id` for `:id="id"`, works only when the name is a valid identifier.

### Fix

- Write the value, as in `{name}="value"`.
- Remove the binding.

## VIBE2402: Unknown v-bind modifier

> `.{modifier}` is not a `v-bind` modifier.

The modifiers are `prop`, `attr` and `camel`; on components only `camel` applies.

### Fix

- Remove `.{modifier}`.

## VIBE2501: v-model without expression

> `v-model` needs a target.

`v-model` reads and writes a value, so it needs a variable or a property to bind.

### Fix

- Write the target, as in `v-model="text"`.

## VIBE2502: v-model target not assignable

> The `v-model` target must be a variable or a property.

The target is written on every change, so it must be an assignable name or member, as in `text` or `form.name`.

### Fix

- Bind a `ref` or a property, as in `v-model="form.name"`.
- Bind a computed value with `:value` and update its source in an `@input` handler.

## VIBE2503: v-model on a template local

> `{name}` is a `v-for` or `v-slot` local and cannot be assigned.

Assigning a local would replace the local copy only, not the item in the list or the slot prop.

### Fix

- Bind a property of the item, as in `v-model="item.text"`.

## VIBE2504: v-model on a prop

> `{name}` is a prop and cannot be assigned.

Props are owned by the parent component.

### Fix

- Declare a two-way value with `defineModel()` and bind it.
- Copy the prop into a `ref` and bind that.

## VIBE2505: v-model on a constant

> `{name}` cannot be assigned, because it is an import or a constant that holds no ref.

Only refs, `let` bindings and properties can take the new value.

### Fix

- Hold the value in a `ref`, as in `const {name} = ref(…)`.
- Bind a property of a reactive object.

## VIBE2506: v-model on an unsupported element

> `v-model` is not supported on `<{tag}>`.

`v-model` works on `<input>`, `<textarea>`, `<select>` and on components.

### Fix

- Use `<input>`, `<textarea>` or `<select>`.
- Bind the value and listen to the event of the element, as in `:value` and `@input`.

## VIBE2507: v-model with a dynamic type

> `v-model` cannot be used on an `<input>` with a bound `:type`.

The kind of binding, text, checkbox or radio, is chosen at compile time from the `type` attribute.

### Fix

- Write a static `type`.
- Render one `<input>` per type with `v-if`.

## VIBE2508: v-model on a file input

> `v-model` cannot be used on `<input type="file">`.

A file input is read-only from scripts.

### Fix

- Listen to `@change` and read the files in the handler, as in `(event.target as HTMLInputElement).files`.

## VIBE2509: v-model argument

> The `v-model` argument `{arg}` is allowed only as a static name on a component.

An argument selects which model of a component to bind. Native elements have a single value, and a model name must be known at compile time.

### Fix

- Remove the argument on native elements.
- Write the model name statically, as in `v-model:title`.

## VIBE2510: Unknown v-model modifier

> `.{modifier}` is not a `v-model` modifier for this element.

Text inputs and `<textarea>` take `lazy`, `number` and `trim`; `<select>` takes `number`; checkboxes and radio buttons take none.

### Fix

- Remove `.{modifier}`.

## VIBE2511: Value next to v-model

> `:value` cannot be combined with `v-model` on a text input.

`v-model` already sets the value of the input.

### Fix

- Remove `:value`.

## VIBE2601: Misplaced v-slot

> `v-slot` can only be used on a component or on a `<template>` that is a direct child of a component.

Slot content belongs to the component that renders it.

### Fix

- Move `v-slot` to the component or to a `<template>` directly inside it.

## VIBE2602: Mixed v-slot usage

> `v-slot` on the component cannot be combined with `<template v-slot>` children.

With `v-slot` on the component, all its children are that slot. With named slots, every slot needs its own `<template>`.

### Fix

- Move the content of the component slot into a `<template #default>`.

## VIBE2603: Duplicate slot

> The slot `{name}` is passed more than once.

Each slot of a component is passed once. Conditional slot templates with `v-if` and `v-else` may share a name.

### Fix

- Merge the content of both slots.
- Rename one of the slots.

## VIBE2604: Extraneous default slot content

> The default slot is passed both as `<template #default>` and as loose children.

Content outside named slot templates becomes the default slot.

### Fix

- Move the loose children into `<template #default>`.

## VIBE2605: Dynamic slot name

> Slot names must be static.

Slots are passed by names known at compile time.

### Fix

- Write a static name, and use `v-if` on slot templates to choose between them.

## VIBE2606: v-for on a slot

> `v-for` cannot be used on a slot template.

A component receives a fixed set of slots.

### Fix

- Put the `v-for` on an element inside the slot template.
- Pass the list as a prop and let the component render its slot per item.

## VIBE2607: Dynamic slot outlet name

> The name of a `<slot>` must be static.

Slot outlets are rendered by names known at compile time.

### Fix

- Write a static `name`, and use `v-if` to choose between outlets.

## VIBE2608: Unsupported attribute on slot

> `{name}` cannot be used on `<slot>`.

A `<slot>` takes its `name`, props passed to the slot, `v-bind`, `v-if`, `v-else-if`, `v-else` and `v-for`. It renders no element of its own.

### Fix

- Move `{name}` to an element inside the slot content.
- Remove `{name}`.

## VIBE2701: Template ref without useTemplateRef

> `ref="{name}"` has no matching `useTemplateRef('{name}')`.

A string ref fills the template ref declared with the same key.

### Fix

- Declare it in `<script setup lang="ts">`, as in `const {name} = useTemplateRef('{name}')`.
- Fix the spelling of the ref name.

## VIBE2702: Invalid function ref

> A bound `:ref` must be a function or a member path that holds one.

A function ref is called with the element or component instance when it mounts and with `null` when it unmounts.

### Fix

- Pass a function, as in `:ref="(el) => (input = el)"`.
- Use a string ref with `useTemplateRef`.

## VIBE2703: Directive without value

> `{directive}` needs a value.

`v-html` sets the inner HTML and `v-text` the text content of the element from the expression.

### Fix

- Write the value, as in `{directive}="content"`.

## VIBE2704: Directive on an element with children

> `{directive}` replaces the content of the element, which must be empty.

The children would be overwritten.

### Fix

- Remove the children of the element.
- Remove `{directive}` and render the value as a child.

## VIBE2705: v-show without value

> `v-show` needs a condition.

`v-show` hides the element while the condition is falsy.

### Fix

- Write the condition, as in `v-show="open"`.

## VIBE2706: Element directive on a non-element

> `{directive}` can only be used on an element, not on `<{tag}>`.

`v-show` sets the `display` style, and `v-html` and `v-text` the content, of one element. Components, `<template>` and `<slot>` have no single element of their own.

### Fix

- Wrap the content in an element and put `{directive}` on it.
- Use `v-if` instead of `v-show`.
