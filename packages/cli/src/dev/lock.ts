import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

/** A claim (only a pid) or a full lock. */
function read(root: string): DevLock | Pick<DevLock, 'pid'> | undefined {
  try {
    return JSON.parse(readFileSync(join(root, LOCK), 'utf8'));
  } catch {
    return undefined;
  }
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The pid exists and the server at `url` answers the health check with that pid within 500 ms. */
async function alive({ pid, url }: DevLock): Promise<boolean> {
  if (!running(pid)) return false;
  try {
    const res = await fetch(new URL('/__vibejs/health', url), {
      signal: AbortSignal.timeout(500),
    });
    const health: Partial<DevHealth> = Object(await res.json());
    return health.name === 'vibejs-dev' && health.pid === pid;
  } catch {
    return false;
  }
}

/**
 * The lock of a running dev server. A claim of a live process that is still starting is kept;
 * any other stale or unreadable lock is deleted.
 */
export async function readLiveLock(root: string): Promise<DevLock | undefined> {
  const lock = read(root);
  if (lock && !('url' in lock)) {
    if (running(lock.pid)) return undefined;
  } else if (lock && (await alive(lock))) return lock;
  rmSync(join(root, LOCK), { force: true });
  return undefined;
}

/**
 * Creates the lock with only `pid` unless one exists, atomically (a hard link fails on an
 * existing file), so that only one dev server starts. `writeLock` completes it once listening.
 */
export function claimLock(root: string, pid: number): boolean {
  const tmp = join(root, `${LOCK}.${pid}.claim`);
  mkdirSync(join(root, '.vibejs'), { recursive: true });
  try {
    writeFileSync(tmp, `${JSON.stringify({ pid })}\n`);
    linkSync(tmp, join(root, LOCK));
    return true;
  } catch (error) {
    if (existsSync(join(root, LOCK))) return false;
    throw error;
  } finally {
    rmSync(tmp, { force: true });
  }
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
