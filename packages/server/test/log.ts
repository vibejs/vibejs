import { JsonLogger, type Logger, type LogLevel } from '../src/logger.ts';

export type LogEntry = Readonly<Record<string, unknown>>;

/** A `JsonLogger` that collects its parsed entries in `lines`. */
export function captureLog(
  level?: LogLevel,
  fields?: LogEntry,
): { readonly lines: LogEntry[]; readonly logger: Logger } {
  const lines: LogEntry[] = [];
  const logger = new JsonLogger({
    level,
    fields,
    write: (line) => {
      const entry: LogEntry = JSON.parse(line);
      lines.push(entry);
    },
  });
  return { lines, logger };
}

/** The error that `fn` throws or rejects with, or `undefined`. */
export async function caught(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
