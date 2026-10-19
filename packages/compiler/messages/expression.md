# Template expressions

These codes report template code that is not valid TypeScript: an expression, an event handler, or the parameters of `v-for` and `v-slot`. The reason is the parser's own message, and the range points at the token where parsing stopped. The type checker reports the same problems, so editors show them once.

## VIBE1201: Invalid expression

> The expression is not valid TypeScript: {reason}.

Interpolations and directive values such as `:title`, `v-if` and the source of `v-for` hold exactly one TypeScript expression. Statements, several expressions separated by `;`, and unbalanced brackets or quotes are rejected.

### Fix

- Correct the syntax at the reported position, such as a missing `)` or quote.
- Move multi-step logic into a `computed` value or a function in `<script setup lang="ts">` and use its name in the template.

## VIBE1202: Invalid event handler

> The event handler is not valid TypeScript: {reason}.

A `v-on` value is a function name or member path such as `save` or `form.submit`, a function or arrow such as `(e) => save(e)`, or a list of statements such as `count++` or `select(item); close()`. Statements can read the event as `$event`.

### Fix

- Correct the syntax at the reported position.
- Move the handler into a function in `<script setup lang="ts">` and write its name, as in `@click="save"`.

## VIBE1203: Invalid parameters

> The parameter list is not valid TypeScript: {reason}.

The aliases of `v-for` (`item`, `(item, index)`, a destructuring pattern) and the props of `v-slot` are parameter lists, written as in the parentheses of an arrow function.

### Fix

- Write plain names or a destructuring pattern, as in `v-for="(item, index) in items"`.
- Correct the syntax at the reported position, such as an unclosed pattern.
