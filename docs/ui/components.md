---
title: Components
description: Import components, declare props, events, slots and models with the define macros, pass attributes through, and expose values to template refs.
---

# Components

A component is a `.vibe` file. Its default export is imported where it is used, and its tag is written in PascalCase. There are no globally registered components.

```vibe
<script setup lang="ts">
import TodoItem from './TodoItem.vibe';
</script>

<template>
  <ul>
    <TodoItem title="Write docs" />
  </ul>
</template>
```

A kebab-case tag such as `<todo-item>` is an element, not a component ([VIBE2002](/errors/VIBE2002)), and a tag that names no import is reported as [VIBE2001](/errors/VIBE2001).

The macros below declare the interface of a component. They are available in `<script setup lang="ts">` without an import and take their declarations as type arguments, so the parent's template is type-checked against them.

## Props

`defineProps<Props>()` declares the props. Destructuring the result gives each prop a local name, and a default after `=` applies when the parent passes `undefined` or nothing.

```vibe
<script setup lang="ts">
import { computed } from '@vibejs-org/ui';

const { title, done = false, tags = [] } = defineProps<{
  title: string;
  done?: boolean;
  tags?: string[];
}>();

const label = computed(() => `${title} (${tags.length} tags)`);
</script>

<template>
  <li :class="{ done }">{{ label }}</li>
</template>
```

- Props are read-only: assigning one is reported as [VIBE3106](/errors/VIBE3106). Use a [model](#v-model) or emit an event to change a value of the parent.
- An optional boolean prop that the parent does not pass is `undefined`, and an attribute without a value, as in `<TodoItem done />`, passes `true`.
- A default is a literal or reads imports; it cannot read the bindings of the script ([VIBE3105](/errors/VIBE3105)). An object or array default is created for each instance.
- Without destructuring, `const props = defineProps<Props>()` gives an object, and `props.title` reads a prop.

### Reading props

A destructured prop is not a copy: each read calls into the parent and evaluates the expression the parent bound, so it always sees the current value. Put an expensive derivation in a `computed`, as `label` above, so it runs only when its inputs change. To pass a prop to a function that tracks its argument, such as `watch` or `toRef`, pass a getter: `watch(() => title, ...)` ([VIBE3107](/errors/VIBE3107)).

## Events

`defineEmits<Events>()` declares the events as a record whose keys are the event names and whose values are the payload tuples. The returned function emits them.

```vibe
<script setup lang="ts">
const { id } = defineProps<{ id: number }>();
const emit = defineEmits<{
  remove: [id: number];
  rename: [id: number, title: string];
}>();
</script>

<template>
  <button type="button" @click="emit('remove', id)">Remove</button>
  <button type="button" @click="emit('rename', id, 'Untitled')">Reset title</button>
</template>
```

The parent listens with `@remove="handler"`. The handler receives the payload, not a DOM event, so event modifiers do not apply to component events ([VIBE2305](/errors/VIBE2305)). Emitting an event that is not declared warns VIBE5202 in development.

## Slots

A component renders content from its parent where it places `<slot>`. Named slots take a `name`, and attributes on `<slot>` are passed to the parent as slot props. `defineSlots<Slots>()` declares the slots and their props.

```vibe [ItemList.vibe]
<script setup lang="ts">
defineSlots<{
  default?: (props: { item: string; index: number }) => unknown;
  header?: (props: {}) => unknown;
}>();

const { items } = defineProps<{ items: string[] }>();
</script>

<template>
  <section>
    <header><slot name="header">Items</slot></header>
    <ul>
      <li v-for="(item, index) in items" :key="item">
        <slot :item="item" :index="index">{{ item }}</slot>
      </li>
    </ul>
  </section>
</template>
```

The parent passes slot content with `<template #name>` and receives the slot props with `#name="props"`. Content outside named templates is the default slot.

```vibe
<script setup lang="ts">
import ItemList from './ItemList.vibe';
</script>

<template>
  <ItemList :items="['a', 'b']">
    <template #header>Letters</template>
    <template #default="{ item, index }">{{ index }}: {{ item.toUpperCase() }}</template>
  </ItemList>
</template>
```

Slot names are static ([VIBE2605](/errors/VIBE2605)); to choose between slots, put `v-if` on the slot templates.

### Fallback content

The children of `<slot>` render when the parent passes no content for that slot. A slot that the parent passes renders the parent's content, even when that content renders nothing, such as a `v-if` that is false. To show the fallback in that case, put the condition on the `<template #name>` itself, so the slot is not passed.

### Slots in script

`useSlots()` returns the slots the component received, and `$slots` reads them in the template. Use them to test whether a slot was passed, as in `v-if="$slots.header"`. Calling a slot function renders its content and creates its DOM nodes, so a slot is only called by `<slot>`, not to inspect what it contains.

## v-model

`defineModel()` declares a two-way value. Reading the returned ref reads the prop, and assigning it emits the update event to the parent.

```vibe
<script setup lang="ts">
const text = defineModel<string>({ required: true });
const open = defineModel<boolean>('open', { default: () => false });
</script>

<template>
  <input v-model="text" />
  <button type="button" @click="open = !open">{{ open ? 'Hide' : 'Show' }}</button>
</template>
```

The parent binds the default model with `v-model="text"` and a named one with `v-model:open="visible"`. `v-model` is the `modelValue` prop plus the `onUpdate:modelValue` event, and `v-model:open` is `open` plus `onUpdate:open`. Without `required` or a `default`, the model's type includes `undefined`. A model whose parent binds nothing keeps a local value.

## Attributes

Attributes and listeners that a parent passes but the component does not declare as props or events are its attributes. When the component renders a single root element, they are added to it: `class` and `style` are merged with the root's own, and listeners are added next to the root's. When the root is another component, they pass on to that component.

```vibe
<script setup lang="ts">
import { useAttrs } from '@vibejs-org/ui';

defineOptions({ inheritAttrs: false });
const { label } = defineProps<{ label: string }>();
const attrs = useAttrs();
console.log(Object.keys(attrs));
</script>

<template>
  <label>
    {{ label }}
    <input v-bind="$attrs" />
  </label>
</template>
```

`defineOptions({ inheritAttrs: false })` keeps the attributes off the root, so that `v-bind="$attrs"` can place them on another element. `useAttrs()` returns them in the script. A component with several root elements does not receive attributes and warns VIBE5201 in development when it is passed some.

## Exposing values

A template ref on a component holds the values the component passes to `defineExpose()`, with refs unwrapped. Nothing else of the component is reachable: not its props, not its other bindings and not its elements.

```vibe [SearchField.vibe]
<script setup lang="ts">
import { ref, useTemplateRef } from '@vibejs-org/ui';

const field = useTemplateRef<HTMLInputElement>('field');
const text = ref('');

defineExpose({
  focus: () => field.value?.focus(),
  clear: () => (text.value = ''),
});
</script>

<template>
  <input ref="field" v-model="text" />
</template>
```

```vibe
<script setup lang="ts">
import { onMounted, useTemplateRef } from '@vibejs-org/ui';
import SearchField from './SearchField.vibe';

const search = useTemplateRef('search');
onMounted(() => search.value?.focus());
</script>

<template>
  <SearchField ref="search" />
</template>
```

The ref's type is the exposed object of `SearchField`, so `search.value?.focus()` is checked. A component that calls no `defineExpose()` exposes an empty object.
