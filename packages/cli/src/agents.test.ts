import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVibeError } from '@vibejs-org/errors';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BEGIN,
  END,
  execPrefix,
  mcpServer,
  projectAgentFiles,
  renderBlock,
  syncAgentFiles,
  type AgentFiles,
  type AgentOp,
} from './agents.ts';
import { CATALOG } from './catalog.gen.ts';

const INDEX = '[vibe.js docs index]|root: ./docs|.:{index.md}';
const FIXTURES = fileURLToPath(new URL('../test/fixtures', import.meta.url));
const SKILLS = fileURLToPath(new URL('../../../skills', import.meta.url));

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibejs-agents-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const read = (file: string) => readFileSync(join(root, file), 'utf8');
const crlf = (...list: string[]) => list.join('\r\n');
const ops = (...list: AgentOp['op'][]): AgentOp[] =>
  (['AGENTS.md', 'CLAUDE.md'] as const).map((file, i) => ({ file, op: list[i] }));
/** The AGENTS.md and CLAUDE.md ops of a sync without skills. */
const sync = (block: string, write = true) =>
  syncAgentFiles(root, { block, exec: 'npx --no vibejs', skills: {} }, write).slice(0, 2);

describe('renderBlock', () => {
  const block = renderBlock('pnpm exec vibejs', INDEX);
  const lines = block.split('\n');

  it('has at most 30 rule lines and one index line between the markers', () => {
    expect(lines[0]).toBe(BEGIN);
    expect(lines.at(-1)).toBe(END);
    const inner = lines.slice(1, -1);
    expect(inner.filter((line) => line === INDEX)).toHaveLength(1);
    expect(inner.length - 1).toBeLessThanOrEqual(30);
  });

  it('carries the disambiguation line of the repo AGENTS.md verbatim', () => {
    const agentsMd = readFileSync(new URL('../../../AGENTS.md', import.meta.url), 'utf8');
    const line = agentsMd.split('\n').find((l) => l.startsWith('vibe.js: npm scope'))!;
    expect(lines).toContain(line);
  });

  it('names only VIBE codes from the catalog and runs every command through the prefix', () => {
    const codes = block.match(/VIBE\d{4}/g) ?? [];
    expect(codes.filter((code) => !CATALOG.some((e) => e.code === code))).toEqual([]);
    expect(block).toContain('`pnpm exec vibejs check --json` exits 0');
    expect(block).toContain(
      '- `pnpm exec vibejs g resource|component|page <name>` adds code with its tests; `--dry-run --json` previews it.',
    );
  });
});

it('maps each package manager to its exec prefix', () => {
  expect((['pnpm', 'npm', 'yarn', 'bun'] as const).map(execPrefix)).toEqual([
    'pnpm exec vibejs',
    'npx --no vibejs',
    'yarn vibejs',
    'npx --no vibejs',
  ]);
});

it('maps an exec prefix to the .mcp.json entry that starts vibejs mcp', () => {
  expect((['pnpm', 'npm', 'yarn', 'bun'] as const).map((pm) => mcpServer(execPrefix(pm)))).toEqual([
    { command: 'pnpm', args: ['exec', 'vibejs', 'mcp'] },
    { command: 'npx', args: ['--no', 'vibejs', 'mcp'] },
    { command: 'yarn', args: ['vibejs', 'mcp'] },
    { command: 'npx', args: ['--no', 'vibejs', 'mcp'] },
  ]);
});

it('builds the agent files from the shipped docs index and skills and the package manager', () => {
  writeFileSync(join(root, 'pnpm-lock.yaml'), '');
  expect(projectAgentFiles(root, FIXTURES)).toEqual({
    block: renderBlock(
      'pnpm exec vibejs',
      readFileSync(join(FIXTURES, 'docs/index.txt'), 'utf8').trim(),
    ),
    exec: 'pnpm exec vibejs',
    skills: {
      'vibejs-fixture': readFileSync(join(FIXTURES, 'skills/vibejs-fixture/SKILL.md'), 'utf8'),
    },
  } satisfies AgentFiles);
});

