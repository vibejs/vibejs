import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractSnippets, main, mapDiagnostics, type Snippet } from './check-snippets.ts';

const FIXTURE = fileURLToPath(new URL('fixtures/docs', import.meta.url));

describe('extractSnippets', () => {
  it.each<[string, string, (Pick<Snippet, 'mdLine' | 'code'> & Partial<Snippet>)[]]>([
    ['a ts fence', '# T\n\n```ts\nconst a = 1;\n```\n', [{ mdLine: 3, code: 'const a = 1;' }]],
    ['meta after ts', '```ts {2}\na;\nb;\n```', [{ mdLine: 1, code: 'a;\nb;' }]],
    ['highlighted lines without a space', '```ts{2}\na;\n```', [{ mdLine: 1, code: 'a;' }]],
    ['line numbers', '```ts:line-numbers {1}\na;\n```', [{ mdLine: 1, code: 'a;' }]],
    ['a tilde fence', '~~~ts\na;\n~~~', [{ mdLine: 1, code: 'a;' }]],
    [
      'a longer closing fence, not a shorter or other marker or an info string',
      '````ts\n```\n~~~~\n```` js\na;\n`````\nafter',
      [{ mdLine: 1, code: '```\n~~~~\n```` js\na;' }],
    ],
    ['an indented fence', '- item\n\n   ```ts\n   a;\n   ```\n', [{ mdLine: 3, code: '   a;' }]],
    ['an unclosed fence', '```ts\na;\n', [{ mdLine: 1, code: 'a;\n' }]],
    [
      'vibe fences, backtick and tilde, with meta',
      '```vibe\n<template />\n```\n~~~vibe {2}\n<script setup lang="ts"></script>\n<template />\n~~~',
      [
        { mdLine: 1, ext: 'vibe', code: '<template />' },
        { mdLine: 4, ext: 'vibe', code: '<script setup lang="ts"></script>\n<template />' },
      ],
    ],
    [
      'sh, bare, ts- and vibe-prefixed fences (ignored)',
      '```sh\nls\n```\n```\nx\n```\n```tsx\nx\n```\n```vibes\nx\n```',
      [],
    ],
    [
      'a backtick info string (not a fence)',
      '``` ts `x`\na;\n```ts\nb;\n```',
      [{ mdLine: 3, code: 'b;' }],
    ],
  ])('handles %s', (_, md, expected) => {
    expect(extractSnippets(md, 'guide.md')).toEqual(
      expected.map((snippet) => ({ file: 'guide.md', ext: 'ts', ...snippet })),
    );
  });

  it('names fences titled with a bare file name and skips titled ones on the tutorial', () => {
    const md =
      '```sh [a.sh]\nls\n```\n```ts [theme.ts]\na;\n```\n```vibe {1} [ItemList.vibe]\n<template />\n```';
    expect(extractSnippets(md, 'guides/tutorial.md')).toEqual([]);
    expect(extractSnippets(md, 'guide.md')).toEqual([
      { file: 'guide.md', mdLine: 4, ext: 'ts', code: 'a;', name: 'theme.ts' },
      { file: 'guide.md', mdLine: 7, ext: 'vibe', code: '<template />', name: 'ItemList.vibe' },
    ]);
  });

  it.each([
    [
      'a path',
      '```vibe [ui/src/App.vibe]\n<template />\n```',
      'guide.md:1: a [file]-titled vibe fence is checked only in guides/tutorial.md',
    ],
    [
      'another extension',
      '```ts [a.vibe]\na;\n```',
      'guide.md:1: a [file]-titled ts fence is checked only in guides/tutorial.md',
    ],
    [
      'a duplicate name',
      '```ts [a.ts]\na;\n```\n```ts [a.ts]\nb;\n```',
      'guide.md:4: duplicate snippet file a.ts',
    ],
  ])('throws on a title with %s outside the tutorial', (_, md, message) => {
    expect(() => extractSnippets(md, 'guide.md')).toThrow(message);
  });
});

describe('mapDiagnostics', () => {
  const snippets = new Map<string, Snippet>([
    ['0/1.ts', { file: 'a.md', mdLine: 10, ext: 'ts', code: '' }],
    ['3/theme.ts', { file: 'guides/b.md', mdLine: 3, ext: 'ts', code: '', name: 'theme.ts' }],
    ['0/1.vibe', { file: 'ui/c.md', mdLine: 20, ext: 'vibe', code: '' }],
  ]);

  it('maps snippet positions to page.md:line:col and passes other lines through', () => {
    const output = [
      ".snippets/3/theme.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "/docs/.snippets/0/1.ts(1,1): error TS2304: Cannot find name 'x'.",
      '  Continuation line.',
      '',
      ".snippets/0/7.ts(1,1): error TS2304: Cannot find name 'y'.",
      "C:\\docs\\.snippets\\0\\1.vibe(9,26): error TS2322: Type 'number' is not assignable to type 'string'.",
      "tsconfig.json(3,3): error TS5023: Unknown compiler option 'x'.",
    ].join('\n');
    expect(mapDiagnostics(output, snippets)).toEqual([
      "guides/b.md:5:7 TS2322 Type 'string' is not assignable to type 'number'.",
      "a.md:11:1 TS2304 Cannot find name 'x'.",
      '  Continuation line.',
      ".snippets/0/7.ts(1,1): error TS2304: Cannot find name 'y'.",
      "ui/c.md:29:26 TS2322 Type 'number' is not assignable to type 'string'.",
      "tsconfig.json(3,3): error TS5023: Unknown compiler option 'x'.",
    ]);
  });
});

