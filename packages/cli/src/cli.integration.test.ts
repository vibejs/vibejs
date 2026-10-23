import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { join, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from '../package.json' with { type: 'json' };
import { loadPages, searchDocs } from './commands/docs.ts';
import { COMMANDS } from './main.ts';
import type { DocsResult } from './output.ts';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));

// Preloaded with --import: any fetch or TCP connection throws.
const OFFLINE = `data:text/javascript,${encodeURIComponent(`
import net from 'node:net';
const offline = () => { throw new Error('network disabled by the offline preload'); };
globalThis.fetch = offline;
net.Socket.prototype.connect = offline;
`)}`;

function vibejs(...args: string[]) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    ['--import', OFFLINE, BIN, ...args],
    { encoding: 'utf8', env: { ...process.env, VIBEJS_AGENT: '1' } },
  );
  return { status, stdout, stderr };
}

function single(stdout: string): unknown {
  expect(stdout.endsWith('\n')).toBe(true);
  expect(stdout.slice(0, -1)).not.toContain('\n');
  expect(stdout).not.toContain('\u001b[');
  return JSON.parse(stdout);
}

it('the offline preload blocks the network', () => {
  const { status, stderr } = spawnSync(
    process.execPath,
    ['--import', OFFLINE, '-e', "require('node:net').connect(80, '127.0.0.1')"],
    { encoding: 'utf8' },
  );
  expect(status).toBe(1);
  expect(stderr).toContain('network disabled by the offline preload');
});

it('answers explain without a code with one VIBE8003 object and exit 2', () => {
  const { status, stdout, stderr } = vibejs('explain');
  expect(status).toBe(2);
  expect(stderr).toBe('');
  expect(single(stdout)).toMatchObject({
    ok: false,
    command: 'explain',
    error: { code: 'VIBE8003', missing: [{ name: 'code', example: 'vibejs explain VIBE8003' }] },
  });
});

it('answers g and generate without input with the same VIBE8003 object listing the kinds', () => {
  const g = vibejs('g');
  expect(g.status).toBe(2);
  expect(g.stderr).toBe('');
  expect(single(g.stdout)).toMatchObject({
    ok: false,
    command: 'generate',
    error: {
      code: 'VIBE8003',
      missing: [{ name: 'kind', values: ['resource', 'component', 'page'] }],
    },
  });
  expect(vibejs('generate')).toEqual(g);
  const help = single(vibejs('g', '--help', '--json').stdout);
  expect(help).toMatchObject({
    commands: [
      {
        name: 'generate',
        aliases: ['g'],
        positionals: [
          { name: 'kind', required: true, values: ['resource', 'component', 'page'] },
          { name: 'name', required: true },
        ],
      },
    ],
  });
  expect(vibejs('generate', '--help', '--json').stdout).toBe(
    vibejs('g', '--help', '--json').stdout,
  );
});

it('explains a code offline from the bundled catalog', () => {
  const { status, stdout, stderr } = vibejs('explain', 'VIBE8003');
  expect(status).toBe(0);
  expect(stderr).toBe('');
  expect(single(stdout)).toMatchObject({
    ok: true,
    command: 'explain',
    version: manifest.version,
    entry: { code: 'VIBE8003', title: 'Missing required input' },
  });
});

it('exits 1 with VIBE8008 for an unknown code', () => {
  const { status, stdout } = vibejs('explain', 'VIBE0000');
  expect(status).toBe(1);
  expect(single(stdout)).toMatchObject({ ok: false, error: { code: 'VIBE8008' } });
});

it('prints the package version', () => {
  const { status, stdout } = vibejs('--version');
  expect(status).toBe(0);
  expect(single(stdout)).toEqual({ ok: true, command: 'version', version: manifest.version });
});

