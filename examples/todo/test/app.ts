import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect } from 'vitest';

/** The app's own directory. */
export const APP = fileURLToPath(new URL('..', import.meta.url));
const BIN = join(APP, 'node_modules/@usevibejs/cli/dist/bin.js');
const SKIP = new Set(['node_modules', '.tsbuild', '.vibejs', 'dist', 'coverage']);

// The children must not see the Vitest worker that runs the test, nor its NODE_ENV=test.
export const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^(VITEST|NODE_ENV$|npm_|pnpm_)/i.test(k)),
);

/**
 * A copy of the app in a new temp directory, removed after the test file. Its `node_modules`
 * links each package of the app's, so the copy resolves them as the app does while Vite's caches
 * and watcher stay inside the copy.
 */
export function copyApp(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'vibejs-todo-')));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  cpSync(APP, root, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
  mkdirSync(join(root, 'node_modules'));
  for (const name of readdirSync(join(APP, 'node_modules'))) {
    if (name.startsWith('.')) continue;
    symlinkSync(join(APP, 'node_modules', name), join(root, 'node_modules', name), 'junction');
  }
  return root;
}

/** Runs the built `vibejs` in `root`. */
export function vibejs(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd: root, env, encoding: 'utf8' });
}

/** The command to start the built `vibejs` with `args`. */
export const vibejsArgs = (...args: string[]): string[] => [BIN, ...args];

/** Replaces `from`, which must be there, with `to` in a file of `root`. */
export function edit(root: string, file: string, from: string, to: string): void {
  const path = join(root, file);
  const source = readFileSync(path, 'utf8');
  expect(source).toContain(from);
  writeFileSync(path, source.replace(from, to));
}

/** The 1-based `line:column` of `needle` in `source`. */
export function lineColumn(source: string, needle: string): string {
  const index = source.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  const lines = source.slice(0, index).split('\n');
  return `${lines.length}:${lines.at(-1)!.length + 1}`;
}
