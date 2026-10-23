import { isVibeError } from '@usevibejs/errors';

/** The VIBE codes of the warnings that a `console.warn` or `warnHandler` spy received, in order. */
export const warnedCodes = (spy: { mock: { calls: unknown[][] } }): string[] =>
  spy.mock.calls.map(([message]) => /^\[(VIBE\d{4})\]/.exec(String(message))?.[1] ?? '');

/** The VIBE code of the error that `fn` throws, if it throws one. */
export function thrownCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (isVibeError(error)) return error.code;
  }
  return undefined;
}
