# Async

## VIBE7301: useAsync called with no owner scope

> useAsync() was called with no owner scope, so nothing could abort its runs or stop it.

`useAsync()` belongs to the component or the effect scope that calls it: its runs are aborted and its watcher stops when that owner unmounts or stops. Called outside of one, nothing would ever stop it, so it throws instead.

### Fix

- Call `useAsync()` in a component's `setup`, or in a composable that `setup` calls.
- Outside of a component, call it inside `effectScope().run()` and stop the scope when the data is no longer needed.
