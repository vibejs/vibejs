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

/** An `Error` as plain JSON: name, message, stack, and its `code` and `cause` when present. */
function serialize(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  const { name, message, stack } = value;
  const code: unknown = Reflect.get(value, 'code');
  return {
    name,
    message,
    stack,
    ...(code === undefined ? {} : { code }),
    ...(value.cause === undefined ? {} : { cause: serialize(value.cause) }),
  };
}

/**
 * Writes one JSON line per entry: `{ time, level, msg, ...fields }`. Entries below `level`
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
    const entry = Object.fromEntries(
      Object.entries({ ...base, ...fields }).map(([key, value]) => [key, serialize(value)]),
    );
    const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...entry });
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
