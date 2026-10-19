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
      index.startsWith('[vibe.js docs index]|root: ./node_modules/@vibejs-org/cli/dist/docs|'),
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
