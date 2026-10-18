import type { VibeError } from '@vibejs-org/errors';

/** The ui console chokepoint: prints a warning in dev builds only. */
export function warn(error: VibeError): void {
  if (__DEV__) console.warn(error.message);
}

/** Prints an error in every build: a navigation error with no `onError` handler. */
export function logError(error: unknown): void {
  console.error(error);
}
