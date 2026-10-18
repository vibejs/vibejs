import type { VibeError } from '@vibejs-org/errors';

/** The ui console chokepoint: prints a warning in dev builds only. */
export function warn(error: VibeError): void {
  if (__DEV__) console.warn(error.message);
}
