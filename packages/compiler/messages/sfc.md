# Single-file component blocks

## VIBE1001: Missing template block

> The component has no `<template>` block.

Every `.vibe` file renders its `<template>` block. A file with only a script or a style has nothing to render.

### Fix

- Add a `<template>` block with the markup of the component.

## VIBE1002: Second template block

> The component has a second `<template>` block, and only the first one is used.

A component has exactly one template. The compiler keeps the first `<template>` block and ignores the others.

### Fix

- Merge the markup of both blocks into the first `<template>` block.
- Move the second template into its own `.vibe` file and use it as a component.

## VIBE1003: Second script block

> The component has a second `<script>` block, and only the first one is used.

All of a component's code lives in one `<script setup lang="ts">` block. The compiler keeps the first `<script>` block and ignores the others.

### Fix

- Merge the code of both blocks into the first `<script setup lang="ts">` block.
- Move shared code into a `.ts` module and import it.

## VIBE1004: Script block without setup

> The `<script>` block has no `setup` attribute.

A component's script always runs as its setup function, so the block must be `<script setup lang="ts">`. Component options such as the name or `inheritAttrs` go in `defineOptions()`.

### Fix

- Write the block as `<script setup lang="ts">`.
- Move component options into a `defineOptions()` call inside `<script setup lang="ts">`.

## VIBE1005: Script language is not TypeScript

> The `<script setup>` block needs `lang="ts"` but has {lang}.

Component scripts are TypeScript, so templates and props can be type-checked. Plain JavaScript is valid TypeScript, so existing code keeps working after adding `lang="ts"`.

### Fix

- Write the block as `<script setup lang="ts">`.

## VIBE1006: Block with a src attribute

> The `<{block}>` block has a `src` attribute.

A block's content is written inside the `.vibe` file. Loading it from another file with `src` is not supported.

### Fix

- Move the content of the referenced file into the `<{block}>` block and remove `src`.
- Import TypeScript from another module inside `<script setup lang="ts">`, or CSS with `@import` inside `<style>`.

## VIBE1007: CSS module style

> The `<style>` block has a `module` attribute, and CSS modules are not supported.

Component styles are global or `scoped`. CSS modules, which expose class names to the script, are not available.

### Fix

- Remove `module` and use `<style scoped>` to keep the styles local to the component.

## VIBE1008: Template language

> The `<template>` block has `{attr}`, but templates are plain HTML.

Templates are written in HTML. Template preprocessors are not supported.

### Fix

- Remove `lang` and write the template in HTML.

## VIBE1009: Unknown style language

> The `<style>` block has `{attr}`, which is not one of `css`, `scss`, `sass`, `less`, `styl`, `stylus` or `postcss`.

The style language selects the CSS preprocessor that compiles the block. Without `lang`, the block is plain CSS.

### Fix

- Use one of `css`, `scss`, `sass`, `less`, `styl`, `stylus` or `postcss` as `lang`.
- Remove `lang` for plain CSS.

## VIBE1010: Unknown block attribute

> The `<{block}>` block does not accept the attribute `{name}`.

`<template>` takes no attributes, `<script>` takes `setup` and `lang`, and `<style>` takes `scoped` and `lang`.

### Fix

- Remove `{name}` from the `<{block}>` block.

## VIBE1011: Unknown root block

> `<{tag}>` is not a component block.

At the top level, a `.vibe` file holds one `<template>`, one `<script setup lang="ts">` and any number of `<style>` blocks. Other blocks are not supported.

### Fix

- Move `<{tag}>` into the `<template>` block if it is markup.
- Remove the `<{tag}>` block.

## VIBE1012: Text outside of a block

> Text is outside of every block.

At the top level, a `.vibe` file holds only blocks, comments and whitespace.

### Fix

- Move the text into the `<template>` block.
- Wrap the text in an HTML comment `<!-- -->`.

## VIBE1013: Generic script

> The `<script setup>` block has a `generic` attribute, and generic components are not supported.

A component's props have one type. Type parameters on a component are not available.

### Fix

- Remove `generic` and give the props a concrete type, such as a union of the supported types.
