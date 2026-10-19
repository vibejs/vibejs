import type { VibeError } from '@vibejs-org/errors';
import type { AppConfig } from './runtime/app.ts';
import type { ComponentInstance } from './runtime/instance.ts';

/**
 * The ui console chokepoint: reports a warning in dev builds only. It goes to the app's
 * `config.warnHandler` when one is set (the app of `instance`, or `config`), with the instance
 * and the trace of component names from it to the root; else it is printed.
 */
export function warn(
  error: VibeError,
  instance: ComponentInstance | null = null,
  config: AppConfig | undefined = instance?.appContext.config,
): void {
  if (!__DEV__) return;
  const handler = config?.warnHandler;
  if (!handler) {
    console.warn(error.message);
    return;
  }
  const trace: string[] = [];
  for (let cur = instance; cur; cur = cur.parent) trace.push(`at <${cur.name ?? 'Anonymous'}>`);
  handler(error.message, instance, trace.join('\n'));
}

/** Prints an error in every build: a navigation error with no `onError` handler. */
export function logError(error: unknown): void {
  console.error(error);
}
