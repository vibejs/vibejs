import { relative } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { InlineConfig, Rollup } from 'vite';
import type { CommandDef } from '../command.ts';
import { vibeError } from '../errors.gen.ts';
import { envelopeError, type JsonEnvelope } from '../output.ts';
import { fullstackRoot } from '../project.ts';

export interface BuildResult extends JsonEnvelope {
  ui?: { outDir: 'ui/dist'; ms: number };
  server?: { entry: 'server/dist/main.js'; ms: number };
}

/**
 * `CODE file:line:col message` of a build error, or of the first error of an aggregate, with the
 * parts it has. A plugin's own code (such as a VIBE code) wins over `PLUGIN_ERROR`.
 */
export function buildReason(root: string, error: unknown): string {
  const e: Rollup.RollupError = Object(error).errors?.[0] ?? Object(error);
  const file = e.id && relative(root, e.id).replaceAll('\\', '/');
  const at = file && e.loc ? `${file}:${e.loc.line}:${e.loc.column}` : file;
  const code = typeof e.pluginCode === 'string' ? e.pluginCode : e.code;
  const message = stripVTControlCharacters(e.message).split('\n', 1)[0];
  return [code, at, message].filter(Boolean).join(' ');
}

export const build: CommandDef<BuildResult> = {
  name: 'build',
  summary: 'Build the UI into ui/dist and the server into server/dist/main.js.',
  usage: 'vibejs build',
  examples: ['vibejs build'],
  options: {},
  positionals: [],
  async run({ values }, ctx) {
    const base = { ok: true, command: 'build', version: ctx.version };
    const root = fullstackRoot(ctx.cwd, 'build');
    if (typeof root !== 'string') return { ...base, ok: false, error: envelopeError(root) };
    // Vite prints info lines on stdout, which carries only the JSON object for agents.
    const logLevel = values.json === true || ctx.agent.active ? 'warn' : 'info';
    const parts: ['ui' | 'server', InlineConfig][] = [
      ['ui', { root: `${root}/ui`, logLevel }],
      [
        'server',
        {
          configFile: false,
          root: `${root}/server`,
          logLevel,
          build: { ssr: 'src/main.ts', outDir: 'dist', emptyOutDir: true, target: 'node24' },
        },
      ],
    ];
    // Loaded here, so the other commands start without Vite.
    const { build: viteBuild } = await import('vite');
    const ms: number[] = [];
    for (const [part, config] of parts) {
      const at = ctx.now();
      try {
        await viteBuild(config);
      } catch (error) {
        const e = vibeError('VIBE8304', { part, reason: buildReason(root, error) });
        return { ...base, ok: false, next: ['vibejs build'], error: envelopeError(e) };
      }
      ms.push(Math.round(ctx.now() - at));
    }
    return {
      ...base,
      ui: { outDir: 'ui/dist', ms: ms[0] },
      server: { entry: 'server/dist/main.js', ms: ms[1] },
    };
  },
  human: (r) => `Built ui/dist in ${r.ui!.ms} ms and server/dist/main.js in ${r.server!.ms} ms.`,
};
