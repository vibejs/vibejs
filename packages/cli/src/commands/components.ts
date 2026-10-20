import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { VibeError } from '@vibejs-org/errors';
import type { CommandDef } from '../command.ts';
import { envelopeError, type JsonEnvelope } from '../output.ts';
import { fullstackRoot, projectCompiler, vibeFiles } from '../project.ts';

export interface ComponentInfo {
  /** The file name without `.vibe`: the PascalCase tag. */
  name: string;
  /** Root-relative, with `/` separators. */
  file: string;
  /** The prop keys, in declaration order. */
  props: string[];
  /** The `defineModel` names. */
  models: string[];
  /** The source text of each macro type argument. */
  types: { props?: string; emits?: string; slots?: string };
  /** VIBE codes from parsing and analyzing the file; non-empty adds `vibejs check --json` to `next`. */
  diagnostics: string[];
}

export interface ComponentsResult extends JsonEnvelope {
  /** `[]` on error. */
  components: ComponentInfo[];
}

export const components: CommandDef<ComponentsResult> = {
  name: 'components',
  summary: 'List the .vibe components with their props, models and types, without running them.',
  usage: 'vibejs components [--name NAME]',
  examples: ['vibejs components', 'vibejs components --name TodoList'],
  options: {
    name: { type: 'string', description: 'Only the component NAME.' },
  },
  positionals: [],
  async run({ values }, ctx) {
    const base = { ok: true, command: 'components', version: ctx.version };
    const failed = (e: VibeError) => ({
      ...base,
      ok: false,
      error: envelopeError(e),
      components: [],
    });
    const root = fullstackRoot(ctx.cwd, 'components');
    if (typeof root !== 'string') return failed(root);
    const compiler = await projectCompiler(root);
    if (compiler instanceof Error) return failed(compiler);
    const name = typeof values.name === 'string' ? values.name : undefined;
    const list: ComponentInfo[] = [];
    for (const native of vibeFiles(root, 'ui/src')) {
      const file = native.replaceAll('\\', '/');
      if (name !== undefined && basename(file, '.vibe') !== name) continue;
      const filename = join(root, native);
      const source = readFileSync(filename, 'utf8');
      const parsed = compiler.parse(source, { filename });
      const a = compiler.analyzeScript(parsed.descriptor);
      const types: ComponentInfo['types'] = {};
      for (const key of ['props', 'emits', 'slots'] as const) {
        const macro = a.macros[key];
        if (macro) types[key] = source.slice(...macro.typeArg);
      }
      list.push({
        name: basename(file, '.vibe'),
        file,
        props: a.propKeys.map((p) => p.name),
        models: a.macros.models.map((m) => m.name),
        types,
        diagnostics: [...parsed.diagnostics, ...a.diagnostics].map((d) => d.code),
      });
    }
    const next = [
      ...(name !== undefined && !list.length ? ['vibejs components'] : []),
      ...(list.some((c) => c.diagnostics.length) ? ['vibejs check --json'] : []),
    ];
    return { ...base, next: next.length ? next : undefined, components: list };
  },
  human: (r) =>
    r.components.length
      ? r.components
          .map((c) =>
            [
              `${c.name} (${c.file})`,
              ...(c.props.length ? [`  props: ${c.props.join(', ')}`] : []),
              ...(c.models.length ? [`  models: ${c.models.join(', ')}`] : []),
              ...(c.types.emits ? [`  emits: ${c.types.emits}`] : []),
              ...(c.types.slots ? [`  slots: ${c.types.slots}`] : []),
            ].join('\n'),
          )
          .join('\n')
      : 'No component matches.',
};