describe('bundled docs', () => {
  const DOCS = fileURLToPath(new URL('../dist/docs', import.meta.url));
  const files = globSync('**/*', { cwd: DOCS }).map((file) => file.replaceAll(sep, '/'));

  it('holds one reference page per command and no errors/ entry', () => {
    const reference = files.filter((file) => file.startsWith('cli/')).toSorted();
    const names = COMMANDS.map((command) => `cli/${command.name}.md`);
    expect(reference).toEqual(['cli/index.md', ...names].toSorted());
    expect(files.filter((file) => file === 'errors' || file.startsWith('errors/'))).toEqual([]);
  });

  it('writes an index line of at most 8192 bytes naming exactly the bundled pages', () => {
    const index = readFileSync(join(DOCS, 'index.txt'), 'utf8');
    expect(Buffer.byteLength(index)).toBeLessThanOrEqual(8192);
    expect(index).not.toContain('\n');
    expect(
      index.startsWith('[vibe.js docs index]|root: ./node_modules/@usevibejs/cli/dist/docs|'),
    ).toBe(true);
    const named = index
      .split('|')
      .slice(3)
      .flatMap((group) => {
        const [, dir, names] = /^(.+?):\{(.*)\}$/.exec(group)!;
        return names.split(',').map((name) => posix.join(dir, name));
      });
    expect(named.every((file) => existsSync(join(DOCS, file)))).toBe(true);
    expect(named.toSorted()).toEqual(files.filter((file) => file.endsWith('.md')).toSorted());
  });

  it('holds the guides with the code they include from the examples', () => {
    for (const guide of ['getting-started', 'tutorial', 'ai-agents', 'extending']) {
      expect(files).toContain(`guides/${guide}.md`);
    }
    const flags = readFileSync(
      fileURLToPath(new URL('../../../examples/todo-flags/ui/flags.ts', import.meta.url)),
      'utf8',
    );
    const region = /\/\/ #region composable\n([\s\S]*?)\/\/ #endregion composable/.exec(flags)![1];
    expect(readFileSync(join(DOCS, 'guides/extending.md'), 'utf8')).toContain(region);
    const pages = files.filter((file) => file.endsWith('.md'));
    expect(pages.filter((file) => /^<<< /m.test(readFileSync(join(DOCS, file), 'utf8')))).toEqual(
      [],
    );
  });

  it('answers a catalog title with its error page exactly once', () => {
    const { status, stdout } = vibejs('docs', '--json', 'Missing required input');
    expect(status).toBe(0);
    single(stdout);
    const { hits }: DocsResult = JSON.parse(stdout);
    expect(hits!.filter((hit) => hit.path === 'errors/VIBE8003')).toHaveLength(1);
    const paths = loadPages(DOCS).map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('searches the real corpus in under 300 ms', () => {
    const pages = loadPages(DOCS);
    const times = [0, 1, 2].map(() => {
      const start = performance.now();
      searchDocs('inject outside context', pages);
      return performance.now() - start;
    });
    expect(Math.min(...times)).toBeLessThan(300);
  });
});

describe('agent files', () => {
  const AGENTS = fileURLToPath(new URL('../dist/agents', import.meta.url));
  const block = readFileSync(join(AGENTS, 'AGENTS.md'), 'utf8').replaceAll(
    '{{exec}}',
    'pnpm exec vibejs',
  );

  it('writes the template AGENTS.md and CLAUDE.md with the bundled docs index', () => {
    const index = readFileSync(fileURLToPath(new URL('../dist/docs/index.txt', import.meta.url)));
    expect(block).toContain(`\n${String(index).trim()}\n`);
    expect(readFileSync(join(AGENTS, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
  });

  it('ships the skills in both skill directories and .mcp.json', () => {
    for (const name of ['vibejs-add-resource', 'vibejs-cover-100', 'vibejs-dev-loop']) {
      const skill = readFileSync(new URL(`../../../skills/${name}/SKILL.md`, import.meta.url));
      for (const dir of ['.agents/skills', '.claude/skills']) {
        expect(readFileSync(join(AGENTS, dir, name, 'SKILL.md'))).toEqual(skill);
      }
    }
    expect(JSON.parse(readFileSync(join(AGENTS, '.mcp.json'), 'utf8'))).toEqual({
      mcpServers: { vibejs: { command: '{{exec}}', args: ['mcp'] } },
    });
  });

  it('names only commands that the built bin describes, in the block and the skills', () => {
    const skills = ['vibejs-add-resource', 'vibejs-cover-100', 'vibejs-dev-loop'].map((name) =>
      readFileSync(join(AGENTS, '.agents/skills', name, 'SKILL.md'), 'utf8'),
    );
    const text = [block, ...skills].join('\n');
    const names = new Set([...text.matchAll(/\bvibejs ([a-z]+)\b/g)].map((m) => m[1]));
    expect([...names].toSorted()).toEqual([
      'agents',
      'check',
      'components',
      'dev',
      'di',
      'errors',
      'explain',
      'g',
      'logs',
      'mcp',
      'request',
      'routes',
    ]);
    for (const name of names) {
      const { status, stdout } = vibejs(name, '--help', '--json');
      const command = COMMANDS.find((c) => c.name === name || c.aliases?.includes(name))!;
      expect(single(stdout)).toMatchObject({ ok: true, commands: [{ name: command.name }] });
      expect(status).toBe(0);
    }
  });
});
