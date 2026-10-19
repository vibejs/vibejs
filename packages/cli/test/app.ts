import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import type { Ctx } from '../src/ctx.ts';

const MODULES = fileURLToPath(new URL('../node_modules/', import.meta.url));

/**
 * A copy of `fixtures/app` in a new temp directory, with links to the packages it imports. The
 * links sit in a real `node_modules`, so Vite's caches stay inside the copy.
 */
export function copyApp(
  links: string[] = ['vite', '@vibejs-org/server', '@vibejs-org/contract'],
): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'vibejs-app-')));
  cpSync(new URL('fixtures/app', import.meta.url), root, { recursive: true });
  for (const pkg of links) {
    const link = join(root, 'node_modules', pkg);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(realpathSync(join(MODULES, pkg)), link, 'junction');
  }
  return root;
}

/** The TCP port a listening server is bound to. */
export function portOf(server: { address(): AddressInfo | string | null }): number {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('not listening on TCP');
  return address.port;
}

/** Replaces `from` with `to` in a file of the copy. */
export function edit(root: string, file: string, from: string, to: string): void {
  const path = join(root, file);
  writeFileSync(path, readFileSync(path, 'utf8').replace(from, to));
}

export interface TestCtx {
  ctx: Ctx;
  out: string[];
  err: string[];
  /** Resolves `untilSignal` with `SIGINT`. */
  stop(): void;
}

/** A context for `cwd` that records stdout and stderr. */
export function testCtx(cwd: string, agent = true): TestCtx {
  let stop!: (signal: string) => void;
  const signal = new Promise<string>((resolve) => (stop = resolve));
  const out: string[] = [];
  const err: string[] = [];
  const ctx: Ctx = {
    version: '1.2.3',
    agent: { active: agent },
    docsDir: '',
    cwd,
    now: () => performance.now(),
    exec: vi.fn<Ctx['exec']>(),
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    untilSignal: () => signal,
  };
  return { ctx, out, err, stop: () => stop('SIGINT') };
}
