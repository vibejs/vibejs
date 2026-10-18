import { CATALOG, type CatalogEntry } from '../catalog.gen.ts';
import type { CommandDef } from '../command.ts';
import { vibeError } from '../errors.gen.ts';
import { envelopeError, type ExplainResult } from '../output.ts';

/** The catalog entry of a code (any case), retired entries included. */
export function lookup(
  code: string,
  catalog: readonly CatalogEntry[] = CATALOG,
): CatalogEntry | undefined {
  return catalog.find((entry) => entry.code === code.toUpperCase());
}

export function entryMarkdown(entry: CatalogEntry): string {
  return [
    `# ${entry.code}: ${entry.title}${entry.retired ? ' (retired)' : ''}`,
    '',
    `> ${entry.message}`,
    ...(entry.body ? ['', entry.body] : []),
    '',
    '## Fix',
    '',
    ...entry.fixes.map((fix) => `- ${fix}`),
    '',
    `Docs: ${entry.docs}`,
  ].join('\n');
}

export const explain: CommandDef<ExplainResult> = {
  name: 'explain',
  summary: 'Explain a VIBE error code from the bundled catalog, offline.',
  usage: 'vibejs explain <code>',
  examples: ['vibejs explain VIBE8003'],
  options: {},
  positionals: [{ name: 'code', required: true, example: 'vibejs explain VIBE8003' }],
  async run({ positionals: [code] }, ctx) {
    const entry = lookup(code);
    if (entry) return { ok: true, command: 'explain', version: ctx.version, entry };
    const error = envelopeError(vibeError('VIBE8008', { code }));
    return { ok: false, command: 'explain', version: ctx.version, error };
  },
  human: (r) => entryMarkdown(r.entry!),
};
