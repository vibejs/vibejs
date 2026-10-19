# Script setup

These codes report `<script setup lang="ts">` code that the compiler cannot turn into a component: module syntax that has no place in a setup function, misuse of the compiler macros (`defineProps`, `defineEmits`, `defineModel`, `defineSlots`, `defineExpose`, `defineOptions`), and props, events or models that cannot be read from their declarations. The range points at the code to change.

## VIBE3001: Value export

> A `<script setup>` block cannot export values.

The block becomes the setup function of the component, so its values exist once per instance and cannot be exported. Types can be exported with `export type` and `export interface`.

### Fix

- Move the exported value into a `.ts` module and import it here and wherever else it is used.
- Export only types, with `export type` or `export interface`.

## VIBE3002: Top-level await

> `await` cannot be used at the top level of `<script setup>`.

The setup function of a component runs synchronously, so it cannot wait at its top level.

### Fix

- Start the work inside an `async` function and store the result in a `ref` when it arrives.
- Await inside a function that an event or a `watch` callback calls.

## VIBE3003: Invalid script

> The script is not valid TypeScript: {reason}.

The script could not be parsed, so its bindings and macros are unknown. The reason is the parser's own message, and the range points at the token where parsing stopped.

### Fix

- Correct the syntax at the reported position, such as a missing bracket, quote or comma.

## VIBE3004: Misplaced macro

> `{macro}()` must be a top-level statement or the initializer of a top-level `const`.

The compiler macros run while the component compiles, so each call stands on its own at the top level of the script, as a statement or as the only initializer of a `const` declaration. `{macro}` is the name of the macro.

### Fix

- Move the call to the top level of the script and assign it with its own `const`, as in `const emit = defineEmits<Events>()`.
- Split a declaration with several variables so the macro call has its own `const`.

## VIBE3005: Macro called twice

> `{macro}()` is called more than once.

A component declares its props, events, slots, exposed value and options once. `{macro}` is the name of the macro.

### Fix

- Merge both declarations into the first `{macro}()` call and remove the second one.

## VIBE3006: withDefaults

> `withDefaults()` is not supported.

Prop defaults are written in the destructuring pattern of `defineProps`, where each default sits next to its prop.

### Fix

- Destructure the props and write each default after its name, as in `size = 'medium'` inside the pattern.

### Example

```ts
const { size = 'medium' } = defineProps<{ size?: 'small' | 'medium' }>();
```

## VIBE3007: Reserved name

> `{name}` is reserved for the compiled component.

The compiled component declares names such as `__props`, `__ctx`, `_setup`, `_defaults`, `_sfc`, `$setup`, `$props`, `$ctx` and an underscore before each runtime helper, as in `_createIf`. A top-level binding with one of these names would collide with them. `{name}` is the binding.

### Fix

- Rename `{name}`.

## VIBE3008: Macro imported or declared

> `{macro}` is a compiler macro and cannot be imported or declared.

The compiler macros are available in every `<script setup lang="ts">` block without an import, and the compiler replaces each call. An import or a declaration with the same name would hide the macro. `{macro}` is the name.

### Fix

- Remove the import or the declaration of `{macro}` and call the macro directly.

## VIBE3009: Binding shadows a prop

> `{name}` is a prop and also a binding of the script.

The template reads `{name}` from one place only, so a prop and a script binding cannot share a name.

### Fix

- Rename the binding of the script.
- Rename the prop in its type and in the parent components that pass it.

## VIBE3010: Namespace or import alias

> `{syntax}` declarations cannot be used in `<script setup>`.

The block becomes the body of the setup function, and TypeScript allows namespace declarations and `import x =` aliases only at the top level of a module. `{syntax}` is the declaration.

### Fix

- Move the namespace into a `.ts` module and import it here.
- Write `import x = N.y` as `const x = N.y`, and `import x = require('m')` as an `import` declaration.

## VIBE3101: Runtime props declaration

> `defineProps()` takes no arguments; the props are declared by its type argument.

Props are declared with a TypeScript type, as in `defineProps<Props>()`, and defaults are written in the destructuring pattern.

### Fix

- Remove the argument and declare the props as the type argument.

## VIBE3102: Missing type argument

> `{macro}()` needs a type argument.

`defineProps`, `defineEmits` and `defineSlots` read their declaration from their type argument, as in `defineProps<Props>()`. `{macro}` is the name of the macro.

### Fix

