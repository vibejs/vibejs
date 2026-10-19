import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// C9 shape, in key order.
export interface DevLock {
  pid: number;
  url: string;
  port: number;
  apiPrefix?: string;
  logFile: '.vibejs/dev.log';
  startedAt: string;
  version: string;
}

/** What `GET /__vibejs/health` answers. */
export interface DevHealth {
  name: 'vibejs-dev';
  pid: number;
}

const LOCK = '.vibejs/dev.lock';

function read(root: string): DevLock | undefined {
  try {
    return JSON.parse(readFileSync(join(root, LOCK), 'utf8'));
  } catch {
    return undefined;
  }
}

/** The pid exists and the server at `url` answers the health check with that pid within 500 ms. */
async function alive({ pid, url }: DevLock): Promise<boolean> {
  try {
    process.kill(pid, 0);
    const res = await fetch(new URL('/__vibejs/health', url), {
      signal: AbortSignal.timeout(500),
    });
    const health: Partial<DevHealth> = Object(await res.json());
    return health.name === 'vibejs-dev' && health.pid === pid;
  } catch {
    return false;
  }
}

/** The lock of a running dev server; a stale or unreadable lock is deleted. */
export async function readLiveLock(root: string): Promise<DevLock | undefined> {
  const lock = read(root);
  if (lock && (await alive(lock))) return lock;
  rmSync(join(root, LOCK), { force: true });
  return undefined;
}

/** Writes a temporary file and renames it, so readers never see a partial lock. */
export function writeLock(root: string, lock: DevLock): void {
  const tmp = join(root, `${LOCK}.${lock.pid}.tmp`);
  mkdirSync(join(root, '.vibejs'), { recursive: true });
  writeFileSync(tmp, `${JSON.stringify(lock, null, 2)}\n`);
  renameSync(tmp, join(root, LOCK));
}

/** Deletes the lock only while it still belongs to `pid`. */
export function removeLock(root: string, pid: number): void {
  if (read(root)?.pid === pid) rmSync(join(root, LOCK));
}
