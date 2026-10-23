import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { ErrorCode } from '@usevibejs/errors';

// C9 shape. Key order is part of the contract: producers build entries in this order.
export interface LogEntry {
  t: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  source: 'vite' | 'browser' | 'server' | 'vibejs';
  msg: string;
  code?: ErrorCode;
  /** Root-relative, with `/` separators. */
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
  /** A file whose earlier coded entries no longer apply. */
  resolved?: string;
}

export interface DevLog {
  write(e: Omit<LogEntry, 't'>): void;
  /** Files with a coded entry and no later `resolved` entry, in this session. */
  readonly failed: ReadonlySet<string>;
  /** Later writes are dropped. */
  close(): void;
}

export const LOG_FILE = '.vibejs/dev.log';

/**
 * Starts an empty `.vibejs/dev.log` and appends one JSON line per entry with sync writes, so the
 * log survives a crash. Past `maxBytes` (default 10 MiB) the file moves to `dev.log.1`.
 */
export function createDevLog(
  root: string,
  {
    maxBytes = 10 * 1024 * 1024,
    onEntry,
  }: { maxBytes?: number; onEntry?: (e: LogEntry) => void } = {},
): DevLog {
  const file = join(root, LOG_FILE);
  mkdirSync(join(root, '.vibejs'), { recursive: true });
  writeFileSync(file, '');
  rmSync(`${file}.1`, { force: true });
  let size = 0;
  let closed = false;
  const failed = new Set<string>();
  return {
    failed,
    write(e) {
      if (closed) return;
      const entry: LogEntry = { t: new Date().toISOString(), ...e };
      const line = `${JSON.stringify(entry)}\n`;
      appendFileSync(file, line);
      size += Buffer.byteLength(line);
      if (size > maxBytes) {
        renameSync(file, `${file}.1`);
        size = 0;
      }
      if (e.code && e.file) failed.add(e.file);
      if (e.resolved) failed.delete(e.resolved);
      onEntry?.(entry);
    },
    close() {
      closed = true;
    },
  };
}

/** The entries of `dev.log.1`, then `dev.log`; unparsable lines are skipped, missing files are empty. */
export function readLog(root: string): LogEntry[] {
  return [`${LOG_FILE}.1`, LOG_FILE].flatMap((name) => {
    let text: string;
    try {
      text = readFileSync(join(root, name), 'utf8');
    } catch {
      return [];
    }
    return text.split('\n').flatMap((line): LogEntry[] => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  });
}

/** Coded entries with a `file` that no later entry marks as `resolved`, oldest first. */
export function unresolved(entries: readonly LogEntry[]): LogEntry[] {
  const resolved = new Set<string>();
  const out: LogEntry[] = [];
  for (const e of entries.toReversed()) {
    if (e.resolved) resolved.add(e.resolved);
    if (e.code && e.file && !resolved.has(e.file)) out.push(e);
  }
  return out.toReversed();
}
