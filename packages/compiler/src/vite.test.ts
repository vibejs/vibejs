import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import { isVibeError } from '@vibejs-org/errors';
import { parseSync } from 'oxc-parser';
import {
  build,
  createServer,
  defaultClientConditions,
  defaultServerConditions,
  normalizePath,
  type InlineConfig,
  type ModuleNode,
  type Plugin,
  type UpdatePayload,
  type ViteDevServer,
} from 'vite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../package.json' with { type: 'json' };
import { compile } from './compile.ts';
import { formatDiagnostic } from './diagnostics.ts';
import { vibe } from './vite.ts';

const fixture = normalizePath(fileURLToPath(new URL('../test/fixtures/vite-app', import.meta.url)));
const tmp = fileURLToPath(new URL('../test/.tmp', import.meta.url));
const style = (index: number, lang = 'css') => `?vibe&type=style&index=${index}&lang.${lang}`;
const isUpdate = (payload: unknown): payload is UpdatePayload =>
  typeof payload === 'object' && payload !== null && 'type' in payload && payload.type === 'update';
const devId = (rel: string) => createHash('sha256').update(rel).digest('hex').slice(0, 8);

function config(root: string, plugins: Plugin[] = [vibe()]): InlineConfig {
  return {
    root,
    configFile: false,
    logLevel: 'silent',
    cacheDir: join(tmp, 'vite-cache'),
    // No file watching: the hot update tests emit `change` events themselves.
    server: { middlewareMode: true, ws: false, watch: null },
    resolve: { conditions: ['vibejs-source', ...defaultClientConditions] },
    ssr: { resolve: { conditions: ['vibejs-source', ...defaultServerConditions] } },
    plugins,
  };
}

/** A copy of the fixture app inside the package, so `node_modules` still resolves from it. */
async function copyApp(): Promise<string> {
  await mkdir(tmp, { recursive: true });
  const dir = await mkdtemp(join(tmp, 'app-'));
  await cp(fixture, dir, { recursive: true });
  return normalizePath(dir);
}

async function buildApp(root: string): Promise<{ css: string; js: string }> {
  const result = await build({ ...config(root), build: { write: false } });
  if (!('output' in result)) throw new Error('Expected a single build output.');
  const { output } = result;
  const css = output.flatMap((f) => (f.type === 'asset' ? [String(f.source)] : []));
  const js = output.flatMap((f) => (f.type === 'chunk' ? [f.code] : []));
  return { css: css.join('\n'), js: js.join('\n') };
}

let server: ViteDevServer;
beforeAll(async () => {
  server = await createServer(config(fixture));
});
afterAll(async () => {
  await server.close();
  await rm(tmp, { recursive: true, force: true });
});

