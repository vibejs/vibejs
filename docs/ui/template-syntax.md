---
title: Template syntax
description: Interpolation, attribute bindings and spreads, class and style values, events and modifiers, conditions, keyed lists, v-show, v-model, template refs and dynamic components.
---

# Template syntax

A template is HTML with expressions and directives. An expression reads the bindings and imports of `<script setup>`, the props, and `$attrs`, `$slots`, `$emit` and `$props`; refs are unwrapped. A name that is none of these is reported as [VIBE2007](/errors/VIBE2007) when the file compiles.

## Text

`{{ expression }}` renders text. `null` and `undefined` render nothing; arrays and plain objects render as JSON.

```vibe
<script setup lang="ts">
import { ref } from '@vibejs-org/ui';

const user = ref({ name: 'Ada', unread: 3 });
const html = '<em>Welcome back</em>';
</script>

<template>
  <p>{{ user.name }} has {{ user.unread }} unread {{ user.unread === 1 ? 'message' : 'messages' }}.</p>
  <p v-html="html"></p>
</template>
```

`v-text="value"` sets the text content of an element and `v-html="value"` its inner HTML. `v-html` renders the string as HTML: only pass it content you trust.

## Attributes

`:name="expression"`, short for `v-bind:name`, binds an attribute or a DOM property. `null` and `undefined` remove the attribute, and `false` removes a boolean attribute such as `disabled`. `v-bind="object"` spreads every key of an object.

```vibe
<script setup lang="ts">
import { ref } from '@vibejs-org/ui';

const busy = ref(false);
const link = { href: 'https://vibejs.org', target: '_blank', rel: 'noopener' };
</script>

<template>
  <button type="submit" :disabled="busy" :aria-busy="busy">Save</button>
  <a v-bind="link">Docs</a>
</template>
```

The `.prop` modifier always sets a DOM property and `.attr` always an attribute; `.camel` camelizes the name.

## Class and style

`:class` takes a string, an object whose keys are added when their values are truthy, or an array of these. `:style` takes a string, an object of CSS properties in camelCase or kebab-case, or an array. CSS custom properties (`--name`) and `!important` work in both forms. A static `class` or `style` and the bound one are merged.

```vibe
<script setup lang="ts">
import { ref } from '@vibejs-org/ui';

const active = ref(true);
const size = ref(16);
</script>

<template>
  <div class="card" :class="{ active, large: size > 20 }" :style="{ fontSize: `${size}px`, '--accent': 'teal' }">
    <span :class="['badge', active && 'badge-on']">On</span>
  </div>
</template>
```

## Events

`@event="handler"`, short for `v-on:event`, adds a listener. The value is a function, or a statement that runs when the event fires, where `$event` is the event.

```vibe
<script setup lang="ts">
import { ref } from '@vibejs-org/ui';

const count = ref(0);
const text = ref('');
function add(step: number) {
  count.value += step;
}
function submit() {
  text.value = '';
}
function type(event: Event) {
  text.value = (event.target as HTMLInputElement).value;
}
</script>

<template>
  <button type="button" @click="add(1)">Add</button>
  <button type="button" @click.shift="add(10)">Add 10 with Shift</button>
  <form @submit.prevent="submit">
    <input :value="text" @input="type" @keydown.enter.exact="submit" />
  </form>
</template>
```

- Modifiers: `.stop` and `.prevent` call `stopPropagation()` and `preventDefault()`, `.self` ignores events from children, `.once`, `.capture` and `.passive` are listener options, `.ctrl`, `.alt`, `.shift` and `.meta` require the key, `.exact` requires exactly the keys listed, and `.left`, `.middle` and `.right` select the mouse button.
- On `keydown`, `keyup` and `keypress`, other modifiers name keys in kebab case: `.enter`, `.esc`, `.page-down`.
- Each listener is attached to its own element with `addEventListener`; events are not delegated to a common ancestor. `event.currentTarget` is the element, and `.stop` in a handler stops the event from reaching listeners of ancestors.
- The event name is static ([VIBE2303](/errors/VIBE2303)), and there is one attribute per event ([VIBE2302](/errors/VIBE2302)).

## Conditions

`v-if`, `v-else-if` and `v-else` render one of several branches. A branch that is removed is unmounted: its components run their unmount hooks and its state is gone. `<template v-if>` groups several elements without a wrapper.

```vibe
<script setup lang="ts">
import { ref } from '@vibejs-org/ui';

const status = ref<'loading' | 'error' | 'ready'>('loading');
</script>

<template>
  <p v-if="status === 'loading'">Loading…</p>
  <template v-else-if="status === 'error'">
    <h2>Something went wrong</h2>
    <button type="button" @click="status = 'loading'">Retry</button>
  </template>
  <p v-else>Ready</p>
</template>
```

