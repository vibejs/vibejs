# Template scope

These codes report names in template expressions that the compiled render function cannot read.

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

## VIBE2010: Reserved local name

> `{name}` is reserved and cannot name a template local.

Names that start with `_` are reserved for generated code in `v-for` aliases and `v-slot` props. `$setup`, `$props` and `$ctx` are the parameters of the render function, so no local in a template, including a parameter or variable inside an expression, may use them.

### Fix

- Rename `{name}`, as in `v-for="item in items"` instead of `v-for="_item in items"`.
- Give a destructured slot prop a new local name, as in `_id: id`.
