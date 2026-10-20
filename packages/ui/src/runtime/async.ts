import { vibeError } from '../errors.gen.ts';
import { activeEffectScope, onScopeDispose } from '../reactivity/effectScope.ts';
import { shallowRef, type ShallowRef } from '../reactivity/ref.ts';
import { onWatcherCleanup, watchEffect } from './watch.ts';

const release = (waiters: (() => void)[]): void => waiters.forEach((resolve) => resolve());

/**
 * Loads data with `fn` and keeps it current: `fn` runs again, after the previous run is aborted,
 * when a reactive value that it read before its first `await` changes, and the current run is
 * aborted when the owner scope stops. An aborted run never touches `data`, `error` or `loading`.
 * `error` holds what `fn` throws; with the typed client, HTTP and network failures are values in
 * `data`. `refresh()` runs `fn` again and resolves, never rejects, once that run is over; called
 * from `fn` before its first `await`, it joins the run that is starting.
 *
 * @example
 * const todo = useAsync((signal) => api.todos.one({ params: { id: route.params.id } }, { signal }));
 * // In the template: <p v-if="todo.data.value?.ok">{{ todo.data.value.data.title }}</p>
 */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>): {
  readonly data: Readonly<ShallowRef<T | undefined>>;
  readonly error: Readonly<ShallowRef<unknown>>;
  readonly loading: Readonly<ShallowRef<boolean>>;
  refresh(): Promise<void>;
} {
  const scope = activeEffectScope;
  if (!scope) throw vibeError('VIBE7301');
  const data = shallowRef<T | undefined>(undefined);
  const error = shallowRef<unknown>(undefined);
  const loading = shallowRef(false);
  const runs = shallowRef(0);
  // The `refresh()` calls that wait for the next run.
  let pending: (() => void)[] = [];
  // The waiters of the run whose synchronous part is executing, if any.
  let starting: (() => void)[] | undefined;

  watchEffect(() => {
    void runs.value;
    const waiters = pending;
    pending = [];
    const controller = new AbortController();
    onWatcherCleanup(() => {
      controller.abort();
      release(waiters);
    });
    loading.value = true;
    error.value = undefined;
    const settle = (apply: () => void): void => {
      if (!controller.signal.aborted) {
        apply();
        loading.value = false;
      }
      release(waiters);
    };
    starting = waiters;
    // The executor runs now, so `fn` is tracked and a synchronous throw becomes a rejection.
    new Promise<T>((resolve) => resolve(fn(controller.signal))).then(
      (value) => settle(() => (data.value = value)),
      (reason: unknown) => settle(() => (error.value = reason)),
    );
    starting = undefined;
  });
  onScopeDispose(() => release(pending));

  return {
    data,
    error,
    loading,
    refresh() {
      if (!scope.active) return Promise.resolve();
      // A watcher does not trigger itself, so a call from inside the run joins it.
      const waiters = starting ?? pending;
      if (!starting) runs.value++;
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}