- Add the type argument, as in `{macro}<Declaration>()`, with `Declaration` declared in this file.

## VIBE3103: Unknown prop names

> The prop names cannot be read from the type argument of `defineProps`.

The compiler lists the props of a component without running the type checker. It reads them from a type declared in this file (a type literal, an interface, an alias, `&`, `|`, `Partial`, `Required`, `Readonly`, `Pick` or `Omit` over such types) or from the destructuring pattern.

### Fix

- Destructure the props, so each name is written in the script.
- Declare the props type in this file, as an interface or a type literal.

## VIBE3104: Rest element in props

> `...{name}` collects the remaining props, which is not supported.

A props destructure names each prop it reads. Attributes that are not props fall through to the root element and are available as `$attrs`. `{name}` is the rest binding.

### Fix

- Name each prop in the destructuring pattern and remove `...{name}`.
- Read attributes that are not props with `$attrs` in the template.

## VIBE3105: Default reads a script binding

> The default of `{prop}` reads `{name}`, which is declared in the script.

Prop defaults are evaluated outside the setup function, where the bindings of the script do not exist yet. Literals, globals and imports are available.

### Fix

- Write the default as a literal, or compute it from imported values.
- Move `{name}` into a `.ts` module and import it.

## VIBE3106: Assignment to a prop

> `{name}` is a destructured prop and cannot be assigned.

Props belong to the parent component and are read-only inside the child.

### Fix

- Declare a two-way value with `defineModel()` and assign its `value`.
- Emit an event and let the parent change the value it passes.
- Copy the prop into a `ref` for a local value that starts from the prop.

## VIBE3107: Destructured prop passed by value

> `{name}` is a destructured prop passed directly to `{fn}()`, which receives its current value only.

A destructured prop reads the current prop value each time it is used. Passed to `{fn}()`, it is read once, so later changes are not seen.

### Fix

- Pass a getter instead, as in `{fn}(() => {name})`.

## VIBE3108: Unsupported props pattern

> A props destructure supports only names, renames and defaults.

Each property of the pattern names a prop (`title`), renames it (`title: heading`) or gives it a default (`title = 'Untitled'`). Computed keys and nested patterns are not supported.

### Fix

- Destructure the prop by its name and read nested values from it in the code.

## VIBE3201: Runtime events declaration

> `defineEmits()` takes no arguments; the events are declared by its type argument.

Events are declared with a TypeScript type whose properties are the event names and whose values are the payload tuples.

### Fix

- Remove the argument and declare the events as the type argument.

## VIBE3202: Events type is not a record of tuples

> The events type must be a record of payload tuples.

Each property of the events type is an event name, and its type is the tuple of arguments the event passes. Call signatures, method signatures and other value types are not supported.

### Fix

- Write each event as a property whose type is the tuple of its arguments, such as `pick: [id: string]`.

### Example

```ts
const emit = defineEmits<{ pick: [id: string]; close: [] }>();
```

## VIBE3203: Events type from another file

> The events type `{type}` is not declared in this file.

The compiler lists the events of a component without running the type checker, so it reads them from a type declared in this file. `{type}` is the type argument.

### Fix

- Declare the events type in this file, as an interface or a type literal.

## VIBE3311: Runtime slots declaration

> `defineSlots()` takes no arguments; the slots are declared by its type argument.

Slots are declared with a TypeScript type whose properties are the slot names and whose values are functions of the slot props.

### Fix

- Remove the argument and declare the slots as the type argument.

## VIBE3321: Unsupported defineModel call

> This `defineModel()` call is not supported: {reason}.

A model is assigned to a `const`, optionally named by a string literal, and optionally configured by an object literal with a boolean `required` and a `default` function, as in `const title = defineModel<string>('title', { required: true })`. `{reason}` says which part is not supported.

### Fix

- Assign the model to a `const`, as in `const value = defineModel<string>()`.
- Name the model with a string literal and pass only `required: true` or `default: () => value` as options.

## VIBE3322: Duplicate model

> `{name}` is already declared as a model or a prop.

Each model adds a prop named after it, so its name is unique among the models and the props. `{name}` is the model name.

### Fix

- Give the model another name.
- Remove the prop or the second model of the same name.

## VIBE3331: Unsupported component options

> `defineOptions()` takes an object literal with only a string `name` and a boolean `inheritAttrs`.

The options are read while the component compiles, so they are literals.

### Fix

- Pass literal values, such as `name: 'TodoList'` and `inheritAttrs: false`.
