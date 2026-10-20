import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractSnippets, main, mapDiagnostics, type Snippet } from './check-snippets.ts';

const FIXTURE = fileURLToPath(new URL('fixtures/docs', import.meta.url));

describe('extractSnippets', () => {
  it.each<[string, string, Pick<Snippet, 'mdLine' | 'code'>[]]>([
    ['a ts fence', '# T\n\n```ts\nconst a = 1;\n```\n', [{ mdLine: 3, code: 'const a = 1;' }]],
    ['meta after ts', '```ts {2}\na;\nb;\n```', [{ mdLine: 1, code: 'a;\nb;' }]],
    ['highlighted lines without a space', '```ts{2}\na;\n```', [{ mdLine: 1, code: 'a;' }]],
    ['line numbers', '```ts:line-numbers {1}\na;\n```', [{ mdLine: 1, code: 'a;' }]],
    ['a title', '```ts [a.ts]\na;\n```', [{ mdLine: 1, code: 'a;' }]],
    ['a tilde fence', '~~~ts\na;\n~~~', [{ mdLine: 1, code: 'a;' }]],
    [
      'a longer closing fence, not a shorter or other marker or an info string',
      '````ts\n```\n~~~~\n```` js\na;\n`````\nafter',
      [{ mdLine: 1, code: '```\n~~~~\n```` js\na;' }],
    ],
    ['an indented fence', '- item\n\n   ```ts\n   a;\n   ```\n', [{ mdLine: 3, code: '   a;' }]],
    ['an unclosed fence', '```ts\na;\n', [{ mdLine: 1, code: 'a;\n' }]],
    [
      'vibe, sh, bare and ts-prefixed fences (ignored)',
      '```vibe\n<template />\n```\n```sh\nls\n```\n```\nx\n```\n```tsx\nx\n```',
      [],
    ],
    [
      'a backtick info string (not a fence)',
      '``` ts `x`\na;\n```ts\nb;\n```',
      [{ mdLine: 3, code: 'b;' }],
    ],
  ])('handles %s', (_, md, expected) => {
    expect(extractSnippets(md, 'guide.md')).toEqual(
      expected.map((snippet) => ({ file: 'guide.md', ...snippet })),
    );
  });
});

describe('mapDiagnostics', () => {
  const snippets: Snippet[] = [
    { file: 'a.md', mdLine: 10, code: '' },
    { file: 'guides/b.md', mdLine: 3, code: '' },
  ];

  it('maps snippet positions to page.md:line:col and passes other lines through', () => {
    const output = [
      ".snippets/1.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "C:\\docs\\.snippets\\0.ts(1,1): error TS2304: Cannot find name 'x'.",
      '  Continuation line.',
      '',
      ".snippets/7.ts(1,1): error TS2304: Cannot find name 'y'.",
      "tsconfig.json(3,3): error TS5023: Unknown compiler option 'x'.",
    ].join('\n');
    expect(mapDiagnostics(output, snippets)).toEqual([
      "guides/b.md:5:7 TS2322 Type 'string' is not assignable to type 'number'.",
      "a.md:11:1 TS2304 Cannot find name 'x'.",
      '  Continuation line.',
      ".snippets/7.ts(1,1): error TS2304: Cannot find name 'y'.",
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
    expect(readdirSync(dir).toSorted()).toEqual([
      '0.ts',
      '1.ts',
      'package.json',
      'tsconfig.json',
      'vibe.d.ts',
    ]);
    expect(readFileSync(join(dir, 'vibe.d.ts'), 'utf8')).toContain("declare module '*.vibe'");
    expect(readFileSync(join(dir, '1.ts'), 'utf8')).toContain('// ---cut---\n');
    const tsconfig = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8'));
    expect(tsconfig).toMatchObject({
      extends: fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url)),
      compilerOptions: {
        composite: false,
        noEmit: true,
        customConditions: [],
        experimentalDecorators: true,
      },
      include: ['*.ts'],
    });
    expect(out).toEqual(['check-snippets: 2 ts snippets type-check']);
  });

  it('prints mapped diagnostics and exits 1', () => {
    const tsc = fakeTsc(".snippets/1.ts(3,14): error TS2322: Type 'x'.\n", 2);
    expect(main(docs, tsc)).toBe(1);
    expect(errors).toEqual(["guides/start.md:24:14 TS2322 Type 'x'."]);
  });

  it('exits 0 without running tsc when no page has a ts fence', () => {
    const empty = join(tmp, 'empty');
    cpSync(join(FIXTURE, 'server'), join(empty, 'server'), { recursive: true });
    expect(main(empty, join(tmp, 'missing.js'))).toBe(0);
    expect(readdirSync(join(empty, '.snippets'))).toEqual([]);
    expect(out).toEqual(['check-snippets: no ts snippets']);
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
