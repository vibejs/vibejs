# Reactivity

## VIBE5001: Value cannot be made reactive

> {api}() received {value}, which is not an object, so it was returned as-is.

Only objects can be wrapped in a reactive or readonly proxy. A primitive value is returned unchanged and nothing tracks it.

### Fix

- Wrap a primitive value in `ref()` instead of {api}().
- Pass an object, an array, a `Map` or a `Set` to {api}().

## VIBE5002: Mutation of a readonly target

> Cannot {operation} {key}: the target is readonly.

A proxy created by `readonly()` or `shallowReadonly()` ignores writes, deletes and collection mutations, so the target keeps its value and nothing is triggered. The message quotes the key, or says `all entries` for `clear()`.

### Fix

- Mutate the reactive source that the readonly proxy wraps.
- Pass the source to `reactive()` instead of `readonly()` where it must be writable.

## VIBE5003: Write to a readonly computed

> Cannot assign to the value of a computed ref that was created with a getter only.

A computed ref created with `computed(getter)` derives its value from the refs its getter reads, so assigning to its `value` has no effect.

### Fix

- Write to the refs that the getter reads instead.
- Pass an object with `get` and `set` functions to `computed()` when it must be writable.

## VIBE5004: toRefs on a non-reactive object

> toRefs() received a plain object, so its refs will not track changes.

`toRefs()` creates one ref per key that reads and writes the source object. Without a reactive source, nothing tracks reads, so a change made through the object directly does not update readers of the refs.

### Fix

- Pass the object to `reactive()` first and call `toRefs()` on the result.
- Use `ref()` for each value when the object does not need to stay in sync.

## VIBE5005: Run on a stopped effect scope

> Cannot run a function in an effect scope that has already been stopped.

`run()` on a stopped scope returns `undefined` without calling the function, because effects created there could never be stopped.

### Fix

- Create a new scope with `effectScope()` and run the function in it.
- Call `stop()` only after the last `run()` of the scope.

## VIBE5006: Cleanup registered with no owner

> {api}() was called with no active effect scope or watcher, so its cleanup will never run.

A cleanup belongs to the effect scope or watcher that is running when it is registered. Outside of one, nothing calls it.

### Fix

- Call {api}() synchronously inside `effectScope().run()`, a component's setup or a watcher.
- Pass `true` as the second argument of {api}() when running without an owner is expected.

## VIBE5007: Invalid watch source

> watch() cannot watch a source of type {type}: it is not a ref, a getter, a reactive object or an array of these.

`watch()` tracks what its source reads. A plain value, or an object that is not reactive, has nothing to track, so the watcher never fires. In an array of sources, each invalid item reads as `undefined`.

### Fix

- Pass a getter that reads the value, as in `watch(() => state.count, callback)`.
- Pass the object through `reactive()` before watching it, or watch a ref.
