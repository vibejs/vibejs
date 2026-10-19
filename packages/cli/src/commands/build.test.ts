import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyApp, edit, testCtx } from '../../test/app.ts';
import { exitCode } from '../output.ts';
import { build, buildReason, type BuildResult } from './build.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * A copy whose server dependencies are empty stubs: the server build only resolves them, and the
 * workspace packages have no dist before the build. The integration test runs the real output.
 */
function app(prepare?: (root: string) => void): string {
  const root = copyApp(['vite']);
  for (const pkg of ['@vibejs-org/server', '@vibejs-org/contract']) {
    const dir = join(root, 'node_modules', pkg);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: pkg, type: 'module', exports: './index.js' }),
    );
    writeFileSync(join(dir, 'index.js'), '');
  }
  roots.push(root);
  prepare?.(root);
  return root;
}

const run = (root: string, agent = true) =>
  build.run({ values: {}, positionals: [] }, testCtx(root, agent).ctx);

it('builds the UI into ui/dist and the server into server/dist/main.js', async () => {
  const root = app();
  const r = await run(root);
  expect(r).toEqual({
    ok: true,
    command: 'build',
    version: '1.2.3',
    ui: { outDir: 'ui/dist', ms: expect.any(Number) },
    server: { entry: 'server/dist/main.js', ms: expect.any(Number) },
  });
  expect(JSON.stringify(Object.keys(r))).toMatchInlineSnapshot(
    `"["ok","command","version","ui","server"]"`,
  );
  expect(existsSync(join(root, 'ui/dist/index.html'))).toBe(true);
  expect(existsSync(join(root, 'server/dist/main.js'))).toBe(true);
  expect(build.human(r)).toMatch(
    /^Built ui\/dist in \d+ ms and server\/dist\/main\.js in \d+ ms\.$/,
  );
});

it('prints Vite info output in human mode', async () => {
  expect((await run(app(), false)).ok).toBe(true);
});

it('fails with VIBE8304 for the part that does not build', async () => {
  const ui = await run(app((at) => writeFileSync(join(at, 'ui/src/main.ts'), 'const = ;\n')));
  expect(ui).toMatchObject({ ok: false, next: ['vibejs build'], error: { code: 'VIBE8304' } });
  expect(ui.error!.message).toMatch(/^Building the ui failed: \S+/);
  expect(exitCode(ui)).toBe(1);

  const server = await run(
    app((at) => edit(at, 'server/src/app.module.ts', "return 'ok';", "return 'ok'; }}")),
  );
  expect(server.error!.message).toMatch(/^Building the server failed: /);
  expect(exitCode(server)).toBe(1);
});

it('names the VIBE code, location and message of a plugin error', async () => {
  const r: BuildResult = await run(
    app((at) => writeFileSync(join(at, 'ui/src/main.ts'), "export const m = 'FIXTURE_ERROR';\n")),
  );
  expect(r.error!.message).toBe(
    'Building the ui failed: VIBE1001 ui/src/main.ts:2:5 fixture error.',
  );
});

it('reports an error outside the bundle, such as a broken Vite config', async () => {
  const r = await run(
    app((at) => writeFileSync(join(at, 'ui/vite.config.ts'), 'export default {;\n')),
  );
  expect(r.error!.message).toMatch(/^Building the ui failed: \S/);
});

const error = (e: object) => Object.assign(new Error('first line\nmore'), e);

describe('buildReason', () => {
  const root = '/project';

  it('joins the parts an error has, without colors', () => {
    const located = error({
      code: 'PARSE_ERROR',
      id: '/project/ui/a.ts',
      loc: { line: 1, column: 2 },
    });
    expect(buildReason(root, located)).toBe('PARSE_ERROR ui/a.ts:1:2 first line');
    expect(buildReason(root, error({ id: '/project/ui/a.ts' }))).toBe('ui/a.ts first line');
    expect(buildReason(root, new Error('\u001b[31mred\u001b[0m'))).toBe('red');
    expect(buildReason(root, error({ code: 'PLUGIN_ERROR', pluginCode: 'VIBE1001' }))).toBe(
      'VIBE1001 first line',
    );
  });

  it('reads the first error of an aggregate', () => {
    const aggregate = error({ errors: [error({ code: 'UNRESOLVED_IMPORT' }), error({})] });
    expect(buildReason(root, aggregate)).toBe('UNRESOLVED_IMPORT first line');
  });
});

it('needs the full-stack layout', async () => {
  const r = await run(app((at) => rmSync(join(at, 'server/src/main.ts'))));
  expect(r.error).toMatchObject({ code: 'VIBE8201' });
  expect(r.error!.message).toContain('`vibejs build` expects');
  expect(exitCode(r)).toBe(2);
});
