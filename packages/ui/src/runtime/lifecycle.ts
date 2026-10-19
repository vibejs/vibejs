// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/apiLifecycle.ts (MIT)
import type { ComponentHandle } from './app.ts';
import { setupInstance, type LifecycleHook } from './instance.ts';

function register(name: LifecycleHook, api: string, hook: () => void): void {
  const instance = setupInstance(api);
  if (instance) (instance.hooks[name] ??= []).push(hook);
}

/** Runs `hook` once the component's DOM is built, before it is inserted. */
export function onBeforeMount(hook: () => void): void {
  register('beforeMount', 'onBeforeMount', hook);
}

/** Runs `hook` after the component is inserted, after the `mounted` hooks of its children. */
export function onMounted(hook: () => void): void {
  register('mounted', 'onMounted', hook);
}

/** Runs `hook` in a flush, before the first update of the component's DOM in it. */
export function onBeforeUpdate(hook: () => void): void {
  register('beforeUpdate', 'onBeforeUpdate', hook);
}

/** Runs `hook` after a flush updated the component's DOM. */
export function onUpdated(hook: () => void): void {
  register('updated', 'onUpdated', hook);
}

/** Runs `hook` before the component unmounts, before the hooks of its children. */
export function onBeforeUnmount(hook: () => void): void {
  register('beforeUnmount', 'onBeforeUnmount', hook);
}

/** Runs `hook` after the component unmounted, after the hooks of its children. */
export function onUnmounted(hook: () => void): void {
  register('unmounted', 'onUnmounted', hook);
}

/**
 * Runs `hook` with an error thrown by a descendant component, the descendant and where it was
 * thrown. Returning `false` stops the error from reaching other hooks and the app.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- `E` lets the caller name the error type
export function onErrorCaptured<E = unknown>(
  hook: (err: E, instance: ComponentHandle | null, info: string) => boolean | void,
): void {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `E` narrows the error for the caller
  setupInstance('onErrorCaptured')?.errorCaptured.push(hook as (err: unknown) => boolean | void);
}
