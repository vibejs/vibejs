export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
export type LogFields = Readonly<Record<string, unknown>>;

/** Writes structured log entries; it is also the DI token of the application logger. */
export abstract class Logger {
  abstract debug(msg: string, fields?: LogFields): void;
  abstract info(msg: string, fields?: LogFields): void;
  abstract warn(msg: string, fields?: LogFields): void;
  abstract error(msg: string, fields?: LogFields): void;
  /** A logger that adds `fields` to every entry. */
  abstract child(fields: LogFields): Logger;
}

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

/**
 * An `Error` as plain JSON: name, message, stack, and its `code` and `cause` when present. A cause
 * cycle ends in `'[Circular]'`.
 */
function serialize(value: unknown, seen = new WeakSet<Error>()): unknown {
  if (!(value instanceof Error)) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const { name, message, stack } = value;
  const code: unknown = Reflect.get(value, 'code');
  return {
    name,
    message,
    stack,
    ...(code === undefined ? {} : { code }),
    ...(value.cause === undefined ? {} : { cause: serialize(value.cause, seen) }),
  };
}

/**
 * Writes one JSON line per entry: `{ time, level, msg, ...fields }`; fields named `time`, `level`
 * or `msg` are dropped. Entries below `level`
 * (default `info`) are dropped, and `silent` drops all. `write` defaults to `console.log`.
 */
export class JsonLogger extends Logger {
  readonly #options: ConstructorParameters<typeof JsonLogger>[0] & {};

  constructor(
    options: {
      readonly level?: LogLevel;
      readonly fields?: LogFields;
      readonly write?: (line: string) => void;
    } = {},
  ) {
    super();
    this.#options = options;
  }

  #log(level: Exclude<LogLevel, 'silent'>, msg: string, fields: LogFields = {}): void {
    const { level: min = 'info', fields: base, write } = this.#options;
    if (RANK[level] < RANK[min]) return;
    const head = { time: new Date().toISOString(), level, msg };
    const entry = Object.fromEntries(
      Object.entries({ ...base, ...fields })
        .filter(([key]) => !Object.hasOwn(head, key))
        .map(([key, value]) => [key, serialize(value)]),
    );
    const line = JSON.stringify({ ...head, ...entry });
    // oxlint-disable-next-line eslint/no-console -- the default destination of the logger
    (write ?? console.log)(line);
  }

  debug(msg: string, fields?: LogFields): void {
    this.#log('debug', msg, fields);
  }
  info(msg: string, fields?: LogFields): void {
    this.#log('info', msg, fields);
  }
  warn(msg: string, fields?: LogFields): void {
    this.#log('warn', msg, fields);
  }
  error(msg: string, fields?: LogFields): void {
    this.#log('error', msg, fields);
  }
  child(fields: LogFields): Logger {
    return new JsonLogger({ ...this.#options, fields: { ...this.#options.fields, ...fields } });
  }
}