describe('vibe() main module', () => {
  it('serves JavaScript with one style import per block in order and the dev footer', async () => {
    const client = server.environments.client;
    const { code } = (await client.transformRequest('/src/App.vibe'))!;
    expect(parseSync('App.js', code, { lang: 'js' }).errors).toStrictEqual([]);
    expect([...code.matchAll(/^import "(.+\?vibe&.+)";$/gm)].map((m) => m[1])).toStrictEqual([
      `/src/App.vibe${style(0)}`,
      `/src/App.vibe${style(1)}`,
    ]);
    expect(code).toContain('__file: "src/App.vibe"');
    expect(code).toContain('_hmr.createRecord(_sfc.__hmrId, _sfc)');
    expect(code).toContain('import.meta.hot.accept((m) => {');
    expect(code).not.toContain('__rerenderOnly = true');

    const main = (await client.transformRequest('/src/main.ts'))!;
    expect(main.code).toContain('import App from "/src/App.vibe?import"');
    const imported = (await client.transformRequest('/src/App.vibe?import'))!;
    expect(imported.code).toBe(code);
  });

  it('chains the source map back to the .vibe file', async () => {
    const file = `${fixture}/src/App.vibe`;
    const source = await readFile(file, 'utf8');
    const { code, map } = (await server.environments.client.transformRequest('/src/App.vibe'))!;
    const trace = new TraceMap(JSON.stringify(map), file);
    const generated = (needle: string) => {
      const lines = code.slice(0, code.indexOf(needle)).split('\n');
      return { line: lines.length, column: lines.at(-1)!.length };
    };
    const original = (needle: string) => {
      const lines = source.slice(0, source.indexOf(needle)).split('\n');
      return { source: file, line: lines.length, column: lines.at(-1)!.length };
    };
    expect(originalPositionFor(trace, generated('$setup.count)'))).toMatchObject(
      original('count }}'),
    );
    expect(originalPositionFor(trace, generated('count = ref'))).toMatchObject(
      original('count: Ref'),
    );
  });

  it('gives the same dev id for POSIX and Windows separators', async () => {
    const source = await readFile(`${fixture}/src/App.vibe`, 'utf8');
    // A backslash is a separator only on Windows, so the Windows CI job adds those ids.
    const ids = [`${fixture}/src/App.vibe`];
    if (process.platform === 'win32')
      ids.push(`${fixture}/src\\App.vibe`, `${fixture.replaceAll('/', '\\')}\\src\\App.vibe`);
    for (const id of ids) {
      // The hooks are called directly, so the module id reaches the plugin as written.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- vibe() defines both hooks as plain functions
      const plugin = vibe() as {
        configResolved: (config: object) => void;
        transform: (this: object, code: string, id: string) => Promise<{ code: string }>;
      };
      plugin.configResolved({ root: fixture, isProduction: false, command: 'serve' });
      const ctx = { environment: { config: { consumer: 'client' } } };
      const { code } = await plugin.transform.call(ctx, source, id);
      expect(code).toContain(`__hmrId: "${devId('src/App.vibe')}"`);
    }
  });

  it('leaves ?raw and ?url imports of a .vibe file to Vite', async () => {
    const client = server.environments.client;
    const source = await readFile(`${fixture}/src/App.vibe`, 'utf8');
    const raw = (await client.transformRequest('/src/App.vibe?raw'))!;
    expect(raw.code).toContain(JSON.stringify(source));
    const url = (await client.transformRequest('/src/App.vibe?url'))!;
    expect(url.code).toContain('export default');
  });

  it('reports compile errors in the C2 shape', async () => {
    const file = `${fixture}/src/Broken.vibe`;
    const source = await readFile(file, 'utf8');
    const { diagnostics } = compile(source, { filename: 'src/Broken.vibe', id: '0', dev: true });
    const [d0] = diagnostics;
    expect(d0.code).toBe('VIBE1007');
    await expect(
      server.environments.client.transformRequest('/src/Broken.vibe'),
    ).rejects.toMatchObject({
      message: formatDiagnostic(d0, source),
      code: 'VIBE1007',
      id: file,
      loc: { file, line: 5, column: 8 },
      frame: '5 | <style module>\n  |        ^^^^^^',
      plugin: 'vibejs',
      diagnostics,
    });
  });
});

describe('vibe() style modules', () => {
  it('scopes a scoped block to the component and passes an unscoped block through', async () => {
    const client = server.environments.client;
    const { code } = (await client.transformRequest('/src/App.vibe'))!;
    const scopeId = /__scopeId: "(data-vb-[0-9a-f]{8})"/.exec(code)![1];
    const scoped = (await client.transformRequest(`/src/App.vibe${style(0)}`))!;
    expect(scoped.code).toContain(`.btn[${scopeId}] { color: rebeccapurple; }`);
    const module = await client.moduleGraph.getModuleByUrl(`/src/App.vibe${style(0)}`);
    expect(client.pluginContainer.getModuleInfo(module!.id!)?.meta).toMatchObject({
      vite: { cssScopeTo: [`${fixture}/src/App.vibe`, 'default'] },
    });
    const plain = (await client.transformRequest(`/src/App.vibe${style(1)}`))!;
    expect(plain.code).toContain(JSON.stringify('\nbody { margin: 0; }\n'));
  });

  it('loads a style module from disk after a restart', async () => {
    const restarted = await createServer(config(fixture));
    const scoped = (await restarted.environments.client.transformRequest(
      `/src/App.vibe${style(0)}`,
    ))!;
    await restarted.close();
    expect(scoped.code).toContain(`.btn[data-vb-${devId('src/App.vibe')}]`);
  });

  it('reports CSS errors with a CSS-relative location', async () => {
    const file = `${fixture}/src/BrokenStyle.vibe`;
    await expect(
      server.environments.client.transformRequest(`/src/BrokenStyle.vibe${style(0)}`),
    ).rejects.toMatchObject({
      code: 'VIBE4001',
      id: `${file}${style(0)}`,
      loc: { file, line: 3, column: 1 },
      frame: '3 | .b { color: blue;\n  | ^',
      plugin: 'vibejs',
    });
  });

  it('ignores an unknown block index and other .vibe queries', async () => {
    const container = server.environments.client.pluginContainer;
    await server.environments.client.transformRequest('/src/App.vibe');
    const unknown = `${fixture}/src/App.vibe${style(5)}`;
    expect(await container.load(unknown)).toBeNull();
    const other = `${fixture}/src/App.vibe?vibe&type=template`;
    expect(await container.load(other)).toBeNull();
  });
});

