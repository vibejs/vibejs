# Style blocks

## VIBE4002: Slot content selector

> `{selector}` is not supported in component styles.

A selector that targets the content a parent passes into a slot is not available. The parent styles its own slot content.

### Fix

- Style the slot content in the `<style scoped>` block of the component that passes it.
- Wrap the selector in `:global()` to write a global rule.

## VIBE4003: Binding in CSS

> `v-bind()` is not supported in component styles.

Style values cannot read component state from CSS. Bind the value in the template instead.

### Fix

- Set a CSS custom property such as `--color` with `:style` in the template, and read it with `var(--color)`.
- Bind a class or style in the template with `:class` or `:style`.

## VIBE4004: Deprecated deep selector

> `{selector}` is not supported in component styles.

The `>>>`, `/deep/`, `::v-deep` and `::v-global` forms are not available. Scoped styles reach into child components with `:deep()` and write global rules with `:global()`.

### Fix

- Write `:deep(.child)` to style `.child` inside child components.
- Write `:global(.name)` for a rule that is not scoped.
