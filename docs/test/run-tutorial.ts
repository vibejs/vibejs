// Follows docs/guides/tutorial.md from an empty directory on an app scaffolded from the packed
// packages. Two commands are rewritten: `pnpm create vibejs <name>` installs the tarballs, and
// `cd <name>` changes the directory of the next steps. Every other step runs as written. The
// tutorial integration test and scripts/e2e.ts share it.
import { deepStrictEqual } from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  env,
  installPnpm,
  run as exec,
  scaffold,
  type Packs,
} from '../../packages/create-vibejs/test/scaffold.ts';
import { fences } from '../scripts/docs.ts';
import { tutorialSteps, type TutorialStep } from '../scripts/tutorial.ts';

export interface TutorialRun {
  /** The empty directory the reader starts in. */
  dir: string;
  tarballs: Packs['tarballs'];
}

/** What a step left behind: the app directory, its output and, while serving, the server's URL. */
export interface StepOutput {
  cwd: string;
  output: () => string;
  url?: string;
}

/** Called after each passed step; for `pnpm dev` and `pnpm start`, while the server still runs. */
export type OnStep = (step: TutorialStep, out: StepOutput) => void | Promise<void>;

// JSON results and dev events, as an agent sees them.
const AGENT = { VIBEJS_AGENT: '1' };
const WINDOWS = process.platform === 'win32';

/** A response's status and JSON body. */
const answer = async (res: Response) => [res.status, await res.json()];

/** Stops a process and the processes it started; a group that already ended is fine. */
function stop(child: ChildProcess) {
  if (WINDOWS) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else
    try {
      process.kill(-child.pid!, 'SIGTERM');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
    }
}

/** Runs one tutorial step at a time, in order; a failed step throws naming its tutorial.md line. */
export function tutorialRunner(
  md: string,
  { dir, tarballs }: TutorialRun,
  onStep?: OnStep,
): (step: TutorialStep) => Promise<void> {
  let cwd = dir;
  const lines = md.split('\n');

  /** The lines of the ```txt fence that follows the 1-based line `mdLine`: the output the page shows. */
  function shownOutput(mdLine: number): string[] {
    const next = fences(lines).find((fence) => fence.open >= mdLine);
    if (next?.info !== 'txt') throw new Error(`no txt output after the step`);
    return lines.slice(next.open + 1, next.close);
  }

  /** Runs a command: its exit code and its errors as `vibejs check` prints them (first lines). */
  function runStep(command: string) {
    const [, name] = /^pnpm create vibejs (\S+)$/.exec(command) ?? [];
    const [, app] = /^cd (\S+)$/.exec(command) ?? [];
    if (name) {
      scaffold(join(cwd, name), 'pnpm');
      installPnpm(join(cwd, name), tarballs);
      return { status: 0, errors: [], stdout: '' };
    }
    if (app) {
      cwd = join(cwd, app);
      return { status: 0, errors: [], stdout: '' };
    }
    const [cmd, ...args] = command.split(' ');
    const r = exec(cmd, args, cwd, AGENT);
    if (r.status !== 0 && r.status !== 1)
      throw new Error(`exit ${r.status}\n${r.stdout}\n${r.stderr}`);
    const {
      diagnostics = [],
    }: { diagnostics?: Record<'code' | 'loc' | 'message' | 'severity', string>[] } = JSON.parse(
      r.stdout,
    );
    const errors = diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => `${d.loc}  error  ${d.code}  ${d.message.split('\n')[0]}`);
    return { status: r.status, errors, stdout: r.stdout };
  }

  /** Starts a long-running command, waits for its URL, calls the API, then stops it. */
  async function serve(step: TutorialStep & { kind: 'serve' }) {
    const [cmd, ...args] = step.command.split(' ');
    // Its own process group, so stopping it also stops the server that pnpm started.
    const child = spawn(cmd, args, {
      cwd,
      env: { ...env, ...AGENT, PORT: '0' },
      detached: !WINDOWS,
      shell: WINDOWS,
    });
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', (s: string) => (stdout += s));
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (s: string) => (stderr += s));
    const exited = new Promise((resolve) => child.on('exit', resolve));
    try {
      const url = await new Promise<string>((resolve, reject) => {
        void exited.then((code) =>
          reject(new Error(`exited: ${String(code)}\n${stdout}\n${stderr}`)),
        );
        child.stdout.on('data', () => {
          const found = /"url":"(http:\/\/[^"]+)"/.exec(stdout)?.[1];
          if (found) resolve(found.replace('[::]', '127.0.0.1'));
        });
      });
      deepStrictEqual(
        {
          // `pnpm dev` reports ready as an agent sees it.
          ready: step.command !== 'pnpm dev' || stdout.includes('{"event":"ready"'),
          health: await answer(await fetch(new URL('api/health', url))),
          users: await answer(await fetch(new URL('api/users', url))),
        },
        { ready: true, health: [200, { status: 'ok' }], users: [200, []] },
      );
      await onStep?.(step, { cwd, url, output: () => stdout });
    } finally {
      stop(child);
      await exited;
    }
  }

  async function perform(step: TutorialStep) {
    if (step.kind === 'serve') return serve(step);
    if (step.kind === 'run') {
      const { stdout, ...result } = runStep(step.command);
      deepStrictEqual(result, {
        status: step.exit,
        errors: step.exit === 1 ? shownOutput(step.mdLine) : [],
      });
      return onStep?.(step, { cwd, output: () => stdout });
    }
    const file = join(cwd, step.file);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, step.code);
    const code = readFileSync(file, 'utf8');
    deepStrictEqual(code, step.code);
    return onStep?.(step, { cwd, output: () => code });
  }

  return async (step) => {
    try {
      await perform(step);
    } catch (error) {
      const what = step.kind === 'write' ? `[${step.file}]` : step.command;
      throw new Error(`tutorial.md:${step.mdLine}: ${what}: ${String(error)}`, { cause: error });
    }
  };
}

/** Runs every step of the tutorial `md` in order. */
export async function runTutorial(md: string, run: TutorialRun, onStep?: OnStep): Promise<void> {
  const perform = tutorialRunner(md, run, onStep);
  for (const step of tutorialSteps(md)) await perform(step);
}
