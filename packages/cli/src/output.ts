import type { ErrorCode, VibeError } from '@vibejs-org/errors';
import type { CatalogEntry } from './catalog.gen.ts';

// C9 types, verbatim. Key order is part of the contract: results are built in this order.
export interface MissingInput {
  name: string;
  flag?: string;
  values?: string[];
  example: string;
}

export interface JsonEnvelope {
  ok: boolean;
  command: string;
  version: string;
  next?: string[];
  error?: {
    code: ErrorCode;
    message: string;
    docs: string;
    fixes?: string[];
    missing?: MissingInput[];
  };
}

export interface CommandHelp {
  name: string;
  aliases: string[];
  summary: string;
  usage: string;
  examples: string[];
  options: {
    name: string;
    type: 'string' | 'boolean';
    short?: string;
    multiple?: boolean;
    description: string;
  }[];
  positionals: { name: string; required: boolean; values?: string[] }[];
}

/** `command: 'help'`; `<cmd> --help` lists only that command. */
export interface HelpResult extends JsonEnvelope {
  globalOptions: CommandHelp['options'];
  commands: CommandHelp[];
}

export interface ExplainResult extends JsonEnvelope {
  entry?: CatalogEntry;
}

export interface DocsHit {
  path: string;
  title: string;
  score: number;
  excerpt: string;
}

export interface DocsResult extends JsonEnvelope {
  query: string;
  mode: 'code' | 'page' | 'search';
  entry?: CatalogEntry;
  page?: { path: string; title: string; markdown: string };
  hits?: DocsHit[];
  truncated?: { shown: number; total: number };
}

/** The envelope error of a VibeError: its message without the code prefix and fix lines. */
export function envelopeError(
  e: VibeError,
  missing?: MissingInput[],
): NonNullable<JsonEnvelope['error']> {
  const message = e.message.split('\n', 1)[0].replace(/^\[VIBE\d+\] /, '');
  return { code: e.code, message, docs: e.docs, fixes: [...e.fixes], missing };
}

/** The human text of a failed envelope, in the multi-line VibeError format plus `Next:` lines. */
export function errorText(r: JsonEnvelope): string {
  const { code, message, docs, fixes = [] } = r.error!;
  return [
    `[${code}] ${message}`,
    ...fixes.map((fix) => `  Fix: ${fix}`),
    `  Docs: ${docs}`,
    ...(r.next ?? []).map((next) => `  Next: ${next}`),
  ].join('\n');
}

/** 0 ok, 2 usage error (missing input, unknown command or option), 1 any other failure. */
export function exitCode(r: JsonEnvelope): 0 | 1 | 2 {
  if (r.ok) return 0;
  return r.error?.code === 'VIBE8003' || r.error?.code === 'VIBE8004' ? 2 : 1;
}
