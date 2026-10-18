import { DOCS_BASE } from './docs-base.gen.ts';
import { VibeError, type ErrorCode } from './vibe-error.ts';

type Args = Readonly<Record<string, string | number>>;

export type ErrorTable = {
  readonly [code: ErrorCode]: readonly [message: string, ...fixes: string[]];
};

export type Placeholders<S> = S extends `${string}{${infer P}}${infer R}`
  ? P | Placeholders<R>
  : never;

export type VibeErrorFactory<T extends ErrorTable> = <C extends keyof T & ErrorCode>(
  code: C,
  ...rest: [Placeholders<T[C][number]>] extends [never]
    ? [args?: undefined, options?: ErrorOptions]
    : [args: Record<Placeholders<T[C][number]>, string | number>, options?: ErrorOptions]
) => VibeError;

/** The docs page of a code; non-empty args become the query the page renders the message from. */
export function docsUrl(code: ErrorCode, args: Args = {}): string {
  // Not `query.size`: Safari 16.4-16.x and Chrome 111-112 (Vite 8 baseline) lack it.
  const query = new URLSearchParams(
    Object.entries(args).map(([k, v]) => [k, String(v)]),
  ).toString();
  return query ? `${DOCS_BASE}${code}?${query}` : DOCS_BASE + code;
}

/**
 * Creates the typed `vibeError()` of a package. When `load()` returns no table (the ui prod
 * build), the message is only the code and the docs URL with the encoded args.
 */
export function defineErrors<T extends ErrorTable>(load: () => T | undefined): VibeErrorFactory<T> {
  const create = (code: ErrorCode, args: Args = {}, options?: ErrorOptions): VibeError => {
    const entry: readonly string[] | undefined = load()?.[code];
    if (!entry) {
      const docs = docsUrl(code, args);
      return new VibeError({ code, message: `[${code}] ${docs}`, fixes: [], docs, args }, options);
    }
    const [message, ...fixes] = entry.map((text) =>
      text.replace(/\{(\w+)\}/g, (_, key: string) => String(args[key])),
    );
    const docs = docsUrl(code);
    const lines = [
      `[${code}] ${message}`,
      ...fixes.map((fix) => `  Fix: ${fix}`),
      `  Docs: ${docs}`,
    ];
    return new VibeError({ code, message: lines.join('\n'), fixes, docs, args }, options);
  };
  return create;
}