describe('vibe() environments', () => {
  it('rejects .vibe modules in a server environment with VIBE4901', async () => {
    const ssr = server.environments.ssr;
    for (const url of ['/src/App.vibe', `/src/App.vibe${style(0)}`]) {
      await expect(ssr.transformRequest(url)).rejects.toMatchObject({
        code: 'VIBE4901',
        plugin: 'vibejs',
        loc: { file: `${fixture}/src/App.vibe`, line: 1, column: 1 },
        diagnostics: [{ code: 'VIBE4901', file: 'src/App.vibe' }],
      });
    }
    expect((await ssr.transformRequest('/src/main.ts'))!.code).toContain('createApp');
  });

  it('refuses to start against another @vibejs-org/ui version with VIBE4902', async () => {
    const other = await mkdtemp(join(tmpdir(), 'vibejs-vite-'));
    const none = await mkdtemp(join(tmpdir(), 'vibejs-vite-'));
    await mkdir(join(other, 'node_modules/@vibejs-org/ui'), { recursive: true });
    await writeFile(join(other, 'node_modules/@vibejs-org/ui/package.json'), '{"version":"9.9.9"}');
    try {
      for (const [root, ui] of [
        [other, '9.9.9'],
        [none, 'none'],
      ]) {
        const error: unknown = await createServer(config(root)).catch((e: unknown) => e);
        expect(isVibeError(error, 'VIBE4902')).toBe(true);
        expect(error).toMatchObject({ args: { ui, compiler: manifest.version } });
      }
    } finally {
      await rm(other, { recursive: true, force: true });
      await rm(none, { recursive: true, force: true });
    }
  });

  it('lets the dep optimizer see bare imports inside .vibe files', async () => {
    const optimizer = server.environments.client.depsOptimizer!;
    await optimizer.scanProcessing;
    const { discovered, optimized } = optimizer.metadata;
    expect({ ...discovered, ...optimized }).toHaveProperty('magic-string');
  });
});