describe('syncAgentFiles', () => {
  const block = renderBlock('npx --no vibejs', INDEX);
  const newer = renderBlock('npx --no vibejs', `${INDEX}|cli:{new.md}`);

  it('creates both files, then skips them', () => {
    expect(sync(block)).toEqual(ops('create', 'create'));
    expect(read('AGENTS.md')).toBe(`# AGENTS.md\n\n${block}\n\n## Project notes\n`);
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n');
    expect(sync(block)).toEqual(ops('skip', 'skip'));
  });

  it.each([
    ['LF', 'Before\n\n', '\n\nAfter\n'],
    ['CRLF', 'Before\r\n\r\n', '\r\n\r\nAfter\r\n'],
    ['no trailing newline', 'Before ', ' after'],
  ])('replaces only the text between the markers (%s)', (_, before, after) => {
    const nl = before.includes('\r\n') ? '\r\n' : '\n';
    writeFileSync(join(root, 'AGENTS.md'), `${before}${block.replaceAll('\n', nl)}${after}`);
    writeFileSync(join(root, 'CLAUDE.md'), '@AGENTS.md\n');
    expect(sync(newer)).toEqual(ops('update', 'skip'));
    expect(read('AGENTS.md')).toBe(`${before}${newer.replaceAll('\n', nl)}${after}`);
    expect(sync(newer)).toEqual(ops('skip', 'skip'));
  });

  it.each([
    ['# Notes\n', '# Notes\n\n'],
    ['# Notes', '# Notes\n\n'],
    ['# Notes\r\n', '# Notes\r\n\r\n'],
  ])('appends the block to an AGENTS.md without markers (%j)', (text, start) => {
    writeFileSync(join(root, 'AGENTS.md'), text);
    expect(sync(block)[0]).toEqual({ file: 'AGENTS.md', op: 'update' });
    const nl = text.includes('\r\n') ? '\r\n' : '\n';
    expect(read('AGENTS.md')).toBe(`${start}${block.replaceAll('\n', nl)}${nl}`);
    expect(sync(block)[0].op).toBe('skip');
  });

  it('prepends @AGENTS.md once to a CLAUDE.md without it', () => {
    const own = crlf('# Claude', '@AGENTS.md.bak', '');
    writeFileSync(join(root, 'CLAUDE.md'), own);
    expect(sync(block)[1]).toEqual({ file: 'CLAUDE.md', op: 'update' });
    expect(read('CLAUDE.md')).toBe(`@AGENTS.md\n${own}`);
    expect(sync(block)[1].op).toBe('skip');
    writeFileSync(join(root, 'CLAUDE.md'), crlf('# Claude', '@AGENTS.md', ''));
    expect(sync(block)[1].op).toBe('skip');
  });

  it('only reports without write', () => {
    writeFileSync(join(root, 'AGENTS.md'), `x\n${block}\n`);
    expect(sync(newer, false)).toEqual(ops('update', 'create'));
    expect(read('AGENTS.md')).toBe(`x\n${block}\n`);
    expect(() => read('CLAUDE.md')).toThrow('ENOENT');
  });

  it.each([
    ['a BEGIN marker without an END marker', `${BEGIN}\nrules\n`],
    ['an END marker without a BEGIN marker before it', `rules\n${END}\n`],
    ['an END marker without a BEGIN marker before it', `${END}\n${BEGIN}\n`],
    ['more than one BEGIN or END marker', `${BEGIN}\n${BEGIN}\n${END}\n`],
    ['more than one BEGIN or END marker', `${BEGIN}\n${END}\n${END}\n`],
  ])('throws VIBE8601 for %s and changes nothing', (problem, text) => {
    writeFileSync(join(root, 'AGENTS.md'), text);
    let error: unknown;
    try {
      sync(block);
    } catch (e) {
      error = e;
    }
    expect(isVibeError(error) && error.code).toBe('VIBE8601');
    expect(String(error)).toContain(`AGENTS.md has ${problem};`);
    expect(read('AGENTS.md')).toBe(text);
  });
});

