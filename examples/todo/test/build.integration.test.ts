import { spawn } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, expect, it } from 'vitest';
import { copyApp, env, vibejs } from './app.ts';

const root = copyApp();

it('builds the UI and a server that answers under plain node', async () => {
  const build = vibejs(root, 'build', '--json');
  expect(JSON.parse(build.stdout)).toMatchObject({
    ok: true,
    ui: { outDir: 'ui/dist' },
    server: { entry: 'server/dist/main.js' },
  });
  expect(build.status).toBe(0);
  expect(existsSync(join(root, 'ui/dist/index.html'))).toBe(true);

  // Reported, not gated (CONTRACTS C10); the gates are set at CP2.
  const assets = globSync('ui/dist/assets/*.js', { cwd: root }).toSorted();
  expect(assets.length).toBeGreaterThan(0);
  for (const file of assets) {
    const code = readFileSync(join(root, file));
    process.stdout.write(
      `examples/todo ${file}: ${code.length} B, ${gzipSync(code, { level: 9 }).length} B gzip\n`,
    );
  }

  // PORT=0 listens on a free port, which the server logs.
  const server = spawn(process.execPath, ['server/dist/main.js'], {
    cwd: root,
    env: { ...env, PORT: '0' },
  });
  afterAll(() => void server.kill());
  const port = await new Promise<string>((resolve, reject) => {
    server.on('exit', (code) => reject(new Error(`the server exited with ${code}`)));
    server.stdout.on('data', (chunk: Buffer) => {
      const found = /"url":"http:\/\/[^"]*:(\d+)\//.exec(String(chunk))?.[1];
      if (found) resolve(found);
    });
  });
  const api = `http://localhost:${port}/api`;
  expect((await fetch(`${api}/health`)).status).toBe(200);
  // The todo-flags module is part of the built server.
  expect(await (await fetch(`${api}/flags`)).json()).toEqual({ removeDone: true });
}, 120_000);
