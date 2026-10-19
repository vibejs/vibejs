// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/errorHandling.ts (MIT)
import { vibeError } from '../errors.gen.ts';
import { logError } from '../warn.ts';
import type { ComponentInstance, LifecycleHook } from './instance.ts';

/** Where an error was thrown; the same strings in dev and prod builds. */
export type ErrorInfo =
  | 'setup function'
  | 'render effect'
  | 'watcher getter'
  | 'watcher callback'
  | 'watcher cleanup'
  | 'scheduler flush'
  | 'native event handler'
  | 'component event handler'
  | `${LifecycleHook} hook`
  | 'errorCaptured hook'
  | 'template ref';

/**
 * The one place errors of user code end up. The `onErrorCaptured` hooks of the ancestors of
 * `instance` see it first, nearest first, and one that returns `false` stops it; then the app's
 * `config.errorHandler`; else it is logged as VIBE5102. It never rethrows: an error of a hook
 * goes on from the hook's component as `'errorCaptured hook'`, and an error of the app handler is
 * logged as VIBE5102.
 */
export function handleError(
  err: unknown,
  instance: ComponentInstance | null,
  info: ErrorInfo,
): void {
  for (let cur = instance?.parent; cur; cur = cur.parent) {
    for (const hook of cur.errorCaptured) {
      const args: [unknown, ComponentInstance | null, string] = [err, instance, info];
      if (callWithErrorHandling(hook, cur, 'errorCaptured hook', args) === false) return;
    }
  }
  const handler = instance?.appContext.config.errorHandler;
  if (!handler) {
    logError(vibeError('VIBE5102', { info }, { cause: err }));
    return;
  }
  try {
    handler(err, instance, info);
  } catch (handlerErr) {
    logError(vibeError('VIBE5102', { info: 'config.errorHandler' }, { cause: handlerErr }));
  }
}

/** Calls `fn`; an error it throws goes to `handleError` and the call returns `undefined`. */
export function callWithErrorHandling<A extends unknown[], R>(
  fn: (...args: A) => R,
  instance: ComponentInstance | null,
  info: ErrorInfo,
  args?: A,
): R | undefined {
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- without args, `fn` takes none
    return fn(...(args ?? ([] as unknown[] as A)));
  } catch (err) {
    handleError(err, instance, info);
    return undefined;
  }
}

/** Like `callWithErrorHandling`; the rejection of a returned promise goes to `handleError` too. */
export function callWithAsyncErrorHandling<A extends unknown[], R>(
  fn: (...args: A) => R,
  instance: ComponentInstance | null,
  info: ErrorInfo,
  args?: A,
): R | undefined {
  const result = callWithErrorHandling(fn, instance, info, args);
  if (result instanceof Promise) {
    result.catch((err: unknown) => {
      handleError(err, instance, info);
    });
  }
  return result;
}
