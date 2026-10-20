import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isVibeError } from '@vibejs-org/errors';
import type { CommandDef } from '../command.ts';
import { vibeError } from '../errors.gen.ts';
import { fixName, KINDS, names, plan, type FileOp } from '../generate/plan.ts';
import { files } from '../generate/templates.ts';
import { envelopeError, type JsonEnvelope } from '../output.ts';
import { findRoot } from '../project.ts';

export interface GenerateResult extends JsonEnvelope {
  /** As given; one of the generator kinds unless the error is VIBE8004. */
  kind: string;
  name: string;
  dryRun: boolean;
  ops: FileOp[];
  consent?: string;
}

function readOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

export const generate: CommandDef<GenerateResult> = {
  name: 'generate',
  aliases: ['g'],
  summary: 'Add a resource, a component or a page with its tests, and register it.',
  usage:
    'vibejs generate <resource|component|page> <name> [--dry-run] [--force] [--singular <word>]',
  examples: [
    'vibejs generate resource users --dry-run',
    'vibejs g resource people --singular person --dry-run',
    'vibejs g component UserCard --dry-run',
    'vibejs g page Users --dry-run',
  ],
  options: {
    'dry-run': {
      type: 'boolean',
      description: 'Write nothing; list every change with its content.',
    },
    force: {
      type: 'boolean',
      description: 'Overwrite files that differ; in agent mode it needs VIBEJS_USER_CONSENT.',
    },
    singular: {
      type: 'string',
      description: 'The singular of a resource name, such as `person` for `people`.',
    },
  },
  positionals: [
    {
      name: 'kind',
      required: true,
      values: [...KINDS],
      example: 'vibejs generate resource users',
    },
    { name: 'name', required: true, example: 'vibejs generate resource users' },
  ],
  async run({ values, positionals: [kind, name] }, ctx) {
    const dryRun = values['dry-run'] === true;
    const result: GenerateResult = {
      ok: true,
      command: 'generate',
      version: ctx.version,
      next: undefined,
      error: undefined,
      kind,
      name,
      dryRun,
      ops: [],
    };
    const failed = (e: ReturnType<typeof vibeError>, next?: string[]): GenerateResult => ({
      ...result,
      ok: false,
      next,
      error: envelopeError(e),
    });
    const k = KINDS.find((known) => known === kind);
    if (!k) return failed(vibeError('VIBE8004', { name: kind }), ['vibejs generate --help']);
    const root = findRoot(ctx.cwd);
    if (!root) return failed(vibeError('VIBE8001', { cwd: ctx.cwd }));
    const singular = typeof values.singular === 'string' ? values.singular : undefined;
    let n;
    try {
      n = names(k, name, singular);
    } catch (error) {
      if (!isVibeError(error)) throw error;
      const fixed = [`vibejs generate ${k} ${fixName(k, name)}`];
      if (singular && k === 'resource') fixed[0] += ` --singular ${fixName(k, singular)}`;
      return failed(error, fixed);
    }
    let ops = plan(k, n, (path) => readOrUndefined(join(root, path)));
    const conflicts = ops.filter((o) => o.op === 'conflict').map((o) => o.path);
    if (conflicts.length) {
      // Contents only in a dry run, as below.
      result.ops = dryRun
        ? ops
        : ops.map((o) => ('content' in o ? { ...o, content: undefined } : o));
      if (values.force !== true) {
        const args = { count: conflicts.length, kind, name, paths: conflicts.join(', ') };
        return failed(vibeError('VIBE8401', args), [
          `vibejs generate ${kind} ${name} --dry-run --json`,
        ]);
      }
      if (ctx.agent.active && !ctx.consent) {
        return failed(vibeError('VIBE8010', { count: conflicts.length }), [
          `VIBEJS_USER_CONSENT='<their words>' vibejs generate ${kind} ${name} --force`,
        ]);
      }
      const content = files(k, n);
      ops = ops.map((o) =>
        o.op === 'conflict'
          ? { op: 'update', path: o.path, reason: 'forced', content: content[o.path] }
          : o,
      );
      result.consent = ctx.agent.active ? ctx.consent : undefined;
    }
    if (!dryRun) {
      for (const o of ops) {
        if (o.op !== 'create' && o.op !== 'update') continue;
        const path = join(root, o.path);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, o.content!);
        delete o.content;
      }
    }
    const manual = ops.flatMap((o) => (o.op === 'manual' ? [o.instruction] : []));
    return { ...result, next: ['vibejs check --json', ...manual], ops };
  },
  human: (r) =>
    r.ops
      .map((o) => `${o.op.padEnd(8)} ${o.path}${o.op === 'manual' ? `  ${o.instruction}` : ''}`)
      .join('\n'),
};
