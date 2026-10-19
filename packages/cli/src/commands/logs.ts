import type { CommandDef } from '../command.ts';
import { readLog, type LogEntry } from '../dev/log.ts';
import { vibeError } from '../errors.gen.ts';
import { envelopeError, type JsonEnvelope } from '../output.ts';
import { findRoot } from '../project.ts';
import { entryLine } from './errors.ts';

export interface LogsResult extends JsonEnvelope {
  entries: LogEntry[];
  truncated?: { shown: number; total: number };
}

const LEVELS: readonly string[] = ['debug', 'info', 'warn', 'error'];
const SOURCES: readonly string[] = ['vite', 'browser', 'server', 'vibejs'];
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };
/** The agent-mode cap (C9). */
const AGENT_MAX = 50;

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** The `--since` time in ms: an ISO date, or `<n>s|m|h` before now; `NaN` when invalid. */
function since(value: string): number {
  const ago = /^(\d+)([smh])$/.exec(value);
  if (ago) return Date.now() - Number(ago[1]) * UNIT_MS[ago[2]];
  return /^\d{4}-\d\d-\d\d/.test(value) ? Date.parse(value) : Number.NaN;
}

export const logs: CommandDef<LogsResult> = {
  name: 'logs',
  summary: 'Show the newest .vibejs/dev.log entries, filtered by level, source, text and time.',
  usage:
    'vibejs logs [--limit N] [--level error|warn|info|debug] [--source vite|browser|server|vibejs] [--grep TEXT] [--since ISO|<n>s|<n>m|<n>h]',
  examples: ['vibejs logs --level warn', 'vibejs logs --source server --since 5m'],
  options: {
    limit: { type: 'string', description: 'Show at most N entries (default 50).' },
    level: { type: 'string', description: 'The lowest level shown: error, warn, info or debug.' },
    source: { type: 'string', description: 'Only this source: vite, browser, server or vibejs.' },
    grep: { type: 'string', description: 'Only messages that contain TEXT, ignoring case.' },
    since: {
      type: 'string',
      description: 'Only entries since an ISO time or <n>s, <n>m, <n>h ago.',
    },
  },
  positionals: [],
  async run({ values }, ctx) {
    const base = { ok: true, command: 'logs', version: ctx.version };
    const limit = str(values.limit) ?? '50';
    const level = str(values.level) ?? 'debug';
    const source = str(values.source);
    const grep = str(values.grep);
    const from = str(values.since);
    const bad = [
      ['--limit', limit, /^[1-9]\d*$/.test(limit)],
      ['--level', level, LEVELS.includes(level)],
      ['--source', source, source === undefined || SOURCES.includes(source)],
      ['--since', from, from === undefined || !Number.isNaN(since(from))],
    ].find(([, , ok]) => !ok);
    if (bad) {
      const error = envelopeError(vibeError('VIBE8004', { name: `${bad[0]} ${bad[1]}` }));
      return { ...base, ok: false, next: ['vibejs logs --help'], error, entries: [] };
    }
    const root = findRoot(ctx.cwd);
    if (root === undefined) {
      const error = envelopeError(vibeError('VIBE8001', { cwd: ctx.cwd }));
      return { ...base, ok: false, error, entries: [] };
    }
    const after = from === undefined ? -Infinity : since(from);
    const needle = grep?.toLowerCase() ?? '';
    const all = readLog(root).filter(
      (e) =>
        LEVELS.indexOf(e.level) >= LEVELS.indexOf(level) &&
        (source === undefined || e.source === source) &&
        e.msg.toLowerCase().includes(needle) &&
        Date.parse(e.t) >= after,
    );
    const max = ctx.agent.active ? Math.min(Number(limit), AGENT_MAX) : Number(limit);
    const entries = all.slice(-max);
    return {
      ...base,
      entries,
      truncated: all.length > max ? { shown: max, total: all.length } : undefined,
    };
  },
  human: (r) => r.entries.map(entryLine).join('\n'),
};
