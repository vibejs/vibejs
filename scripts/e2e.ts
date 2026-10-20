// Usage: node scripts/e2e.ts [--no-browser]
// Proves that what users install works: builds and packs the packages, follows the docs tutorial
// on a pnpm app scaffolded from the tarballs (with extra checks around its steps), installs an npm
// app, and renders examples/todo in Chromium, Firefox and WebKit. --no-browser skips the browser
// checks and examples/todo. Exit 0 when every step passed; otherwise prints the failed step and
// its output, exit 1.
import { ok, deepStrictEqual as same } from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { chromium, firefox, webkit, type Browser } from 'playwright';
import type { StepOutput } from '../docs/test/run-tutorial.ts';
import type { TutorialStep } from '../docs/scripts/tutorial.ts';
import {
  cleanup,
  env,
  installNpm,
  must,
  pack,
  run,
  scaffold,
  temp,
} from '../packages/create-vibejs/test/scaffold.ts';
import { parseMessages } from './errors.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AGENT = { VIBEJS_AGENT: '1' };
const WINDOWS = process.platform === 'win32';
const { values } = parseArgs({ options: { 'no-browser': { type: 'boolean', default: false } } });
const browsers = !values['no-browser'];

/** The longest plain part of each ui catalog message: ui messages are dev only (CONTRACTS C2). */
const MESSAGES = globSync('packages/ui/messages/*.md', { cwd: ROOT }).flatMap((file) =>
  parseMessages('ui', file, readFileSync(join(ROOT, file), 'utf8')).entries.map(({ message }) =>
    message.split(/\{\w+\}|["'`\\]/).reduce((a, b) => (b.length > a.length ? b : a)),
  ),
);

let current = '';
function step(name: string) {
  current = name;
  console.log(`e2e: ${name}`);
}

/** Polls `fn` until it returns a truthy value. */
async function until<T>(
  what: string,
  fn: () => T | Promise<T>,
  timeout = 30_000,
): Promise<NonNullable<T>> {
  for (const end = Date.now() + timeout; ; await sleep(100)) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
  }
}

/** The fields read from `--json` results, dev events and MCP frames. */
interface Line {
  ok?: boolean;
  event?: string;
  url?: string;
  pid?: number;
  reused?: boolean;
  id?: number;
  result?: { content: { text: string }[] };
  ops?: { op: string }[];
  steps?: { coverage: { filesBelow100: number } };
  api?: { path: string }[];
  build?: unknown[];
  runtime?: unknown[];
}

/** The JSON lines of an output: a `--json` result or dev events. */
const json = (output: string): Line[] =>
  output
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line));

/** Asserts a `check --json` result: ok, and every file fully covered. */
function clean(stdout: string) {
  const [result] = json(stdout);
  ok(result.ok && result.steps?.coverage.filesBelow100 === 0, `check: ${stdout}`);
}

/** Prints the size of each built UI file and fails on any dev-only catalog message in it. */
function audit(app: string, label: string) {
  const files = globSync('ui/dist/**/*.js', { cwd: app }).toSorted();
  ok(files.length, `${label}: no ui/dist/**/*.js`);
  for (const file of files) {
    const code = readFileSync(join(app, file));
    console.log(
      `  ${label} ${file}: ${code.length} B, ${gzipSync(code, { level: 9 }).length} B gzip`,
    );
    const leaked = MESSAGES.filter((text) => code.includes(text));
    ok(!leaked.length, `${label} ${file} contains catalog messages:\n${leaked.join('\n')}`);
  }
}

/** Replaces `from`, which must be there, with `to` in a file. */
function edit(file: string, from: string, to: string) {
  const source = readFileSync(file, 'utf8');
  ok(source.includes(from), `${file} has no ${from}`);
  writeFileSync(file, source.replace(from, to));
}

