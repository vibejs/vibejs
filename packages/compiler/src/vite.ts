import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { normalizePath, transformWithOxc, type Plugin, type Rollup } from 'vite';
import manifest from '../package.json' with { type: 'json' };
import { compile } from './compile.ts';
import { codeFrame, formatDiagnostic, toDiagnostic, type Diagnostic } from './diagnostics.ts';
import { vibeError } from './errors.gen.ts';
import { parse, type SFCBlock, type SFCDescriptor } from './sfc/parse.ts';
import { compileStyle } from './style/compileStyle.ts';

interface Entry {
  descriptor: SFCDescriptor;
  id: string;
  /** The descriptor before the last hot update, consumed by the next transform of the main module. */
  prev?: SFCDescriptor;
}

const footer = (rerenderOnly: boolean): string => `
import { hmr as _hmr } from '@vibejs-org/ui/internal'
${rerenderOnly ? '_sfc.__rerenderOnly = true\n' : ''}if (import.meta.hot) {
  _hmr.createRecord(_sfc.__hmrId, _sfc)
  import.meta.hot.accept((m) => { if (!m) return; const c = m.default
    c.__rerenderOnly ? _hmr.rerender(c.__hmrId, c.render) : _hmr.reload(c.__hmrId, c) })
}
`;

/** The main module (`index` undefined) or a style module of a `.vibe` file, from a module id. */
function match(id: string): { file: string; index?: number } | undefined {
  const [file, query] = id.split('?', 2);
  if (!file.endsWith('.vibe')) return undefined;
  const params = new URLSearchParams(query);
  if (!params.has('vibe')) return { file };
  if (params.get('type') === 'style' && params.has('index'))
    return { file, index: Number(params.get('index')) };
  return undefined;
}

const sameBlock = (a: SFCBlock | null, b: SFCBlock | null): boolean =>
  a?.content === b?.content && JSON.stringify(a?.attrs) === JSON.stringify(b?.attrs);
const styleShape = (d: SFCDescriptor): string =>
  JSON.stringify(d.styles.map(({ lang, scoped }) => [lang, scoped]));