describe('main', () => {
  let tmp: string;
  let docs: string;
  let out: string[];
  let errors: string[];

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'vibejs-snippets-'));
    docs = join(tmp, 'docs');
    cpSync(FIXTURE, docs, { recursive: true });
    out = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => out.push(line));
    vi.spyOn(console, 'error').mockImplementation((line: string) => errors.push(line));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /** A tsc stand-in that prints `text` and exits with `status`. */
  function fakeTsc(text: string, status: number): string {
    const file = join(tmp, `tsc-${status}.js`);
    writeFileSync(
      file,
      `process.stdout.write(${JSON.stringify(text)}); process.exit(${status});\n`,
    );
    return file;
  }

  it('writes the snippets of every page but error pages, and the tsconfig', () => {
    expect(main(docs, fakeTsc('', 0))).toBe(0);
    const dir = join(docs, '.snippets');
    expect(readdirSync(dir, { recursive: true, encoding: 'utf8' }).toSorted()).toEqual([
      '1',
      join('1', '0.ts'),
      join('1', '1.ts'),
      'package.json',
      'tsconfig.json',
      'vibe.d.ts',
    ]);
    const types = readFileSync(join(dir, 'vibe.d.ts'), 'utf8');
    expect(types).toContain("declare module '*.vibe'");
    expect(types).not.toContain("declare module '*.ts'");
    expect(readFileSync(join(dir, '1', '1.ts'), 'utf8')).toContain('// ---cut---\n');
    const tsconfig = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8'));
    expect(tsconfig).toMatchObject({
      extends: fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url)),
      compilerOptions: {
        composite: false,
        noEmit: true,
        customConditions: [],
        experimentalDecorators: true,
      },
      contentMappers: [{ package: '@vibejs-org/language-tools', extensions: ['.vibe'] }],
      include: ['**/*.ts', '**/*.vibe'],
    });
    expect(out).toEqual(['check-snippets: 2 snippets type-check']);
  });

  it('writes vibe fences as .vibe files and runs tsc with the content mapper', () => {
    writeFileSync(
      join(docs, 'ui.md'),
      '```vibe\n<template />\n```\n```ts [theme.ts]\nexport {};\n```\n',
    );
    const tsc = join(tmp, 'tsc-args.js');
    writeFileSync(tsc, 'process.stdout.write(process.argv.slice(2).join(" "));\n');
    expect(main(docs, tsc)).toBe(0);
    const dir = join(docs, '.snippets');
    expect(readdirSync(join(dir, '4')).toSorted()).toEqual(['0.vibe', 'theme.ts']);
    expect(readFileSync(join(dir, '4', '0.vibe'), 'utf8')).toBe('<template />\n');
    expect(errors).toEqual([`-p ${dir} --pretty false --runExternalCode`]);
    expect(out).toEqual(['check-snippets: 4 snippets type-check']);
  });

  it('prints mapped diagnostics and exits 1', () => {
    const tsc = fakeTsc(".snippets/1/1.ts(3,14): error TS2322: Type 'x'.\n", 2);
    expect(main(docs, tsc)).toBe(1);
    expect(errors).toEqual(["guides/start.md:24:14 TS2322 Type 'x'."]);
  });

  it('exits 0 without running tsc when no page has a ts fence', () => {
    const empty = join(tmp, 'empty');
    cpSync(join(FIXTURE, 'server'), join(empty, 'server'), { recursive: true });
    expect(main(empty, join(tmp, 'missing.js'))).toBe(0);
    expect(readdirSync(join(empty, '.snippets'))).toEqual([]);
    expect(out).toEqual(['check-snippets: no snippets']);
  });
});

describe('as a script', () => {
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('runs main on the given docs dir and sets the exit code', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'vibejs-snippets-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = ['node', fileURLToPath(new URL('check-snippets.ts', import.meta.url)), tmp];
    vi.resetModules();
    await import('./check-snippets.ts');
    expect(process.exitCode).toBe(0);
    rmSync(tmp, { recursive: true, force: true });
  });
});