/** Calls one tool of the app's `.mcp.json` server over stdio; returns its JSON result. */
async function mcp(app: string, name: string): Promise<Line> {
  const { command, args } = JSON.parse(readFileSync(join(app, '.mcp.json'), 'utf8')).mcpServers
    .vibejs;
  const child = spawn(command, args, { cwd: app, env: { ...env, ...AGENT }, shell: WINDOWS });
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', (s: string) => (stdout += s));
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (s: string) => (stderr += s));
  /** Whether frame `id` arrived; throws when the server exited. */
  const answered = (id: number) => {
    if (child.exitCode !== null) throw new Error(`exit ${child.exitCode}\n${stdout}\n${stderr}`);
    return stdout.includes(`"id":${id}`);
  };
  const send = (message: object) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const clientInfo = { name: 'e2e', version: '1.0.0' };
  const exited = once(child, 'exit');
  try {
    send({
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo },
    });
    await until('the MCP server', () => answered(1), 60_000);
    send({ method: 'notifications/initialized' });
    send({ id: 2, method: 'tools/call', params: { name, arguments: {} } });
    await until(name, () => answered(2), 60_000);
  } finally {
    // Also on a timeout: a running server keeps e2e from exiting.
    child.stdin.end();
    child.kill();
    await exited;
  }
  const answer = json(stdout).find((line) => line.id === 2)!;
  return JSON.parse(answer.result!.content[0].text);
}

/** A JSON POST request. */
const post = (body: object): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** The text of every element that matches `selector`; none while the page (re)loads. */
const texts = (page: Awaited<ReturnType<Browser['newPage']>>, selector: string) =>
  page
    .locator(selector)
    .allTextContents()
    .catch((): string[] => []);

/** The dev loop of tutorial step 7, on the running `pnpm dev`. */
async function devLoop({ cwd: app, url, output }: StepOutput) {
  const events = () => json(output());
  const ready = events().find((e) => e.event === 'ready')!;
  const [second] = json(must(run('pnpm', ['dev', '--json'], app, AGENT)));
  same(
    { event: second.event, url: second.url, pid: second.pid, reused: second.reused },
    { event: 'ready', url: ready.url, pid: ready.pid, reused: true },
  );

  const routes = await mcp(app, 'get_routes');
  ok(
    routes.api?.some((route: { path: string }) => route.path === '/api/users'),
    `get_routes: ${JSON.stringify(routes)}`,
  );
  const errors = await mcp(app, 'get_errors');
  ok(
    errors.ok && errors.build?.length === 0 && errors.runtime?.length === 0,
    JSON.stringify(errors),
  );

  const users = new URL('api/users', url);
  const created = await fetch(users, post({ name: 'Ada' }));
  same(created.status, 200);
  if (browsers) {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const failures: string[] = [];
      page.on('pageerror', (e) => failures.push(e.message));
      await page.goto(new URL('users', url).href);
      await until('the users page', async () => (await texts(page, '.user-card'))[0] === '1. Ada');
      await page.evaluate(() => Object.assign(window, { marker: true }));
      // A template edit updates in place: no reload, and the loaded users are kept.
      edit(join(app, 'ui/src/components/UserCard.vibe'), '>{{ title }}<', '>User {{ title }}<');
      await until(
        'the edited card',
        async () => (await texts(page, '.user-card'))[0] === 'User 1. Ada',
      );
      ok(await page.evaluate(() => 'marker' in window), 'the page reloaded');
      same(failures, []);
    } finally {
      await browser.close();
    }
  }

  // A server edit restarts the backend, and the next request reaches the new code.
  const before = events().length;
  edit(
    join(app, 'server/src/users/users.service.ts'),
    'new Map<string, User>()',
    "new Map<string, User>([['1', { id: '1', name: 'Grace' }]])",
  );
  const restart = await until('the restart event', () =>
    events()
      .slice(before)
      .find((e) => e.event === 'restart'),
  );
  ok(restart.ok, JSON.stringify(restart));
  same(await (await fetch(users)).json(), [{ id: '1', name: 'Grace' }]);
}

/** The extra checks, by the tutorial command they follow; each must run at least once. */
const HOOKS = [
  'pnpm vibejs check',
  'pnpm vibejs g component UserCard',
  'pnpm vibejs build',
  'pnpm dev',
];
const ran = new Set<string>();