/** The version in the nearest `node_modules/@vibejs-org/ui/package.json` at or above `root`. */
function uiVersion(root: string): string | undefined {
  for (let dir = root; ;) {
    const file = join(dir, 'node_modules/@vibejs-org/ui/package.json');
    if (existsSync(file)) {
      const { version }: { version: string } = JSON.parse(readFileSync(file, 'utf8'));
      return version;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Reports diagnostics to Vite in the C2 shape, with `source` as the frame source. */
function fail(
  ctx: Rollup.TransformPluginContext,
  diagnostics: Diagnostic[],
  source: string,
  file: string,
  id: string,
): never {
  const [d0] = diagnostics;
  // `diagnostics` rides along as an extra property, so the object is not a fresh literal.
  const error = {
    message: formatDiagnostic(d0, source),
    id,
    loc: { file, line: d0.start.line, column: d0.start.column },
    frame: codeFrame(source, d0.start, d0.end),
    code: d0.code,
    plugin: 'vibejs',
    diagnostics,
  };
  return ctx.error(error);
}

/** The vibe.js Vite plugin. Client environments only; throws VIBE4902 on a @vibejs-org/ui version mismatch. */
export function vibe(): Plugin {
  const cache = new Map<string, Entry>();
  let root = '';
  let dev = true;
  let hot = false;
  const rel = (file: string): string => normalizePath(relative(root, file));
  // The 8-hex component id: stable across edits in development, content-addressed in production.
  const componentId = (file: string, source: string): string =>
    createHash('sha256')
      .update(dev ? rel(file) : `${rel(file)}\0${source}`)
      .digest('hex')
      .slice(0, 8);

  return {
    name: 'vibejs',

    config: () => ({
      resolve: { dedupe: ['@vibejs-org/ui'] },
      optimizeDeps: {
        extensions: ['.vibe'],
        rolldownOptions: {
          plugins: [
            {
              // The dep optimizer scans the script of each `.vibe` file for bare imports.
              name: 'vibejs:scan',
              load: {
                filter: { id: /\.vibe$/ },
                async handler(id) {
                  const { descriptor } = parse(await readFile(id, 'utf8'), { filename: id });
                  return { code: descriptor.scriptSetup?.content ?? '', moduleType: 'ts' };
                },
              },
            },
          ],
        },
      },
    }),

    configResolved(config) {
      ({ root } = config);
      dev = !config.isProduction;
      hot = config.command === 'serve' && dev;
      const { version: compiler } = manifest;
      const ui = uiVersion(root);
      if (ui !== compiler) throw vibeError('VIBE4902', { ui: ui ?? 'none', compiler });
    },

    async load(id) {
      const m = match(id);
      if (m?.index === undefined) return null;
      let entry = cache.get(m.file);
      if (!entry) {
        // After a restart, a style module can load before its main module.
        const source = await readFile(m.file, 'utf8');
        const { descriptor } = parse(source, { filename: rel(m.file) });
        entry = { descriptor, id: componentId(m.file, source) };
        cache.set(m.file, entry);
      }
      const { styles } = entry.descriptor;
      return Object.hasOwn(styles, m.index) ? { code: styles[m.index].content } : null;
    },

    async transform(code, id) {
      const m = match(id);
      if (!m) return null;
      const { file } = m;
      if (this.environment.config.consumer === 'server') {
        const start = { offset: 0, line: 1, column: 1 };
        const error = vibeError('VIBE4901', { file: rel(file) });
        fail(this, [toDiagnostic(error, rel(file), start, start)], code, file, id);
      }

      if (m.index !== undefined) {
        const entry = cache.get(file)!;
        if (!entry.descriptor.styles[m.index]?.scoped) return null;
        const style = compileStyle(code, { filename: rel(file), id: entry.id });
        if (style.diagnostics.length > 0) fail(this, style.diagnostics, code, file, id);
        return {
          code: style.code,
          map: style.map,
          meta: { vite: { cssScopeTo: [file, 'default'] as const } },
        };
      }

      const prev = cache.get(file)?.prev;
      const cid = componentId(file, code);
      const result = compile(code, { filename: rel(file), id: cid, dev });
      const { descriptor } = result;
      cache.set(file, { descriptor, id: cid });
      if (result.diagnostics.length > 0) fail(this, result.diagnostics, code, file, id);

      let out = result.code;
      for (const { index, lang } of result.styles)
        out += `import ${JSON.stringify(`${file}?vibe&type=style&index=${index}&lang.${lang}`)}\n`;
      if (hot) {
        const rerenderOnly =
          prev !== undefined &&
          prev.template?.content !== descriptor.template?.content &&
          sameBlock(prev.scriptSetup, descriptor.scriptSetup) &&
          styleShape(prev) === styleShape(descriptor);
        out += footer(rerenderOnly);
      }
      const ts = await transformWithOxc(
        out,
        file,
        { lang: 'ts', sourcemap: true, typescript: { onlyRemoveTypeImports: true } },
        { ...result.map!, sources: [file] },
      );
      return { code: ts.code, map: ts.map, moduleType: 'js' };
    },

    async handleHotUpdate(ctx) {
      const entry = cache.get(ctx.file);
      if (!entry) return undefined;
      const prev = entry.descriptor;
      const { descriptor } = parse(await ctx.read(), { filename: prev.filename });
      cache.set(ctx.file, { descriptor, id: entry.id, prev });
      const main =
        !sameBlock(prev.scriptSetup, descriptor.scriptSetup) ||
        prev.template?.content !== descriptor.template?.content ||
        styleShape(prev) !== styleShape(descriptor);
      return ctx.modules.filter((mod) => {
        const { index } = match(mod.id!)!;
        if (index === undefined) return main;
        return prev.styles[index]?.content !== descriptor.styles[index]?.content;
      });
    },
  };
}
