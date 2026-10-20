// Follows docs/guides/tutorial.md from an empty directory on an app scaffolded from the packed
// packages. Two commands are rewritten: `pnpm create vibejs <name>` installs the tarballs, and
// `cd <name>` changes the directory of the next steps. Every other step runs as written.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  cleanup,
  env,
  INSTALL,
  installPnpm,
  pack,
  run,
  scaffold,
  temp,
  type Packs,
} from '../../packages/create-vibejs/test/scaffold.ts';
import { tutorialSteps, type TutorialStep } from './tutorial.ts';

const TUTORIAL = fileURLToPath(new URL('../guides/tutorial.md', import.meta.url));
const steps = tutorialSteps(readFileSync(TUTORIAL, 'utf8'));
// JSON results and dev events, as an agent sees them.
const AGENT = { VIBEJS_AGENT: '1' };

let tarballs: Packs['tarballs'];
let cwd: string;
/** The file of the last `write` step. */
let written = '';

beforeAll(() => {
  ({ tarballs } = pack());
  cwd = temp('vibejs-tutorial-');
}, INSTALL);
afterAll(cleanup, INSTALL);

/** A response's status and JSON body. */
const answer = async (res: Response) => [res.status, await res.json()];

/** Starts a long-running command, waits for its URL, calls the API, then stops it. */
async function serve(command: string) {
  const [cmd, ...args] = command.split(' ');
  // Its own process group, so stopping it also stops the server that pnpm started.
  const child = spawn(cmd, args, { cwd, env: { ...env, ...AGENT, PORT: '0' }, detached: true });
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', (s: string) => (stdout += s));
  child.stderr.resume();
  const exited = new Promise((resolve) => child.on('exit', resolve));
  try {
    const url = await new Promise<string>((resolve, reject) => {
      void exited.then((code) =>
        reject(new Error(`${command} exited: ${String(code)}\n${stdout}`)),
      );
      child.stdout.on('data', () => {
        const found = /"url":"(http:\/\/[^"]+)"/.exec(stdout)?.[1];
        if (found) resolve(found.replace('[::]', '127.0.0.1'));
      });
    });
    return {
      // `pnpm dev` reports ready as an agent sees it.
      ready: command !== 'pnpm dev' || stdout.includes('{"event":"ready"'),
      health: await answer(await fetch(new URL('api/health', url))),
      users: await answer(await fetch(new URL('api/users', url))),
    };
  } finally {
    process.kill(-child.pid!, 'SIGTERM');
    await exited;
  }
}

/** Runs a command; with exit code 1, also whether a TS2322 points into the file written last. */
function runStep(command: string) {
  const [, name] = /^pnpm create vibejs (\S+)$/.exec(command) ?? [];
  const [, dir] = /^cd (\S+)$/.exec(command) ?? [];
  if (name) {
    scaffold(join(cwd, name), 'pnpm');
    installPnpm(join(cwd, name), tarballs);
    return { status: 0, typeError: false };
  }
  if (dir) {
    cwd = join(cwd, dir);
    return { status: 0, typeError: false };
  }
  const [cmd, ...args] = command.split(' ');
  const r = run(cmd, args, cwd, AGENT);
  if (r.status !== 0 && r.status !== 1) throw new Error(`${command}: ${r.stdout}\n${r.stderr}`);
  const { diagnostics = [] }: { diagnostics?: { code: string; loc: string }[] } = JSON.parse(
    r.stdout,
  );
  const at = new RegExp(`^${written}:\\d+:\\d+$`);
  const typeError = diagnostics.some((d) => d.code === 'TS2322' && at.test(d.loc));
  return { status: r.status, typeError };
}

async function perform(step: TutorialStep) {
  if (step.kind === 'run') return runStep(step.command);
  if (step.kind === 'serve') return serve(step.command);
  written = step.file;
  mkdirSync(dirname(join(cwd, step.file)), { recursive: true });
  writeFileSync(join(cwd, step.file), step.code);
  return readFileSync(join(cwd, step.file), 'utf8');
}

const expected = (step: TutorialStep) =>
  step.kind === 'run'
    ? { status: step.exit, typeError: step.exit === 1 }
    : step.kind === 'serve'
      ? { ready: true, health: [200, { status: 'ok' }], users: [200, []] }
      : step.code;

it.for(steps)('step at line $mdLine: $kind', { timeout: INSTALL }, async (step) => {
  expect(await perform(step)).toEqual(expected(step));
});
