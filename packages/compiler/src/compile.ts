import { fromMap, toEncodedMap } from '@jridgewell/gen-mapping';
import { generate } from './codegen.ts';
import type { Diagnostic } from './diagnostics.ts';
import { analyze } from './script/analyze.ts';
import { compileScript } from './script/compile.ts';
import { parse, type SFCDescriptor, type StyleLang } from './sfc/parse.ts';
import type { SourceMapV3 } from './style/compileStyle.ts';
import { transform } from './transform/index.ts';
import { componentName } from './transform/resolve.ts';

export interface CompileOptions {
  filename: string;
  /** The component's 8-hex id: the scope attribute `data-vb-<id>` and the dev HMR id. */
  id: string;
  dev: boolean;
}

export interface CompileResult {
  code: string;
  map: SourceMapV3 | null;
  descriptor: SFCDescriptor;
  styles: { index: number; scoped: boolean; lang: StyleLang }[];
  diagnostics: Diagnostic[];
}

const strings = (list: string[]): string => `[${list.map((s) => JSON.stringify(s)).join(', ')}]`;

/**
 * Compiles a `.vibe` file into one ESM TypeScript module whose default export is the component
 * definition, with one source map against `filename`. Never throws on user input: any diagnostic
 * gives `code: ''` and `map: null`, with the diagnostics of every phase sorted by offset.
 */
export function compile(source: string, options: CompileOptions): CompileResult {
  const { filename, id, dev } = options;
  const parsed = parse(source, { filename });
  const { descriptor } = parsed;
  const analysis = analyze(descriptor);
  const { ir, diagnostics: template } = transform(descriptor, analysis, { id });
  const styles = descriptor.styles.map(({ scoped, lang }, index) => ({ index, scoped, lang }));
  const diagnostics = [...parsed.diagnostics, ...analysis.diagnostics, ...template].toSorted(
    (a, b) => a.start.offset - b.start.offset,
  );
  if (diagnostics.length > 0 || !ir)
    return { code: '', map: null, descriptor, styles, diagnostics };

  const script = compileScript(descriptor, analysis);
  const abi = [...new Set([...ir.abi, ...script.abiImports])].toSorted();
  if (abi.length > 0) {
    const names = abi.map((name) => `${name} as _${name}`).join(', ');
    script.s.prepend(`import { ${names} } from '@vibejs-org/ui/internal'\n`);
  }
  const head = script.s.toString();
  const scriptMap = script.s.generateDecodedMap({
    hires: 'boundary',
    source: filename,
    includeContent: true,
  });
  const gen = fromMap({ version: 3, ...scriptMap });
  const body = generate(ir, { filename, source, dev }, gen, head.split('\n').length - 1);

  const { name = dev ? componentName(filename) : undefined } = script.options;
  const entries = [
    name !== undefined && `name: ${JSON.stringify(name)}`,
    dev && `__file: ${JSON.stringify(filename)}`,
    dev && `__hmrId: ${JSON.stringify(id)}`,
    styles.some((s) => s.scoped) && `__scopeId: "data-vb-${id}"`,
    script.propKeys.length > 0 && `__propKeys: ${strings(script.propKeys)}`,
    script.emits.length > 0 && `__emits: ${strings(script.emits)}`,
    script.defaults !== null && '__defaults: _defaults',
    script.options.inheritAttrs === false && 'inheritAttrs: false',
    script.hasSetup && 'setup: _setup',
    'render: _render',
  ].filter((entry) => entry !== false);
  const code = `${head}${body}const _sfc = { ${entries.join(', ')} }\nexport default _sfc\n`;

  // One source and no names: every segment points into `source`.
  const { mappings } = toEncodedMap(gen);
  const map: SourceMapV3 = {
    version: 3,
    sources: [filename],
    sourcesContent: [source],
    names: [],
    mappings,
  };
  return { code, map, descriptor, styles, diagnostics };
}