/** Extra checks around the tutorial's own steps. */
async function onStep(s: TutorialStep, out: StepOutput) {
  if (s.kind === 'write' || !HOOKS.includes(s.command)) return;
  const vibejs = (...args: string[]) => must(run('pnpm', ['vibejs', ...args], out.cwd, AGENT));
  if (s.command === 'pnpm vibejs check') {
    if (s.kind !== 'run' || s.exit !== 0) return;
    clean(out.output());
    vibejs('agents', 'sync', '--check');
  } else if (s.command === 'pnpm vibejs g component UserCard') {
    const [{ ops = [] }] = json(vibejs('g', 'resource', 'users'));
    same([...new Set(ops.map((o: { op: string }) => o.op))], ['skip']);
  } else if (s.command === 'pnpm vibejs build') {
    audit(out.cwd, 'tutorial');
  } else {
    await devLoop(out);
  }
  ran.add(s.command);
}

/** examples/todo: check, build, then add a todo in each browser on `vibejs dev`. */
async function todo() {
  const app = join(ROOT, 'examples/todo');
  const bin = join(app, 'node_modules/@vibejs-org/cli/dist/bin.js');
  const vibejs = (...args: string[]) => must(run(process.execPath, [bin, ...args], app));
  clean(vibejs('check', '--json'));
  vibejs('build', '--json');
  audit(app, 'examples/todo');

  const dev: ChildProcess = spawn(process.execPath, [bin, 'dev', '--json'], {
    cwd: app,
    env: { ...env, PORT: '0' },
  });
  let stdout = '';
  dev.stdout!.setEncoding('utf8').on('data', (s: string) => (stdout += s));
  let stderr = '';
  dev.stderr!.setEncoding('utf8').on('data', (s: string) => (stderr += s));
  const exited = once(dev, 'exit');
  try {
    const { url } = await until('todo dev ready', () => {
      if (dev.exitCode !== null) throw new Error(`exit ${dev.exitCode}\n${stdout}\n${stderr}`);
      return json(stdout).find((e) => e.event === 'ready');
    });
    for (const type of [chromium, firefox, webkit]) {
      step(`examples/todo in ${type.name()}`);
      // Rendered from the API: a todo created through it is listed.
      const title = `from the API in ${type.name()}`;
      const res = await fetch(new URL('api/todos', url), post({ title }));
      same(res.status, 200);
      const browser = await type.launch();
      try {
        const page = await browser.newPage();
        await page.goto(String(url));
        await until('the todo list', async () => (await texts(page, 'li')).includes(title));
        const added = `added in ${type.name()}`;
        await page.locator('input[placeholder]').fill(added);
        await page.locator('form button').click();
        await until('the added todo', async () => (await texts(page, 'li')).includes(added));
      } finally {
        await browser.close();
      }
    }
  } finally {
    dev.kill();
    await exited;
  }
}

try {
  step('build');
  must(run('pnpm', ['build'], ROOT));
  step('pack');
  const { tarballs } = pack();

  step('tutorial with pnpm');
  const md = readFileSync(join(ROOT, 'docs/guides/tutorial.md'), 'utf8');
  // Imported after the build: the docs helpers load @vibejs-org/errors from dist.
  const { runTutorial } = await import('../docs/test/run-tutorial.ts');
  await runTutorial(md, { dir: temp('vibejs-e2e-'), tarballs }, onStep);
  // A reworded tutorial command must fail here, not silently skip its extra check.
  const missed = HOOKS.filter((command) => !ran.has(command));
  ok(!missed.length, `no tutorial step for the extra checks of: ${missed.join(', ')}`);

  step('npm app');
  const app = join(temp('vibejs-e2e-npm-'), 'app');
  scaffold(app, 'npm');
  installNpm(app, tarballs);
  clean(must(run('npx', ['--no', 'vibejs', 'check', '--json'], app)));

  if (browsers) {
    step('examples/todo');
    await todo();
  }
  console.log('e2e: passed');
} catch (error) {
  console.error(`e2e: ${current} failed\n`, error);
  process.exitCode = 1;
} finally {
  cleanup();
}
