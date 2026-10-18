import { globSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { CATALOG, type CatalogEntry } from '../catalog.gen.ts';
import type { CommandDef } from '../command.ts';
import { vibeError } from '../errors.gen.ts';
import { envelopeError, type DocsHit, type DocsResult } from '../output.ts';
import { entryMarkdown, lookup } from './explain.ts';

export interface Page {
  /** Relative to the docs dir, `/`-separated, without `.md`. */
  path: string;
  title: string;
  markdown: string;
}

/** A page titled by its first `# ` heading, or by its path when it has none. */
const toPage = (path: string, markdown: string): Page => ({
  path,
  title: /^# (.+)$/m.exec(markdown)?.[1] ?? path,
  markdown,
});

/**
 * The corpus: catalog entries as `errors/VIBE####` pages, then every Markdown file in docsDir.
 * A file at the path of a catalog page is skipped: the bundled catalog is the source of truth.
 */
export function loadPages(docsDir: string, catalog: readonly CatalogEntry[] = CATALOG): Page[] {
  const entries = catalog.map((entry) => toPage(`errors/${entry.code}`, entryMarkdown(entry)));
  const paths = new Set(entries.map((page) => page.path));
  // A missing docsDir (before the docs build fills dist/docs) globs to nothing.
  const files = globSync('**/*.md', { cwd: docsDir })
    .toSorted()
    .map((file) => [file, file.slice(0, -3).replaceAll(sep, '/')] as const)
    .filter(([, path]) => !paths.has(path))
    .map(([file, path]) => toPage(path, readFileSync(join(docsDir, file), 'utf8')));
  return [...entries, ...files];
}

/**
 * Term scoring: each query word scores 5 when it is in the title, 3 in a heading and 1 in the
 * body. Ties sort by path. Returns the top `limit` hits and the number of pages that matched.
 */
// A linear scan per query: about 60 ms for 4 MB of Markdown, so no index is needed yet.
export function searchDocs(
  query: string,
  pages: readonly Page[],
  limit = 5,
): { hits: DocsHit[]; total: number } {
  // Lower-cased word terms; \w+ never needs escaping, and \b matches whole words only.
  const words = new Set(query.toLowerCase().match(/\w+/g));
  const terms = [...words].map((word) => new RegExp(`\\b${word}\\b`, 'i'));
  const weigh = (weight: number, text: string) => weight * terms.filter((t) => t.test(text)).length;
  const scored = [];
  for (const page of pages) {
    const headings: string[] = [];
    const body: string[] = [];
    for (const line of page.markdown.split('\n')) {
      if (line !== `# ${page.title}`) (/^#{1,6} /.test(line) ? headings : body).push(line);
    }
    const score = weigh(5, page.title) + weigh(3, headings.join('\n')) + weigh(1, body.join('\n'));
    if (score > 0) scored.push({ page, score, body });
  }
  scored.sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path));
  const hits = scored.slice(0, limit).map(({ page, score, body }) => ({
    path: page.path,
    title: page.title,
    score,
    excerpt: body.join(' ').replace(/\s+/g, ' ').trim().slice(0, 160),
  }));
  return { hits, total: scored.length };
}

export const docs: CommandDef<DocsResult> = {
  name: 'docs',
  summary: 'Look up a VIBE code, open a docs page by path, or search the bundled docs, offline.',
  usage: 'vibejs docs <query...>',
  examples: ['vibejs docs VIBE8003', 'vibejs docs errors/VIBE8004', 'vibejs docs "unknown option"'],
  options: {},
  positionals: [
    { name: 'query', required: true, variadic: true, example: 'vibejs docs "unknown option"' },
  ],
  async run({ positionals }, ctx) {
    const query = positionals.join(' ');
    const base = { ok: true, command: 'docs', version: ctx.version, query };
    if (/^VIBE\d{4}$/i.test(query)) {
      const entry = lookup(query);
      if (entry) return { ...base, mode: 'code', entry };
      const error = envelopeError(vibeError('VIBE8008', { code: query.toUpperCase() }));
      return { ...base, ok: false, mode: 'code', error };
    }
    const pages = loadPages(ctx.docsDir);
    // Only loaded pages match, so a path such as `../x` never reads outside docsDir.
    const page = pages.find((candidate) => candidate.path === query);
    if (page) return { ...base, mode: 'page', page };
    const { hits, total } = searchDocs(query, pages);
    const truncated = total > hits.length ? { shown: hits.length, total } : undefined;
    return { ...base, mode: 'search', hits, truncated };
  },
  human(r) {
    if (r.entry) return entryMarkdown(r.entry);
    if (r.page) return r.page.markdown;
    const hits = r.hits!;
    if (!hits.length) return `No docs match "${r.query}".`;
    const lines = hits.map((hit) => `${hit.path}  ${hit.title}\n  ${hit.excerpt}`);
    if (r.truncated) lines.push(`(${r.truncated.shown} of ${r.truncated.total} matches shown)`);
    return lines.join('\n');
  },
};
