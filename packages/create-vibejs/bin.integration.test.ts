// Scaffolds with the real bin from packed tarballs of every package, installs with pnpm and npm,
// then runs the app's own vibejs check, agents sync --check, the generators and build, and serves
// the build.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { globSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import manifest from './package.json' with { type: 'json' };
import {
  cleanup,
  env,
  INSTALL,
  installPnpm,
  must,
  pack,
  run,
  scaffold as create,
  temp,
  type Packs,
} from './test/scaffold.ts';

const vibejs = (app: string, ...args: string[]) =>
  run(process.execPath, [join(app, 'node_modules/@vibejs-org/cli/dist/bin.js'), ...args], app);

afterAll(cleanup, INSTALL);

let tarballs: Packs['tarballs'];
let created: Packs['created'];

beforeAll(() => {
  ({ tarballs, created } = pack());
}, INSTALL);

/** A new app from the built bin, not installed. */
function scaffold(pm: 'pnpm' | 'npm'): string {
  const app = join(temp(`vibejs-${pm}-`), 'app');
  expect(create(app, pm)).toMatchObject({ ok: true, pm, installed: false });
  return app;
}

it('publishes only the bin, its manifest, docs, the template and the agent files, under 1 MB', () => {
  expect(manifest).not.toHaveProperty('dependencies');
  expect(manifest).not.toHaveProperty('peerDependencies');
  const allowed = /^(?:bin\.js|package\.json|LICENSE|README\.md|templates\/.+|agents\/.+)$/;
  expect(created.files.map((f) => f.path).filter((path) => !allowed.test(path))).toEqual([]);
  expect(created.files.map((f) => f.path)).toEqual(
    expect.arrayContaining([
      'bin.js',
      'agents/AGENTS.md',
      'agents/.mcp.json',
      ...['.agents', '.claude'].flatMap((dir) =>
        ['vibejs-add-resource', 'vibejs-cover-100', 'vibejs-dev-loop'].map(
          (name) => `agents/${dir}/skills/${name}/SKILL.md`,
        ),
      ),
      'templates/fullstack/_gitignore',
    ]),
  );
  expect(statSync(created.filename).size).toBeLessThan(1024 * 1024);
});

