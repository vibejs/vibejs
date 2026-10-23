import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The pinned TypeScript 7.1 (catalog:ts-next) `tsc`. */
export const TSC: string = fileURLToPath(
  new URL('../node_modules/typescript/bin/tsc', import.meta.url),
);
const FIXTURES = fileURLToPath(new URL('fixtures/typecheck', import.meta.url));
const PACKAGES = fileURLToPath(new URL('../..', import.meta.url));

/** The environment of a child process: it must not see the Vitest worker that spawns it. */
export const childEnv: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')),
);

/** Copies test/fixtures/typecheck to a temp dir with @usevibejs/{language-tools,ui} linked (junction on Windows). */
export function copyCorpus(): { root: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'vibejs-typecheck-'));
  cpSync(FIXTURES, root, { recursive: true });
  mkdirSync(join(root, 'node_modules/@usevibejs'), { recursive: true });
  for (const name of ['language-tools', 'ui']) {
    symlinkSync(join(PACKAGES, name), join(root, 'node_modules/@usevibejs', name), 'junction');
  }
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
