import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CatalogEntry } from '../catalog.gen.ts';
import type { Ctx } from '../ctx.ts';
import type { DocsResult } from '../output.ts';
import { docs, loadPages, searchDocs, type Page } from './docs.ts';

let root: string;
let docsDir: string;

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'vibejs-docs-'));
  docsDir = join(root, 'docs');
  write(docsDir, 'server/di.md', '# Dependency injection\n\nProviders and `inject()`.\n');
  write(docsDir, 'guide/no-title.md', 'Just prose about providers.\n');
  // Outside docsDir: never a page, never searched.
  write(root, 'secret.md', '# Secret\n\nproviders\n');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const ctx = (dir = docsDir): Ctx => ({
  version: '1.2.3',
  agent: { active: true },
  docsDir: dir,
  out: vi.fn<Ctx['out']>(),
  err: vi.fn<Ctx['err']>(),
});
const run = (query: string, dir?: string) =>
  docs.run({ values: {}, positionals: query.split(' ') }, ctx(dir));

const entry: CatalogEntry = {
  code: 'VIBE0001',
  package: 'errors',
  title: 'Test entry',
  message: 'A message.',
  fixes: ['A fix.'],
  body: 'Body.',
  docs: 'https://vibejs.org/v0/errors/VIBE0001',
  retired: false,
};

describe('loadPages', () => {
  it('lists catalog entries as errors/ pages, then the docs files sorted by path', () => {
    const pages = loadPages(docsDir, [entry]);
    expect(pages.map(({ path, title }) => [path, title])).toEqual([
      ['errors/VIBE0001', 'VIBE0001: Test entry'],
      ['guide/no-title', 'guide/no-title'],
      ['server/di', 'Dependency injection'],
    ]);
    expect(pages[0].markdown).toContain('> A message.');
  });

  it('falls back to the catalog when docsDir does not exist', () => {
    expect(loadPages(join(root, 'missing'), [entry]).map((p) => p.path)).toEqual([
      'errors/VIBE0001',
    ]);
  });
});

const page = (path: string, markdown: string): Page => ({
  path,
  title: /^# (.+)$/m.exec(markdown)?.[1] ?? path,
  markdown,
});

describe('searchDocs', () => {
  it('scores each query word once per field: title 5, heading 3, body 1', () => {
    const pages = [
      page('all', '# Alpha\n\n## Alpha beta\n\nalpha'),
      page('title', '# Alpha\n\nnothing'),
      page('heading', '# T\n\n## Alpha\n'),
      page('body', '# T\n\nalpha and ALPHA, beta'),
    ];
    const { hits } = searchDocs('alpha Alpha beta', pages);
    expect(hits.map(({ path, score }) => [path, score])).toEqual([
      ['all', 5 + 3 + 1 + 3],
      ['title', 5],
      ['heading', 3],
      ['body', 2],
    ]);
  });

  it('breaks ties by path, limits the hits and counts every match', () => {
    const pages = ['c', 'a', 'b'].map((p) => page(p, `# T\n\nword ${'x'.repeat(200)}`));
    const { hits, total } = searchDocs('word', pages, 2);
    expect(hits.map((hit) => hit.path)).toEqual(['a', 'b']);
    expect(total).toBe(3);
    expect(hits[0].excerpt).toHaveLength(160);
  });

  it('finds nothing for a query without words', () => {
    expect(searchDocs('?!', [page('a', '# A\n\ntext')])).toEqual({ hits: [], total: 0 });
  });

  it('finds the expected page first in under 300 ms on 500 pages of 8 KB', async () => {
    const corpus = join(root, 'corpus');
    const filler = 'the request context of a module outside the provider list ';
    for (let i = 0; i < 500; i++) {
      const body = filler.repeat(Math.ceil(8192 / filler.length)).slice(0, 8192);
      write(corpus, `generated/page-${String(i).padStart(3, '0')}.md`, `# Page ${i}\n\n${body}\n`);
    }
    write(
      corpus,
      'server/inject-context.md',
      '# Calling inject() outside an injection context\n\n## Why inject needs a context\n\nCall inject in a field initializer.\n',
    );
    const start = performance.now();
    const r = await run('inject outside context', corpus);
    const elapsed = performance.now() - start;
    expect(r.hits![0].path).toBe('server/inject-context');
    expect(r.hits).toHaveLength(5);
    expect(r.truncated).toEqual({ shown: 5, total: 501 });
    expect(elapsed).toBeLessThan(300);
  });
});

describe('docs command', () => {
  it('resolves a VIBE code in any case to its catalog entry', async () => {
    const r = await run('vibe8003');
    expect(r).toMatchObject({ ok: true, query: 'vibe8003', mode: 'code' });
    expect(r.entry?.code).toBe('VIBE8003');
  });

  it('returns VIBE8008 for an unknown code', async () => {
    expect(await run('VIBE0000')).toMatchObject({
      ok: false,
      mode: 'code',
      error: { code: 'VIBE8008' },
    });
  });

  it('resolves a page path inside docsDir', async () => {
    expect(await run('server/di')).toEqual({
      ok: true,
      command: 'docs',
      version: '1.2.3',
      query: 'server/di',
      mode: 'page',
      page: {
        path: 'server/di',
        title: 'Dependency injection',
        markdown: '# Dependency injection\n\nProviders and `inject()`.\n',
      },
    });
  });

  it('never reads a page outside docsDir', async () => {
    for (const query of ['../secret', '../docs/../secret', join(root, 'secret')]) {
      const r = await run(query);
      expect(r.mode).toBe('search');
      expect(r.hits!.map((hit) => hit.path).filter((path) => path.includes('secret'))).toEqual([]);
    }
  });

  it('searches the catalog and the docs files', async () => {
    const r = await run('providers');
    expect(r.mode).toBe('search');
    expect(r.hits!.map((hit) => hit.path)).toEqual(['guide/no-title', 'server/di']);
    expect(r.truncated).toBeUndefined();
  });

  it('answers zero hits with ok: true', async () => {
    expect(await run('zzzz')).toMatchObject({ ok: true, mode: 'search', hits: [] });
  });

  it('searches only the catalog when docsDir is missing', async () => {
    const r = await run('unknown option', join(root, 'missing'));
    expect(r.hits!.map((hit) => hit.path)).toContain('errors/VIBE8004');
    expect(r.hits!.every((hit) => hit.path.startsWith('errors/'))).toBe(true);
  });

  describe('human output', () => {
    const base = { ok: true, command: 'docs', version: '1.2.3', query: 'q' } as const;
    const hit = { path: 'a/b', title: 'B', score: 1, excerpt: 'Text.' };

    it.each<[string, DocsResult, string]>([
      ['a code', { ...base, mode: 'code', entry }, '# VIBE0001: Test entry'],
      [
        'a page',
        { ...base, mode: 'page', page: { path: 'p', title: 'P', markdown: '# P' } },
        '# P',
      ],
      ['hits', { ...base, mode: 'search', hits: [hit] }, 'a/b  B\n  Text.'],
      [
        'truncated hits',
        { ...base, mode: 'search', hits: [hit], truncated: { shown: 1, total: 9 } },
        'a/b  B\n  Text.\n(1 of 9 matches shown)',
      ],
      ['no hits', { ...base, mode: 'search', hits: [] }, 'No docs match "q".'],
    ])('renders %s', (_, r, text) => {
      expect(docs.human(r).startsWith(text)).toBe(true);
    });
  });
});