describe('vibe() hot updates', () => {
  let root: string;
  let dev: ViteDevServer;
  let file: string;
  let source: string;
  // A plugin after vibe() receives the modules that vibe() returned from handleHotUpdate.
  let handled: (modules: ModuleNode[]) => void;
  // An extra listener for the modules of the next hot update.
  let onUpdate: ((modules: ModuleNode[]) => void) | undefined;
  const probe: Plugin = {
    name: 'probe',
    handleHotUpdate(ctx) {
      handled(ctx.modules);
      onUpdate?.(ctx.modules);
      onUpdate = undefined;
    },
  };

  beforeAll(async () => {
    root = await copyApp();
    file = `${root}/src/App.vibe`;
    source = await readFile(file, 'utf8');
    dev = await createServer(config(root, [vibe(), probe]));
  });
  afterAll(() => dev.close());

  /** Emits a change of `changed` and returns the hot updates that Vite sent for it. */
  async function change(changed: string): Promise<{ type: string; path: string }[]> {
    const send = vi.spyOn(dev.environments.client.hot, 'send');
    const modules = new Promise<ModuleNode[]>((resolve) => {
      handled = resolve;
    });
    dev.watcher.emit('change', changed);
    await modules;
    await new Promise((resolve) => setTimeout(resolve, 10));
    // `send` is overloaded, so its recorded calls are typed by the event-name form.
    const sent = send.mock.calls.flatMap(([payload]: unknown[]) =>
      isUpdate(payload) ? payload.updates.map(({ type, path }) => ({ type, path })) : [],
    );
    send.mockRestore();
    return sent;
  }

  /** Serves the main and style modules, saves `next`, and returns the updates and the new main module. */
  async function save(
    next: string,
  ): Promise<{ sent: { type: string; path: string }[]; code: string }> {
    const client = dev.environments.client;
    const { code: before } = (await client.transformRequest('/src/App.vibe'))!;
    for (const [, url] of before.matchAll(/^import "(.+\?vibe&.+)";$/gm))
      await client.transformRequest(url);
    await writeFile(file, next);
    source = next;
    const sent = await change(file);
    const { code } = (await client.transformRequest('/src/App.vibe'))!;
    return { sent, code };
  }

  const main = { type: 'js-update', path: '/src/App.vibe' };

  it('rerenders on a template-only edit', async () => {
    const { sent, code } = await save(source.replace('{{ count }}', 'n: {{ count }}'));
    expect(sent).toStrictEqual([main]);
    expect(code).toContain('_sfc.__rerenderOnly = true');
    expect(code).toContain(`__hmrId: "${devId('src/App.vibe')}"`);
  });

  it('reloads on a script edit', async () => {
    const { sent, code } = await save(source.replace('ref(0)', 'ref(1)'));
    expect(sent).toStrictEqual([main]);
    expect(code).not.toContain('_sfc.__rerenderOnly = true');
  });

  it('updates only the style module on a style content edit', async () => {
    const { sent } = await save(source.replace('rebeccapurple', 'teal'));
    expect(sent).toStrictEqual([{ type: 'js-update', path: `/src/App.vibe${style(0)}` }]);
  });

  it('reloads when a block flips scoped or lang, or a block is added', async () => {
    expect((await save(source.replace('<style scoped>', '<style>'))).sent).toStrictEqual([main]);
    expect((await save(source.replace('<style>', '<style lang="postcss">'))).sent).toStrictEqual([
      main,
    ]);
    expect((await save(`${source}\n<style>\np { margin: 0; }\n</style>\n`)).sent).toStrictEqual([
      main,
    ]);
  });

  it('rerenders only when every save since the last transform touched only the template', async () => {
    const client = dev.environments.client;
    await client.transformRequest('/src/App.vibe');
    for (const next of [
      source.replace(/ref\(\d+\)/, 'ref(3)'),
      source.replace(/ref\(\d+\)/, 'ref(3)').replace('{{ count }}', 'm: {{ count }}'),
    ]) {
      await writeFile(file, next);
      source = next;
      await change(file);
    }
    const { code } = (await client.transformRequest('/src/App.vibe'))!;
    expect(code).not.toContain('_sfc.__rerenderOnly = true');
  });

  it('reloads after a failed transform when the script changed since the last served module', async () => {
    const client = dev.environments.client;
    await client.transformRequest('/src/App.vibe');
    const edited = source.replace(/ref\(\d+\)/, 'ref(4)');
    await writeFile(file, edited.replace('{{ count }}', '{{ count + }}'));
    await change(file);
    await expect(client.transformRequest('/src/App.vibe')).rejects.toMatchObject({
      code: 'VIBE1201',
    });
    await writeFile(file, edited);
    source = edited;
    await change(file);
    const { code } = (await client.transformRequest('/src/App.vibe'))!;
    expect(code).toContain('ref(4)');
    expect(code).not.toContain('_sfc.__rerenderOnly = true');
  });

  it('keeps a ?raw import of the file in the hot update', async () => {
    await dev.environments.client.transformRequest('/src/App.vibe?raw');
    const modules = new Promise<ModuleNode[]>((resolve) => {
      onUpdate = resolve;
    });
    await save(source.replace('margin', 'padding'));
    expect((await modules).map((mod) => mod.url)).toContain('/src/App.vibe?raw');
  });

  it('sends nothing for a save without changes or for a file it never served', async () => {
    expect((await save(source)).sent).toStrictEqual([]);
    expect(await change(`${root}/src/Unused.vibe`)).toStrictEqual([]);
  });
});

describe('vibe() build', () => {
  // Vite reads production from NODE_ENV, which Vitest sets to `test`.
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  it('keeps only rendered scoped CSS and no dev code', async () => {
    const { css, js } = await buildApp(fixture);
    expect(css).toMatch(/\.btn\[data-vb-[0-9a-f]{8}\]/);
    expect(css).not.toContain('.unused');
    for (const dev of ['__file', '__hmrId', 'import.meta.hot', 'createRecord', '__rerenderOnly'])
      expect(js).not.toContain(dev);
  });

  it('gives production ids that change with the source', async () => {
    const root = await copyApp();
    const id = async () => /data-vb-([0-9a-f]{8})/.exec((await buildApp(root)).css)![1];
    const before = await id();
    const app = `${root}/src/App.vibe`;
    await writeFile(app, (await readFile(app, 'utf8')).replace('ref(0)', 'ref(2)'));
    expect(await id()).not.toBe(before);
    expect(before).not.toBe(devId('src/App.vibe'));
  });
});
