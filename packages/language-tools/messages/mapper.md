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

## VIBE6090: Internal content mapper error

> The content mapper failed on this file: {reason}

This is a bug in vibe.js, not in your code. The file is type-checked as an empty module until the bug is fixed.

### Fix

- Report the bug with this file at https://github.com/vibejs/vibejs/issues.
