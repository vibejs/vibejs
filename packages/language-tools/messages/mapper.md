# Content mapper

## VIBE6001: Unknown content mapper option

> The `@vibejs-org/language-tools` content mapper takes no options, but the `contentMappers` entry sets `{option}`.

The content mapper has no settings: every `.vibe` file is type-checked the same strict way. An `options` object in the `contentMappers` entry of `tsconfig.json` is not read.

### Fix

- Remove `{option}` from the `options` of the `@vibejs-org/language-tools` entry in `contentMappers`.

## VIBE6002: UTF-16 positions not offered

> The TypeScript host does not offer UTF-16 positions, which the content mapper needs.

The content mapper reports every position as a UTF-16 offset, the unit of JavaScript strings. A TypeScript version that offers only other position encodings cannot use it.

### Fix

- Update `typescript` to the version that `@vibejs-org/language-tools` supports.

## VIBE6010: Unused @vibe-expect-error directive

> This `<!-- @vibe-expect-error -->` suppresses no type error.

A `<!-- @vibe-expect-error -->` comment in the template expects a type error in the element or interpolation right after it (whitespace and other comments in between are skipped). It reports itself when there is no error to suppress:

- No error below it: the code it covers type-checks, for example after the error was fixed.
- Nothing to cover: the next sibling is text, there is no next sibling, the comment is inside the element of another `@vibe-expect-error`, or the element is not type-checked (a plain `<template>`).

### Fix

- Remove the comment when the error below it is fixed.
- Move the comment right before the element or interpolation whose error it expects.

## VIBE6090: Internal content mapper error

> The content mapper failed on this file: {reason}

This is a bug in vibe.js, not in your code. The file is type-checked as an empty module until the bug is fixed.

### Fix

- Report the bug with this file at https://github.com/vibejs/vibejs/issues.
