import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVibeError } from '@vibejs-org/errors';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BEGIN,
  END,
  execPrefix,
  projectBlock,
  renderBlock,
  syncAgentFiles,
  type AgentOp,
} from './agents.ts';
import { CATALOG } from './catalog.gen.ts';

const INDEX = '[vibe.js docs index]|root: ./docs|.:{index.md}';
const DOCS = fileURLToPath(new URL('../test/fixtures/docs', import.meta.url));

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

describe('renderBlock', () => {
  const block = renderBlock('pnpm exec vibejs', INDEX);
  const lines = block.split('\n');

  it('has at most 30 rule lines and one index line between the markers', () => {
    expect(lines[0]).toBe(BEGIN);
    expect(lines.at(-1)).toBe(END);
    const inner = lines.slice(1, -1);
    expect(inner.filter((line) => line === INDEX)).toHaveLength(1);
    expect(inner.length - 1).toBeLessThanOrEqual(30);
    expect(Buffer.byteLength(INDEX)).toBeLessThanOrEqual(8192);
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

it('builds the project block from the docs index and the package manager', () => {
  writeFileSync(join(root, 'pnpm-lock.yaml'), '');
  expect(projectBlock(root, DOCS)).toBe(
    renderBlock('pnpm exec vibejs', readFileSync(join(DOCS, 'index.txt'), 'utf8').trim()),
  );
});

describe('syncAgentFiles', () => {
  const block = renderBlock('npx --no vibejs', INDEX);
  const newer = renderBlock('npx --no vibejs', `${INDEX}|cli:{new.md}`);

  it('creates both files, then skips them', () => {
    expect(syncAgentFiles(root, block, true)).toEqual(ops('create', 'create'));
    expect(read('AGENTS.md')).toBe(`# AGENTS.md\n\n${block}\n\n## Project notes\n`);
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n');
    expect(syncAgentFiles(root, block, true)).toEqual(ops('skip', 'skip'));
  });

  it.each([
    ['LF', 'Before\n\n', '\n\nAfter\n'],
    ['CRLF', 'Before\r\n\r\n', '\r\n\r\nAfter\r\n'],
    ['no trailing newline', 'Before ', ' after'],
  ])('replaces only the text between the markers (%s)', (_, before, after) => {
    const nl = before.includes('\r\n') ? '\r\n' : '\n';
    writeFileSync(join(root, 'AGENTS.md'), `${before}${block.replaceAll('\n', nl)}${after}`);
    writeFileSync(join(root, 'CLAUDE.md'), '@AGENTS.md\n');
    expect(syncAgentFiles(root, newer, true)).toEqual(ops('update', 'skip'));
    expect(read('AGENTS.md')).toBe(`${before}${newer.replaceAll('\n', nl)}${after}`);
    expect(syncAgentFiles(root, newer, true)).toEqual(ops('skip', 'skip'));
  });

  it.each([
    ['# Notes\n', '# Notes\n\n'],
    ['# Notes', '# Notes\n\n'],
    ['# Notes\r\n', '# Notes\r\n\r\n'],
  ])('appends the block to an AGENTS.md without markers (%j)', (text, start) => {
    writeFileSync(join(root, 'AGENTS.md'), text);
    expect(syncAgentFiles(root, block, true)[0]).toEqual({ file: 'AGENTS.md', op: 'update' });
    const nl = text.includes('\r\n') ? '\r\n' : '\n';
    expect(read('AGENTS.md')).toBe(`${start}${block.replaceAll('\n', nl)}${nl}`);
    expect(syncAgentFiles(root, block, true)[0].op).toBe('skip');
  });

  it('prepends @AGENTS.md once to a CLAUDE.md without it', () => {
    const own = crlf('# Claude', '@AGENTS.md.bak', '');
    writeFileSync(join(root, 'CLAUDE.md'), own);
    expect(syncAgentFiles(root, block, true)[1]).toEqual({ file: 'CLAUDE.md', op: 'update' });
    expect(read('CLAUDE.md')).toBe(`@AGENTS.md\n${own}`);
    expect(syncAgentFiles(root, block, true)[1].op).toBe('skip');
    writeFileSync(join(root, 'CLAUDE.md'), crlf('# Claude', '@AGENTS.md', ''));
    expect(syncAgentFiles(root, block, true)[1].op).toBe('skip');
  });

  it('only reports without write', () => {
    writeFileSync(join(root, 'AGENTS.md'), `x\n${block}\n`);
    expect(syncAgentFiles(root, newer, false)).toEqual(ops('update', 'create'));
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
      syncAgentFiles(root, block, true);
    } catch (e) {
      error = e;
    }
    expect(isVibeError(error) && error.code).toBe('VIBE8601');
    expect(String(error)).toContain(`AGENTS.md has ${problem};`);
    expect(read('AGENTS.md')).toBe(text);
  });
});