## Lists

`v-for` renders an element for each item of an array, an iterable such as a `Map` or `Set`, the numbers from 1 to `n`, or the values of an object. Every element in a `v-for` needs a unique, stable `:key` ([VIBE2203](/errors/VIBE2203)); only a numeric range needs none.

```vibe
<script setup lang="ts">
import { ref } from '@vibejs-org/ui';

const todos = ref([
  { id: 1, title: 'Write docs', done: false },
  { id: 2, title: 'Ship', done: true },
]);
const scores = { ada: 3, grace: 5 };
</script>

<template>
  <ul>
    <li v-for="(todo, index) in todos" :key="todo.id" :class="{ done: todo.done }">{{ index + 1 }}. {{ todo.title }}</li>
  </ul>
  <dl>
    <template v-for="(score, name) in scores" :key="name">
      <dt>{{ name }}</dt>
      <dd>{{ score }}</dd>
    </template>
  </dl>
  <span v-for="n in 3">{{ n }}</span>
</template>
```

When the list changes, items with the same key keep their elements and state, and the fewest elements are moved. `v-if` and `v-for` cannot share an element ([VIBE2103](/errors/VIBE2103)): filter the list in a `computed` instead.

## v-show

`v-show="condition"` sets `display: none` while the condition is false and keeps the element in the DOM. Use it for content that toggles often; use `v-if` for content that is rarely shown. It applies to elements only, not to components or `<template>`.

## v-model on elements

`v-model` binds a form element to a ref in both directions.

```vibe
<script setup lang="ts">
import { ref } from '@vibejs-org/ui';

const name = ref('');
const age = ref(0);
const agree = ref(false);
const tags = ref<string[]>([]);
const plan = ref('free');
const color = ref('red');
</script>

<template>
  <input v-model.trim="name" />
  <input v-model.number="age" type="number" />
  <input v-model="agree" type="checkbox" />
  <input v-model="tags" type="checkbox" value="news" />
  <input v-model="tags" type="checkbox" value="offers" />
  <input v-model="plan" type="radio" value="free" />
  <input v-model="plan" type="radio" value="pro" />
  <select v-model="color">
    <option value="red">Red</option>
    <option value="blue">Blue</option>
  </select>
</template>
```

- Text inputs and `<textarea>` update on `input`. `.lazy` updates on `change` instead, `.trim` trims the value and `.number` converts it to a number (an `<input type="number">` always does). While an input method composes text, the model is updated when the composition ends.
- A checkbox binds a boolean, or adds and removes its `value` in an array or a `Set`; `true-value` and `false-value` replace `true` and `false`.
- A radio button sets the model to its `value`.
- `<select>` binds the selected option's value; `<select multiple>` binds an array of values.

[Components](./components.md#v-model) can take `v-model` too.

## Template refs

`ref="name"` on an element fills the template ref that the script declares with `useTemplateRef('name')`. Its value is `null` until the element is rendered and again after it is removed; inside `v-for` it is an array of elements.

```vibe
<script setup lang="ts">
import { onMounted, useTemplateRef } from '@vibejs-org/ui';

const input = useTemplateRef<HTMLInputElement>('search');

onMounted(() => input.value?.focus());
</script>

<template>
  <input ref="search" type="search" />
</template>
```

A string ref without a matching `useTemplateRef()` is reported as [VIBE2701](/errors/VIBE2701). A bound `:ref="(el) => ..."` calls the function with the element, and with `null` when it is removed. A ref on a component gives the values that component [exposes](./components.md#exposing-values).

## Dynamic components

`<component :is="value">` renders the component that `value` holds, and nothing for `null` or `undefined`. Changing the value unmounts the previous component.

```vibe
<script setup lang="ts">
import { shallowRef, type Component } from '@vibejs-org/ui';

const props = defineProps<{ views: Record<string, Component> }>();
const current = shallowRef<Component | null>(null);

function open(name: string) {
  current.value = props.views[name] ?? null;
}
</script>

<template>
  <nav>
    <button v-for="(view, name) in views" :key="name" type="button" @click="open(name)">{{ name }}</button>
  </nav>
  <component :is="current" />
</template>
```

`:is` takes a component object, never a name: there is no global registry ([VIBE2006](/errors/VIBE2006), [VIBE5207](/errors/VIBE5207)). Keep a component in a `shallowRef`, which does not make it reactive.
