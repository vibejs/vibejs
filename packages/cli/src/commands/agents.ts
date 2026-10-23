import { dirname } from 'node:path';
import { isVibeError } from '@usevibejs/errors';
import { projectAgentFiles, syncAgentFiles, type AgentOp } from '../agents.ts';
import type { CommandDef } from '../command.ts';
import { vibeError } from '../errors.gen.ts';
import { envelopeError, type JsonEnvelope } from '../output.ts';
import { findRoot } from '../project.ts';

export interface AgentsResult extends JsonEnvelope {
  ops: AgentOp[];
}

export const agents: CommandDef<AgentsResult> = {
  name: 'agents',
  summary:
    'Write the vibe.js rules into AGENTS.md and CLAUDE.md, the vibejs-* skills into .agents/skills and .claude/skills, and the vibejs server into .mcp.json.',
  usage: 'vibejs agents sync [--check]',
  examples: ['vibejs agents sync', 'vibejs agents sync --check'],
  options: {
    check: {
      type: 'boolean',
      description: 'Write nothing; fail when a file is out of date.',
    },
  },
  positionals: [
    { name: 'action', required: true, values: ['sync'], example: 'vibejs agents sync' },
  ],
  async run({ values, positionals: [action] }, ctx) {
    const base = { ok: true, command: 'agents', version: ctx.version, ops: [] };
    if (action !== 'sync') {
      const error = envelopeError(vibeError('VIBE8004', { name: action }));
      return { ...base, ok: false, next: ['vibejs agents sync'], error };
    }
    const root = findRoot(ctx.cwd);
    if (!root) {
      return { ...base, ok: false, error: envelopeError(vibeError('VIBE8001', { cwd: ctx.cwd })) };
    }
    let ops: AgentOp[];
    try {
      const files = projectAgentFiles(root, dirname(ctx.docsDir));
      ops = syncAgentFiles(root, files, values.check !== true);
    } catch (error) {
      if (!isVibeError(error)) throw error;
      return { ...base, ok: false, next: ['vibejs agents sync'], error: envelopeError(error) };
    }
    const ok = values.check !== true || ops.every((o) => o.op === 'skip');
    return { ...base, ok, ops, next: ok ? undefined : ['vibejs agents sync'] };
  },
  human: (r) =>
    [
      ...r.ops.map((o) => `${o.file}: ${o.op}`),
      ...(r.ok ? [] : ['Out of date; run `vibejs agents sync`.']),
    ].join('\n'),
};
