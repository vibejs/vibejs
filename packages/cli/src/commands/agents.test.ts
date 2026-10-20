import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { testCtx } from '../../test/app.ts';
import { BEGIN } from '../agents.ts';
import { main } from '../main.ts';
import { exitCode } from '../output.ts';
import { agents, type AgentsResult } from './agents.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibejs-agents-'));
  writeFileSync(join(root, 'package.json'), '{"devDependencies":{"@vibejs-org/cli":"0.0.0"}}');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function run(values: Record<string, boolean> = {}, action = 'sync', cwd = root) {
  return agents.run({ values, positionals: [action] }, testCtx(cwd).ctx);
}

it('writes the agent files with the project package manager, then skips them', async () => {
  writeFileSync(join(root, 'yarn.lock'), '');
  const r = await run();
  expect(r).toEqual({
    ok: true,
    command: 'agents',
    version: '1.2.3',
    ops: [
      { file: 'AGENTS.md', op: 'create' },
      { file: 'CLAUDE.md', op: 'create' },
      { file: '.agents/skills/vibejs-fixture/SKILL.md', op: 'create' },
      { file: '.claude/skills/vibejs-fixture/SKILL.md', op: 'create' },
      { file: '.mcp.json', op: 'create' },
    ],
  } satisfies AgentsResult);
  expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('`yarn vibejs check --json`');
  expect(JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers.vibejs).toEqual({
    command: 'yarn',
    args: ['vibejs', 'mcp'],
  });
  expect((await run()).ops.map((o) => o.op)).toEqual(['skip', 'skip', 'skip', 'skip', 'skip']);
  expect(agents.human(r)).toBe(
    [
      'AGENTS.md: create',
      'CLAUDE.md: create',
      '.agents/skills/vibejs-fixture/SKILL.md: create',
      '.claude/skills/vibejs-fixture/SKILL.md: create',
      '.mcp.json: create',
    ].join('\n'),
  );
});

it('--check writes nothing and fails while a file is out of date', async () => {
  const r = await run({ check: true });
  expect(r).toMatchObject({ ok: false, next: ['vibejs agents sync'] });
  expect(new Set(r.ops.map((o) => o.op))).toEqual(new Set(['create']));
  expect(exitCode(r)).toBe(1);
  expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
  expect(agents.human(r)).toContain('Out of date; run `vibejs agents sync`.');

  await run();
  const current = await run({ check: true });
  expect(current.ok).toBe(true);
  expect(exitCode(current)).toBe(0);
});

it.each([
  ['a changed skill', '.claude/skills/vibejs-fixture/SKILL.md', 'update'],
  ['a stale skill directory', '.agents/skills/vibejs-old', 'delete'],
  ['a changed .mcp.json', '.mcp.json', 'update'],
] as const)('--check fails on %s and writes nothing', async (_, file, op) => {
  await run();
  const written = op === 'delete' ? `${file}/SKILL.md` : file;
  mkdirSync(join(root, dirname(written)), { recursive: true });
  writeFileSync(join(root, written), '{}');
  const r = await run({ check: true });
  expect(r.ops.filter((o) => o.op !== 'skip')).toEqual([{ file, op }]);
  expect(exitCode(r)).toBe(1);
  expect(readFileSync(join(root, written), 'utf8')).toBe('{}');
});

it('reports an invalid .mcp.json as VIBE8602 with exit 1', async () => {
  writeFileSync(join(root, '.mcp.json'), '[]');
  const r = await run();
  expect(r).toMatchObject({ ok: false, ops: [], error: { code: 'VIBE8602' } });
  expect(exitCode(r)).toBe(1);
  expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
});

it('reports malformed markers as VIBE8601 with exit 1', async () => {
  writeFileSync(join(root, 'AGENTS.md'), `${BEGIN}\n`);
  const r = await run({ check: true });
  expect(r).toMatchObject({ ok: false, ops: [], error: { code: 'VIBE8601' } });
  expect(exitCode(r)).toBe(1);
});

it('rethrows an error other than a VibeError', async () => {
  const t = testCtx(root);
  t.ctx.docsDir = join(root, 'missing');
  await expect(agents.run({ values: {}, positionals: ['sync'] }, t.ctx)).rejects.toThrow('ENOENT');
});

it('needs a project and the sync action', async () => {
  expect((await run({}, 'sync', tmpdir())).error?.code).toBe('VIBE8001');
  const r = await run({}, 'update');
  expect(r).toMatchObject({ error: { code: 'VIBE8004' }, next: ['vibejs agents sync'] });
  expect(exitCode(r)).toBe(2);
});

it('answers a missing action with VIBE8003 listing sync, exit 2', async () => {
  const t = testCtx(root);
  expect(await main(['agents'], t.ctx)).toBe(2);
  expect(JSON.parse(t.out.join(''))).toMatchObject({
    error: {
      code: 'VIBE8003',
      missing: [{ name: 'action', values: ['sync'], example: 'vibejs agents sync' }],
    },
  });
});
