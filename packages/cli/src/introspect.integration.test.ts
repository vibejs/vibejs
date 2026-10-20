import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, it, vi } from 'vitest';
import type { DiResult } from './commands/di.ts';
import { loadAppModule, withServerRunner } from './dev/app-module.ts';
import type { RequestResult } from './commands/request.ts';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const TODO = fileURLToPath(new URL('../../../examples/todo', import.meta.url));
const ENV = { ...process.env, VIBEJS_AGENT: '1' };

let child: ChildProcess | undefined;
afterAll(() => {
  child?.kill('SIGKILL');
  rmSync(`${TODO}/.vibejs`, { recursive: true, force: true });
});

/** Runs the built bin in examples/todo; stdout must be one JSON document without colors. */
function vibejs(...args: string[]): { status: number | null; result: DiResult & RequestResult } {
  const { status, stdout } = spawnSync(process.execPath, [BIN, ...args], {
    cwd: TODO,
    encoding: 'utf8',
    env: ENV,
  });
  expect(stdout).not.toContain('\u001b[');
  expect(stdout.trimEnd()).not.toContain('\n');
  return { status, result: JSON.parse(stdout) };
}

// The todo server test pins inspect() to its committed snapshot; di must report the same modules.
it('di --json describes the todo modules', async () => {
  const { status, result } = vibejs('di', '--json');
  expect(status).toBe(0);
  expect(result.ok).toBe(true);
  const expected = await withServerRunner(TODO, async (runner) => {
    const { server, AppModule, appOptions } = await loadAppModule(runner, TODO);
    return server.inspect(AppModule, appOptions).modules;
  });
  expect(result.modules).toEqual(expected);
}, 30_000);

it('request runs in process without a dev server', () => {
  const { status, result } = vibejs('request', 'GET', '/api/todos');
  expect(status).toBe(0);
  expect(result).toMatchObject({
    ok: true,
    mode: 'in-process',
    response: { status: 200, body: [] },
  });
});

it('request shares state through the running dev server', async () => {
  child = spawn(process.execPath, [BIN, 'dev', '--port', '0'], { cwd: TODO, env: ENV });
  let stdout = '';
  child.stdout!.setEncoding('utf8').on('data', (s: string) => (stdout += s));
  await vi.waitFor(() => expect(stdout).toContain('"event":"ready"'), {
    timeout: 20_000,
    interval: 50,
  });

  const created = vibejs('request', 'POST', '/api/todos', '--data', '{"title":"Ship"}');
  expect(created.status).toBe(0);
  expect(created.result).toMatchObject({
    ok: true,
    mode: 'http',
    response: { status: 200, body: { title: 'Ship', done: false } },
  });
  const listed = vibejs('request', 'GET', '/api/todos');
  expect(listed.result).toMatchObject({ ok: true, mode: 'http', response: { status: 200 } });
  expect(listed.result.response!.body).toEqual([created.result.response!.body]);

  const missing = vibejs('request', 'PATCH', '/api/todos/none');
  expect(missing.status).toBe(0);
  expect(missing.result).toMatchObject({
    ok: true,
    response: { status: 404, body: { code: 'TODO_NOT_FOUND' } },
  });
  expect(missing.result.problem).toBeUndefined();
}, 60_000);
