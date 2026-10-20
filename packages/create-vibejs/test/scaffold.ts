// Packs every package and scaffolds apps from the tarballs with the real bin, as a user would
// after a release: the integration tests of create-vibejs and the docs tutorial share these.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES = fileURLToPath(new URL('../..', import.meta.url));
const BIN = fileURLToPath(new URL('../bin.js', import.meta.url));
const SCOPED = ['cli', 'compiler', 'contract', 'errors', 'language-tools', 'server', 'ui'];

/** The timeout of a step that installs or packs. */
export const INSTALL = 10 * 60_000;

/** The children must not see the Vitest worker or the package manager that runs the test. */
export const env: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^(VITEST|npm_|pnpm_)/i.test(k)),
);

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function run(
  cmd: string,
  args: string[],
  cwd: string,
  extra: Record<string, string> = {},
): RunResult {
  const r = spawnSync(cmd, args, {
    cwd,
    env: { ...env, ...extra },
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Throws with the output when the command failed. */
export function must(r: RunResult): string {
  if (r.status !== 0) throw new Error(`exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

const dirs: string[] = [];
/** A new temp directory, removed by `cleanup()`. */
export function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
export function cleanup(): void {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export interface Packs {
  /** The tarball of each scoped package, by full name. */
  tarballs: Record<string, string>;
  /** The `pnpm pack --json` result of create-vibejs. */
  created: { files: { path: string }[]; filename: string };
}

/** Packs the built packages into a temp directory. */
export function pack(): Packs {
  const dir = temp('vibejs-packs-');
  const tarballs: Record<string, string> = {};
  let created: Packs['created'] | undefined;
  for (const name of [...SCOPED, 'create-vibejs']) {
    const packed = JSON.parse(
      must(run('pnpm', ['pack', '--json', '--pack-destination', dir], join(PACKAGES, name))),
    );
    if (name === 'create-vibejs') created = packed;
    else tarballs[packed.name] = packed.filename;
  }
  return { tarballs, created: created! };
}

/** Runs the built bin in agent mode without installing; returns its JSON result. */
export function scaffold(app: string, pm: 'pnpm' | 'npm'): unknown {
  const r = run(process.execPath, [BIN, app, '--pm', pm, '--no-install'], tmpdir(), {
    VIBEJS_AGENT: '1',
  });
  return JSON.parse(must(r));
}

/** Points the `@vibejs-org/*` packages of a pnpm app at the tarballs and installs it. */
export function installPnpm(app: string, tarballs: Packs['tarballs']): void {
  const overrides = Object.entries(tarballs).map(([name, file]) => `  '${name}': file:${file}`);
  appendFileSync(join(app, 'pnpm-workspace.yaml'), `overrides:\n${overrides.join('\n')}\n`);
  must(run('pnpm', ['install'], app));
}
