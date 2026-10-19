import type { CommandDef } from '../command.ts';
import { readLog, unresolved, type LogEntry } from '../dev/log.ts';
import { vibeError } from '../errors.gen.ts';
import { envelopeError, type JsonEnvelope } from '../output.ts';
import { findRoot } from '../project.ts';

export interface ErrorsResult extends JsonEnvelope {
  build: LogEntry[];
  runtime: LogEntry[];
  truncated?: { shown: number; total: number };
}

const COUNT = /^[1-9]\d*$/;

/** One line per entry: `t  file:line:col  CODE  msg`, with the source in place of a missing file. */
export const entryLine = (e: LogEntry): string => {
  const at = e.file
    ? [e.file, e.line, e.column].filter((p) => p !== undefined).join(':')
    : e.source;
  return [e.t, at, e.code, e.msg.split('\n', 1)[0]].filter(Boolean).join('  ');
};

export const errors: CommandDef<ErrorsResult> = {
  name: 'errors',
  summary: 'List the unresolved build errors and the latest runtime errors from .vibejs/dev.log.',
  usage: 'vibejs errors [--limit N]',
  examples: ['vibejs errors', 'vibejs errors --limit 5'],
  options: {
    limit: { type: 'string', description: 'Show at most N runtime errors (default 20).' },
  },
  positionals: [],
  async run({ values }, ctx) {
    const base = { ok: true, command: 'errors', version: ctx.version };
    const empty = { build: [], runtime: [] };
    const limit = typeof values.limit === 'string' ? values.limit : '20';
    if (!COUNT.test(limit)) {
      const error = envelopeError(vibeError('VIBE8004', { name: `--limit ${limit}` }));
      return { ...base, ok: false, next: ['vibejs errors --help'], error, ...empty };
    }
    const root = findRoot(ctx.cwd);
    if (root === undefined) {
      const error = envelopeError(vibeError('VIBE8001', { cwd: ctx.cwd }));
      return { ...base, ok: false, error, ...empty };
    }
    const entries = readLog(root);
    if (entries.length === 0) return { ...base, next: ['vibejs dev'], ...empty };
    const build = unresolved(entries);
    const all = entries.filter(
      (e) =>
        e.level === 'error' &&
        (e.source === 'browser' || e.source === 'server') &&
        !(e.code && e.file),
    );
    const runtime = all.slice(-Number(limit));
    const coded = [...build, ...runtime].find((e) => e.code);
    return {
      ...base,
      next: coded && [`vibejs explain ${coded.code}`],
      build,
      runtime,
      truncated:
        all.length > runtime.length ? { shown: runtime.length, total: all.length } : undefined,
    };
  },
  human(r) {
    const lines = [
      `Build errors: ${r.build.length}`,
      ...r.build.map(entryLine),
      `Runtime errors: ${r.runtime.length}`,
      ...r.runtime.map(entryLine),
    ];
    return lines.join('\n');
  },
};