describe('skills and .mcp.json', () => {
  const SKILL_DIRS = ['.agents/skills', '.claude/skills'];
  const NAMES = ['vibejs-add-resource', 'vibejs-cover-100', 'vibejs-dev-loop'];
  let files: AgentFiles;
  beforeEach(() => {
    // A CLI dist with the repo's skills.
    const dist = join(root, 'dist');
    cpSync(SKILLS, join(dist, 'skills'), { recursive: true });
    // A stray file next to the skill directories is ignored.
    writeFileSync(join(dist, 'skills/.DS_Store'), '');
    cpSync(join(FIXTURES, 'docs'), join(dist, 'docs'), { recursive: true });
    root = join(root, 'app');
    mkdirSync(root);
    files = projectAgentFiles(root, dist);
  });
  afterEach(() => {
    root = join(root, '..');
  });

  const skillFiles = SKILL_DIRS.flatMap((dir) => NAMES.map((name) => `${dir}/${name}/SKILL.md`));
  const MCP = { mcpServers: { vibejs: { command: 'npx', args: ['--no', 'vibejs', 'mcp'] } } };

  it('writes both skill copies byte for byte and .mcp.json, then skips them all', () => {
    expect(Object.keys(files.skills)).toEqual(NAMES);
    expect(syncAgentFiles(root, files, true)).toEqual(
      ['AGENTS.md', 'CLAUDE.md', ...skillFiles, '.mcp.json'].map((file) => ({
        file,
        op: 'create',
      })),
    );
    for (const file of skillFiles) {
      expect(read(file)).toBe(
        readFileSync(join(SKILLS, file.split('/').at(-2)!, 'SKILL.md'), 'utf8'),
      );
    }
    expect(read('.mcp.json')).toBe(`${JSON.stringify(MCP, null, 2)}\n`);
    expect(new Set(syncAgentFiles(root, files, true).map((o) => o.op))).toEqual(new Set(['skip']));
  });

  it('removes other vibejs-* entries, updates a changed skill and keeps foreign entries', () => {
    syncAgentFiles(root, files, true);
    for (const dir of SKILL_DIRS) {
      mkdirSync(join(root, dir, 'vibejs-old'));
      writeFileSync(join(root, dir, 'vibejs-old/SKILL.md'), 'old');
      mkdirSync(join(root, dir, 'my-skill'));
      writeFileSync(join(root, dir, 'my-skill/SKILL.md'), 'mine');
      writeFileSync(join(root, dir, 'notes.txt'), 'notes');
    }
    writeFileSync(join(root, '.claude/skills/vibejs-dev-loop/SKILL.md'), 'edited');
    const changed = syncAgentFiles(root, files, true).filter((o) => o.op !== 'skip');
    expect(changed).toEqual([
      { file: '.agents/skills/vibejs-old', op: 'delete' },
      { file: '.claude/skills/vibejs-dev-loop/SKILL.md', op: 'update' },
      { file: '.claude/skills/vibejs-old', op: 'delete' },
    ]);
    for (const dir of SKILL_DIRS) {
      expect(readdirSync(join(root, dir)).toSorted()).toEqual(['my-skill', 'notes.txt', ...NAMES]);
      expect(read(`${dir}/my-skill/SKILL.md`)).toBe('mine');
    }
    expect(read('.claude/skills/vibejs-dev-loop/SKILL.md')).toBe(files.skills['vibejs-dev-loop']);
  });

  it('only reports a stale skill and a changed .mcp.json without write', () => {
    syncAgentFiles(root, files, true);
    mkdirSync(join(root, '.agents/skills/vibejs-old'));
    const other = { mcpServers: { vibejs: { command: 'vibejs', args: ['mcp'] } } };
    writeFileSync(join(root, '.mcp.json'), JSON.stringify(other));
    expect(syncAgentFiles(root, files, false).filter((o) => o.op !== 'skip')).toEqual([
      { file: '.agents/skills/vibejs-old', op: 'delete' },
      { file: '.mcp.json', op: 'update' },
    ]);
    expect(existsSync(join(root, '.agents/skills/vibejs-old'))).toBe(true);
    expect(read('.mcp.json')).toBe(JSON.stringify(other));
  });

  it('sets mcpServers.vibejs and keeps the other keys in order', () => {
    const own = { mcpServers: { other: { command: 'other' } }, x: 1 };
    writeFileSync(join(root, '.mcp.json'), JSON.stringify(own));
    expect(syncAgentFiles(root, files, true).at(-1)).toEqual({ file: '.mcp.json', op: 'update' });
    const merged = { mcpServers: { other: { command: 'other' }, ...MCP.mcpServers }, x: 1 };
    expect(read('.mcp.json')).toBe(`${JSON.stringify(merged, null, 2)}\n`);
    writeFileSync(join(root, '.mcp.json'), '{ "y": 2 }');
    syncAgentFiles(root, files, true);
    expect(read('.mcp.json')).toBe(`${JSON.stringify({ y: 2, ...MCP }, null, 2)}\n`);
    // An equal entry is kept as written.
    writeFileSync(join(root, '.mcp.json'), JSON.stringify(MCP));
    expect(syncAgentFiles(root, files, true).at(-1)!.op).toBe('skip');
  });

  it.each([
    ['not valid JSON', '{ "mcpServers": '],
    ['not a JSON object', '[]'],
    ['not a JSON object', 'null'],
    ['a JSON object whose `mcpServers` is not an object', '{ "mcpServers": "vibejs" }'],
    ['a JSON object whose `mcpServers` is not an object', '{ "mcpServers": null }'],
  ])('throws VIBE8602 for .mcp.json %s and writes nothing (%s)', (problem, text) => {
    writeFileSync(join(root, '.mcp.json'), text);
    let error: unknown;
    try {
      syncAgentFiles(root, files, true);
    } catch (e) {
      error = e;
    }
    expect(isVibeError(error) && error.code).toBe('VIBE8602');
    expect(String(error)).toContain(`.mcp.json is ${problem};`);
    expect(readdirSync(root)).toEqual(['.mcp.json']);
    expect(read('.mcp.json')).toBe(text);
  });
});
