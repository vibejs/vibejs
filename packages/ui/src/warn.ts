import type { VibeError } from '@usevibejs/errors';
import type { AppConfig } from './runtime/app.ts';
import type { ComponentInstance } from './runtime/instance.ts';

/**
 * The ui console chokepoint: reports a warning in dev builds only. It goes to the app's
 * `config.warnHandler` when one is set (the app of `instance`, or `config`), with the instance
 * and the trace from it to the root (see `formatTrace`); else it is printed, followed by the trace.
 */
export function warn(
  error: VibeError,
  instance: ComponentInstance | null = null,
  config: AppConfig | undefined = instance?.appContext.config,
): void {
  if (!__DEV__) return;
  const trace = formatTrace(instance);
  const handler = config?.warnHandler;
  if (handler) handler(error.message, instance, trace);
  else console.warn(trace ? `${error.message}\n${trace}` : error.message);
}

/**
 * The component chain from `instance` to the root, one `at <Name> (src/A.vibe)` line each; the
 * file is known in dev builds only.
 */
export function formatTrace(instance: ComponentInstance | null): string {
  const lines: string[] = [];
  for (let cur = instance; cur; cur = cur.parent) {
    const file = cur.file ? ` (${cur.file})` : '';
    lines.push(`at <${cur.name ?? 'Anonymous'}>${file}`);
  }
  return lines.join('\n');
}

/**
 * Prints an error in every build, such as a navigation error with no `onError` handler, followed
 * by the dev-only `details` when there are any.
 */
export function logError(error: unknown, details = ''): void {
  if (details) console.error(error, details);
  else console.error(error);
}
