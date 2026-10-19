# Style blocks

## VIBE4001: CSS syntax error

> The CSS of a scoped style block has a syntax error: {reason}.

A `<style scoped>` block is parsed as plain CSS after any preprocessor has run, so the position points into the CSS that the compiler received. Typical causes are an unclosed `{`, string, comment or bracket, and text that is not a declaration, rule or at-rule.

### Fix

- Close the block, string, comment or bracket that starts at the reported position.
- Write a declaration as `property: value;` inside a rule.

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

## VIBE4005: Malformed :deep() or :global()

> {escape} needs exactly one selector as its argument.

`:deep(selector)` styles elements of child components, and `:global(selector)` writes a selector without the component scope. Each one takes exactly one selector. Without an argument, with an empty argument or with a comma-separated list, the compiler cannot tell which part of the selector to leave unscoped.

### Fix

- Wrap exactly one selector, such as `:deep(.child)` or `:global(.theme-dark)`.
- Split a list into one escape per selector, such as `:deep(.a), :deep(.b)`.

### Example

```css
.list :deep(.item) {
  color: red;
}
```