describe('pnpm', () => {
  let app: string;
  beforeAll(() => {
    app = scaffold('pnpm');
    installPnpm(app, tarballs);
  }, INSTALL);

  it(
    'passes check with full coverage and keeps the agent files current',
    () => {
      const check = vibejs(app, 'check', '--json');
      expect(JSON.parse(check.stdout)).toMatchObject({ ok: true, diagnostics: [] });
      expect(check.status).toBe(0);
      expect(vibejs(app, 'agents', 'sync', '--check', '--json').status).toBe(0);
      expect(readFileSync(join(app, 'AGENTS.md'), 'utf8')).toContain(
        '`pnpm exec vibejs check --json`',
      );
    },
    INSTALL,
  );

  it(
    'starts the .mcp.json server over stdio with the eight tools',
    async () => {
      const { command, args } = JSON.parse(readFileSync(join(app, '.mcp.json'), 'utf8')).mcpServers
        .vibejs;
      expect({ command, args }).toEqual({ command: 'pnpm', args: ['exec', 'vibejs', 'mcp'] });
      const child = spawn(command, args, {
        cwd: app,
        env: { ...env, VIBEJS_AGENT: '1' },
        shell: process.platform === 'win32',
      });
      let stdout = '';
      child.stdout.setEncoding('utf8').on('data', (s: string) => (stdout += s));
      const send = (message: object) =>
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
      const answered = async (id: number) =>
        await expect.poll(() => stdout.includes(`"id":${id}`), { timeout: 60_000 }).toBe(true);
      const clientInfo = { name: 'test', version: '1.0.0' };
      send({
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo },
      });
      await answered(1);
      send({ method: 'notifications/initialized' });
      send({ id: 2, method: 'tools/list' });
      await answered(2);
      child.stdin.end();
      await once(child, 'exit');
      const lines = stdout
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(lines[0]).toMatchObject({ id: 1, result: { serverInfo: { name: 'vibejs' } } });
      expect(lines[1].result.tools.map((t: { name: string }) => t.name)).toEqual([
        'get_errors',
        'get_logs',
        'get_routes',
        'get_di_graph',
        'get_component_tree',
        'check',
        'request',
        'explain',
      ]);
    },
    INSTALL,
  );

  it(
    'generates a resource, a page and a component that pass check at 100%, idempotently',
    () => {
      for (const args of [
        ['resource', 'users'],
        ['page', 'Users'],
        ['component', 'UserCard'],
      ]) {
        const r = vibejs(app, 'g', ...args, '--json');
        expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, dryRun: false });
        expect(r.status).toBe(0);
      }
      const check = vibejs(app, 'check', '--json');
      expect(JSON.parse(check.stdout)).toMatchObject({ ok: true, diagnostics: [] });
      expect(check.status).toBe(0);
      const again = vibejs(app, 'g', 'resource', 'users', '--json');
      const ops: { op: string }[] = JSON.parse(again.stdout).ops;
      expect(new Set(ops.map((o) => o.op))).toEqual(new Set(['skip']));
      expect(again.status).toBe(0);
    },
    INSTALL,
  );

  it(
    'reports a type error in a .vibe template at its line and column',
    () => {
      const page = join(app, 'ui/src/pages/HomePage.vibe');
      const source = readFileSync(page, 'utf8');
      const broken = source.replace('{{ status }}', '{{ status.toFixed(1) }}');
      const before = broken.slice(0, broken.indexOf('toFixed')).split('\n');
      writeFileSync(page, broken);
      try {
        const r = vibejs(app, 'check', '--only', 'types', '--json');
        expect(r.status).toBe(1);
        expect(JSON.parse(r.stdout).diagnostics).toContainEqual(
          expect.objectContaining({
            source: 'tsc',
            code: 'TS2551',
            loc: `ui/src/pages/HomePage.vibe:${before.length}:${before.at(-1)!.length + 1}`,
          }),
        );
      } finally {
        writeFileSync(page, source);
      }
    },
    INSTALL,
  );

  it(
    'builds the UI and a server that answers the health check',
    async () => {
      const build = vibejs(app, 'build', '--json');
      expect(JSON.parse(build.stdout)).toMatchObject({ ok: true });
      const js = globSync('ui/dist/**/*.js', { cwd: app });
      expect(js.length).toBeGreaterThan(0);
      const gzip = js.reduce(
        (sum, file) => sum + gzipSync(readFileSync(join(app, file))).length,
        0,
      );
      // Reported, not gated (CONTRACTS C10).
      process.stdout.write(`template ui/dist JS: ${gzip} bytes gzip\n`);

      const server = spawn(process.execPath, ['server/dist/main.js'], {
        cwd: app,
        env: { ...env, PORT: '0' },
      });
      try {
        const url = await new Promise<string>((resolve, reject) => {
          server.on('exit', (code) => reject(new Error(`the server exited with ${code}`)));
          server.stdout.on('data', (chunk: Buffer) => {
            const port = /"url":"http:\/\/[^"]*:(\d+)\//.exec(String(chunk))?.[1];
            if (port) resolve(`http://127.0.0.1:${port}`);
          });
        });
        const res = await fetch(`${url}/api/health`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok' });
        // The generated resource is part of the built server.
        expect(await (await fetch(`${url}/api/users`)).json()).toEqual([]);
      } finally {
        server.kill();
      }
    },
    INSTALL,
  );
});

describe('npm', () => {
  it(
    'installs with npm, passes check and keeps the agent files current',
    () => {
      const app = scaffold('npm');
      const file = join(app, 'package.json');
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      // npm accepts an override of a direct dependency only with the same spec. The keys stay
      // sorted, as the app's formatter wants them.
      const specs = Object.entries(tarballs).map(([name, tarball]) => [name, `file:${tarball}`]);
      for (const [name, spec] of specs) {
        for (const deps of [pkg.dependencies, pkg.devDependencies])
          if (deps[name]) deps[name] = spec;
      }
      pkg.overrides = { ...Object.fromEntries(specs), ...pkg.overrides };
      writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
      must(run('npm', ['install', '--no-audit', '--no-fund'], app));
      const check = vibejs(app, 'check', '--json');
      expect(JSON.parse(check.stdout)).toMatchObject({ ok: true, diagnostics: [] });
      expect(check.status).toBe(0);
      expect(vibejs(app, 'agents', 'sync', '--check', '--json').status).toBe(0);
      expect(readFileSync(join(app, 'AGENTS.md'), 'utf8')).toContain(
        '`npx --no vibejs check --json`',
      );
    },
    2 * INSTALL,
  );
});
