import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { VibeError } from '@vibejs-org/errors';
import { vibeError } from './errors.gen.ts';

interface Manifest {
  version: string;
  packageManager?: string;
  bin?: string | Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

/** `dir` and each of its ancestors, nearest first. */
function* upwards(dir: string): Generator<string> {
  for (let at = resolve(dir); ; at = dirname(at)) {
    yield at;
    if (dirname(at) === at) return;
  }
}

/** The nearest directory at or above `cwd` whose package.json depends on @vibejs-org/cli. */
export function findRoot(cwd: string): string | undefined {
  for (const dir of upwards(cwd)) {
    const pkg = readManifest(dir);
    if (pkg && '@vibejs-org/cli' in { ...pkg.dependencies, ...pkg.devDependencies }) return dir;
  }
  return undefined;
}

const LAYOUT = ['ui/index.html', 'server/src/app.module.ts', 'server/src/main.ts'];

/**
 * The real path of the full-stack project at or above `cwd`, or its VIBE8001 or VIBE8201 error.
 * The native real path expands Windows short names, so it matches the paths Vite reports.
 */
export function fullstackRoot(cwd: string, command: string): string | VibeError {
  const root = findRoot(cwd);
  if (root === undefined) return vibeError('VIBE8001', { cwd });
  const path = LAYOUT.find((file) => !existsSync(join(root, file)));
  return path === undefined ? realpathSync.native(root) : vibeError('VIBE8201', { path, command });
}

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

const LOCKFILES: [file: string, pm: PackageManager][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

/** From the `packageManager` field, then the lockfile; npm by default. */
export function packageManager(root: string): PackageManager {
  // `pnpm@12.14.0` names pnpm; LOCKFILES lists every manager.
  const name = readManifest(root)?.packageManager?.split('@', 1)[0];
  const found =
    LOCKFILES.find(([, pm]) => pm === name) ??
    LOCKFILES.find(([file]) => existsSync(join(root, file)));
  return found?.[1] ?? 'npm';
}

const ADD_DEV: Record<PackageManager, string> = {
  pnpm: 'pnpm add -D',
  npm: 'npm install -D',
  yarn: 'yarn add -D',
  bun: 'bun add -d',
};

export function installCommand(pm: PackageManager, pkgs: string[]): string {
  return [ADD_DEV[pm], ...pkgs].join(' ');
}

/**
 * The installed package `pkg` in the nearest `node_modules` at or above `root`, and the path of
 * its bin `bin` (`''` when it has none). Reads `node_modules/<pkg>/package.json` directly, so
 * the package's `exports` do not matter.
 */
export function resolveTool(
  root: string,
  pkg: string,
  bin: string,
): { bin: string; version: string } | undefined {
  for (const dir of upwards(root)) {
    const at = join(dir, 'node_modules', pkg);
    const manifest = readManifest(at);
    if (!manifest) continue;
    const file = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[bin];
    return { bin: file === undefined ? '' : join(at, file), version: manifest.version };
  }
  return undefined;
}
