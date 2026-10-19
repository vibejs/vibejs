// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/errorHandling.ts (MIT)
import { vibeError } from '../errors.gen.ts';
import { logError } from '../warn.ts';

/** Where an error was thrown; the same strings in dev and prod builds. */
export type ErrorInfo =
  | 'watcher getter'
  | 'watcher callback'
  | 'watcher cleanup'
  | 'scheduler flush';

/** The one place errors of user code end up. It reports them and never rethrows. */
export function handleError(err: unknown, info: ErrorInfo): void {
  logError(vibeError('VIBE5102', { info }, { cause: err }));
}

/** Calls `fn`; an error it throws goes to `handleError` and the call returns `undefined`. */
export function callWithErrorHandling<A extends unknown[], R>(
  fn: (...args: A) => R,
  info: ErrorInfo,
  args?: A,
): R | undefined {
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- without args, `fn` takes none
    return fn(...(args ?? ([] as unknown[] as A)));
  } catch (err) {
    handleError(err, info);
    return undefined;
  }
}

/** Like `callWithErrorHandling`; the rejection of a returned promise goes to `handleError` too. */
export function callWithAsyncErrorHandling<A extends unknown[], R>(
  fn: (...args: A) => R,
  info: ErrorInfo,
  args?: A,
): R | undefined {
  const result = callWithErrorHandling(fn, info, args);
  if (result instanceof Promise) {
    result.catch((err: unknown) => {
      handleError(err, info);
    });
  }
  return result;
}
