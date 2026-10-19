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

export interface CheckDiagnostic {
  source: 'tsc' | 'oxlint' | 'oxfmt' | 'vitest' | 'coverage' | 'vibejs';
  code: string;
  severity: 'error' | 'warning' | 'info';
  file: string;
  /** `file:line:col`, 1-based; the bare file when the position is unknown, `''` for no file. */
  loc: string;
  /** 0-based. */
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  message: string;
  docs?: string;
  fixes?: string[];
}

export interface Step {
  status: 'passed' | 'failed' | 'skipped';
  errors: number;
  warnings: number;
  ms: number;
}

export interface CheckResult extends JsonEnvelope {
  durationMs: number;
  steps: {
    types: Step;
    lint: Step;
    format: Step;
    tests: Step & { passed: number; failed: number; skipped: number };
    coverage: Step & {
      lines: number;
      branches: number;
      functions: number;
      statements: number;
      filesBelow100: number;
    };
  };
  diagnostics: CheckDiagnostic[];
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

/** Usage, project and tool errors: nothing could be checked. */
const USAGE: readonly string[] = [
  'VIBE8001',
  'VIBE8003',
  'VIBE8004',
  'VIBE8005',
  'VIBE8201',
  'VIBE8204',
  'VIBE8301',
];

/** 0 ok, 2 usage, project or tool error, 1 any other failure. */
export function exitCode(r: JsonEnvelope): 0 | 1 | 2 {
  if (r.ok) return 0;
  return r.error && USAGE.includes(r.error.code) ? 2 : 1;
}
