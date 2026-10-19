# DOM

## VIBE5401: Invalid v-for source

> v-for cannot iterate over a value of type {type}, so it rendered nothing.

`v-for` iterates over arrays, iterables such as `Map` and `Set`, strings, plain objects (as value, key and index) and a non-negative integer `n` (as `1` to `n`). `null` and `undefined` render nothing without a warning. Any other value, such as a boolean, a function, a negative or a fractional number, renders nothing and reports this warning in development builds.

### Fix

- Pass an array, an iterable, a string, a plain object or a non-negative integer to `v-for`.
- Use `v-if` to skip the list while its source is not ready, or default the source to `[]`.

## VIBE5402: Duplicate keys in v-for

> Two items of a v-for have the key {key}.

`v-for` matches items across updates by their `:key`. When two items share a key, it cannot tell which DOM nodes belong to which item, so it may recreate nodes or keep the state of the wrong item. This warning is reported in development builds.

### Fix

- Key each item by a value that is unique within the list, such as its id.
- Remove the duplicate items from the source before rendering it.
