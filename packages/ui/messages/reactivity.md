# Reactivity

## VIBE5003: Write to a readonly computed

> Cannot assign to the value of a computed ref that was created with a getter only.

A computed ref created with `computed(getter)` derives its value from the refs its getter reads, so assigning to its `value` has no effect.

### Fix

- Write to the refs that the getter reads instead.
- Pass an object with `get` and `set` functions to `computed()` when it must be writable.

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
