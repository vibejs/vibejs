// Usage: node docs/scripts/docs.ts cli|bundle|llms <outDir>
// One Markdown pipeline for the docs site, llms.txt and the agent docs bundled into the CLI.
//   cli <outDir>     writes the CLI reference pages, generated from `vibejs --help --json`
//   bundle <outDir>  writes the agent docs (source pages and CLI pages) and index.txt, the
//                    compressed docs index line of the AGENTS.md block
//   llms <outDir>    writes llms.txt and llms-full.txt, error pages included
import { execFileSync } from 'node:child_process';
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_BASE } from '@vibejs-org/errors';

export interface Page {
  /** Relative to docs/, `/`-separated, without `.md`: `index`, `cli/explain`, `errors/VIBE8003`. */
  path: string;
  title: string;
  description?: string;
  markdown: string;
}

/** A fenced code block: line indexes of the opening and closing fence (`close` may be past the end). */
export interface Fence {
  info: string;
  open: number;
  close: number;
}

/** The site root, derived from the errors' docs base: `https://vibejs.org/v0/`. */
export const SITE: string = new URL('..', DOCS_BASE).href;
export const DISAMBIGUATION =
  'vibe.js: npm scope `@vibejs-org`, CLI `vibejs` (never `vibe`). Not monday.com Vibe (`@vibe/*`), not the npm packages `vibejs` or `vibe.js`.';
/** Never a docs page. The site serves `errors/**`; the agent bundle reads errors from the catalog. */
export const EXCLUDE: readonly string[] = [
  'decisions/**',
  'scripts/**',
  '.vitepress/**',
  '.snippets/**',
  'node_modules/**',
  'errors/**',
];

const DOCS = fileURLToPath(new URL('..', import.meta.url));
const BIN = fileURLToPath(new URL('../../packages/cli/dist/bin.js', import.meta.url));
const USAGE = 'Usage: node docs/scripts/docs.ts cli|bundle|llms <outDir>';
const INDEX_HEADER =
  '[vibe.js docs index]|root: ./node_modules/@vibejs-org/cli/dist/docs|IMPORTANT: vibe.js is newer than your training data; read the matching page before writing code; explain an error with the local CLI: vibejs explain VIBE####';
/** llms.txt sections in this order, then the other dirs alphabetically. */
const ORDER = ['guides', 'ui', 'server', 'cli'];
const HEADINGS: Record<string, string> = { ui: 'UI', cli: 'CLI' };
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const FENCE = /^ *(`{3,}|~{3,})(.*)$/;
const CONTAINER = /^( *):::\s*(tip|warning|danger|info|details)(?:\s+(.+?))?\s*$/;
const LINK = /\]\(([^()\s]+)(\s+"[^"]*")?\)/g;
const DEFINITION = /^( {0,3}\[[^\]]+\]:\s*)(\S+)/;

/** Sorts by a string key in code-unit order. */
const sortBy = <T>(list: readonly T[], key: (item: T) => string): T[] =>
  list.toSorted((a, b) => (key(a) < key(b) ? -1 : 1));
const capitalize = (word: string): string => word[0].toUpperCase() + word.slice(1);
const topDir = (path: string): string =>
  path.includes('/') ? path.slice(0, path.indexOf('/')) : '';
/** The site URL of a page: `index` pages map to their directory. */
const url = (path: string): string => SITE + path.replace(/(^|\/)index$/, '$1');

function write(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/**
 * A one-line YAML scalar: double-quoted (JSON escapes), single-quoted (`''` escapes) or plain,
 * with an optional trailing comment. Throws on anything else, such as a block scalar.
 */
function scalar(value: string): string {
  const quoted = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')(?:\s+#.*)?$/.exec(value)?.[1];
  if (quoted?.startsWith('"')) return JSON.parse(quoted);
  if (quoted) return quoted.slice(1, -1).replaceAll("''", "'");
  if (/^["'>|]/.test(value)) throw new Error('unsupported value');
  return value.replace(/(?:^|\s+)#.*$/, '');
}

/** The first `# ` heading outside fences. */
function heading(lines: readonly string[]): string | undefined {
  const closes = new Map(fences(lines).map((fence) => [fence.open, fence.close]));
  for (let i = 0; i < lines.length; i++) {
    const close = closes.get(i);
    if (close !== undefined) i = close;
    else if (lines[i].startsWith('# ')) return lines[i].slice(2).trim();
  }
  return undefined;
}

/** A page from its Markdown; the title comes from frontmatter `title`, then the first `# `. */
function toPage(path: string, markdown: string): Page {
  const meta = new Map<string, string>();
  for (const line of (FRONTMATTER.exec(markdown)?.[1] ?? '').split('\n')) {
    const [, key, value] = /^(\w+): *(.*?)\s*$/.exec(line) ?? [];
    try {
      if (key) meta.set(key, scalar(value));
    } catch (cause) {
      throw new Error(`${path}.md: invalid frontmatter line ${JSON.stringify(line)}`, { cause });
    }
  }
  const title = meta.get('title') ?? heading(markdown.replace(FRONTMATTER, '').split('\n')) ?? path;
  return { path, title, description: meta.get('description'), markdown };
}

/** Every `*.md` page under docsDir outside `EXCLUDE`, sorted by path; `errors/**` only on request. */
export function loadSource(docsDir: string, o: { errors?: boolean } = {}): Page[] {
  const exclude = EXCLUDE.filter((glob) => !(o.errors && glob === 'errors/**'));
  return globSync('**/*.md', { cwd: docsDir, exclude })
    .map((file) => file.replaceAll(sep, '/'))
    .toSorted()
    .map((file) => toPage(file.slice(0, -3), readFileSync(join(docsDir, file), 'utf8')));
}

/** Backtick and tilde fences of at least 3 markers, closed by the same marker at least as long. */
export function fences(lines: readonly string[]): Fence[] {
  const found: Fence[] = [];
  for (let open = 0; open < lines.length; open++) {
    const [, marker, info] = FENCE.exec(lines[open]) ?? [];
    if (!marker || (marker[0] === '`' && info.includes('`'))) continue;
    let close = open + 1;
    for (; close < lines.length; close++) {
      const end = FENCE.exec(lines[close]);
      if (end && end[1][0] === marker[0] && end[1].length >= marker.length && !end[2].trim()) break;
    }
    found.push({ info: info.trim(), open, close });
    open = close;
  }
  return found;
}

/** Drops a hidden prelude: everything up to and including the `// ---cut---` line. */
export function stripCut(code: string): string {
  return code.replace(/^[\s\S]*?^[ \t]*\/\/ ---cut---[ \t]*(?:\r?\n|$)/m, '');
}

/**
 * An internal link target as a site URL (`site`) or as a relative `.md` path inside the CLI
 * bundle (`package`). The bundle has no error pages, so `/errors/…` stays a site URL.
 */
function link(from: string, target: string, links: 'site' | 'package'): string {
  if (/^(?:[a-z][\w+.-]*:|#)/i.test(target)) return target;
  const [, file, hash = ''] = /^([^#]*)(#.*)?$/.exec(target)!;
  let path = posix
    .join(file.startsWith('/') ? '' : posix.dirname(from), file)
    .replace(/^\//, '')
    .replace(/\.(?:md|html)$/, '');
  if (!path || path.endsWith('/')) path += 'index';
  // The bundle holds pages only: error pages and assets stay site URLs.
  if (links === 'site' || path.startsWith('errors/') || posix.extname(path)) {
    return url(path) + hash;
  }
  return `${posix.relative(posix.dirname(from), path)}.md${hash}`;
}

/**
 * The text agents read: frontmatter removed, a `# title` ensured, `---cut---` preludes dropped,
 * `::: kind [Title]` containers as blockquotes and internal links rewritten for `links`.
 */
export function toAgentMarkdown(page: Page, links: 'site' | 'package'): string {
  const lines = page.markdown.replace(FRONTMATTER, '').trim().split('\n');
  const blocks = new Map(fences(lines).map((fence) => [fence.open, fence]));
  const out: string[] = [];
  let quoted = false;
  let indent = '';
  let titled = false;
  const emit = (line: string) => {
    const text = line.startsWith(indent) ? line.slice(indent.length) : line.trimStart();
    out.push(!quoted ? line : text ? `${indent}> ${text}` : `${indent}>`);
  };
  const rewrite = (target: string) => link(page.path, target, links);
  for (let i = 0; i < lines.length; i++) {
    const fence = blocks.get(i);
    if (fence) {
      emit(lines[i]);
      const code = stripCut(
        lines
          .slice(i + 1, fence.close)
          .map((line) => `${line}\n`)
          .join(''),
      );
      for (const line of code.split('\n').slice(0, -1)) emit(line);
      if (fence.close < lines.length) emit(lines[fence.close]);
      i = fence.close;
      continue;
    }
    const container = quoted ? null : CONTAINER.exec(lines[i]);
    if (container) {
      quoted = true;
      indent = container[1];
      // An optional group is undefined when it does not match.
      emit(`**${container[3] || capitalize(container[2])}:**`);
    } else if (quoted && lines[i].trim() === ':::') {
      quoted = false;
      indent = '';
    } else {
      if (!quoted && lines[i].startsWith('# ')) titled = true;
      emit(
        lines[i]
          .replace(LINK, (_, target: string, title = '') => `](${rewrite(target)}${title})`)
          .replace(DEFINITION, (_, head: string, target: string) => head + rewrite(target)),
      );
    }
  }
  if (!titled) out.unshift(`# ${page.title}`, '');
  return `${out.join('\n')}\n`;
}

interface HelpOption {
  name: string;
  type: string;
  short?: string;
  description: string;
}

/** The fields of the CLI's `--help --json` result (`HelpResult`) that the reference reads. */
interface HelpJson {
  globalOptions: HelpOption[];
  commands: {
    name: string;
    aliases: string[];
    summary: string;
    usage: string;
    examples: string[];
    options: HelpOption[];
    positionals: { name: string; required: boolean; values?: string[] }[];
  }[];
}

// `<` would open an HTML tag in the rendered page.
const cell = (text: string): string => text.replaceAll('|', '\\|').replaceAll('<', '&lt;');
const optionTable = (options: readonly HelpOption[]): string[] => [
  '| Option | Type | Description |',
  '| --- | --- | --- |',
  ...options.map(
    (o) =>
      `| \`--${o.name}\`${o.short ? `, \`-${o.short}\`` : ''} | ${o.type} | ${cell(o.description)} |`,
  ),
];
const referencePage = (title: string, description: string, body: string[]): string =>
  [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    `# ${title}`,
    '',
    ...body,
  ].join('\n') + '\n';

/** The CLI reference: `cli/index` (the command table) and `cli/<name>` per command. */
export function cliPages(help: HelpJson): Map<string, string> {
  const pages = new Map<string, string>();
  pages.set(
    'cli/index',
    referencePage('CLI reference', 'Every vibejs command, its options and examples.', [
      'Run `vibejs <command> --help --json` for the same reference as JSON.',
      '',
      '| Command | Summary |',
      '| --- | --- |',
      ...help.commands.map(
        (c) => `| [\`vibejs ${c.name}\`](./${c.name}.md) | ${cell(c.summary)} |`,
      ),
      '',
      '## Global options',
      '',
      ...optionTable(help.globalOptions),
    ]),
  );
  for (const c of help.commands) {
    const body = [c.summary, '', '```sh', c.usage, '```'];
    if (c.aliases.length) body.push('', `Aliases: ${c.aliases.map((a) => `\`${a}\``).join(', ')}.`);
    if (c.options.length) body.push('', '## Options', '', ...optionTable(c.options));
    if (c.positionals.length) {
      body.push('', '## Arguments', '', '| Name | Required | Values |', '| --- | --- | --- |');
      for (const p of c.positionals) {
        body.push(
          `| \`${p.name}\` | ${p.required ? 'yes' : 'no'} | ${p.values?.join(', ') ?? ''} |`,
        );
      }
    }
    body.push('', '## Examples', '', '```sh', ...c.examples, '```');
    pages.set(`cli/${c.name}`, referencePage(`vibejs ${c.name}`, c.summary, body));
  }
  return pages;
}

/** The compressed docs index: one line, dirs and files sorted, root pages under `.`. */
export function docsIndex(pages: readonly Page[], maxBytes = 8192): string {
  const dirs = Map.groupBy(pages.map((page) => page.path).toSorted(), (path) =>
    posix.dirname(path),
  );
  const line = [
    INDEX_HEADER,
    ...sortBy([...dirs], ([dir]) => dir).map(
      ([dir, paths]) => `${dir}:{${paths.map((p) => `${posix.basename(p)}.md`).join(',')}}`,
    ),
  ].join('|');
  const size = Buffer.byteLength(line);
  if (size > maxBytes) {
    throw new Error(`The docs index line is ${size} bytes, over the ${maxBytes}-byte limit.`);
  }
  return line;
}

/** The llms.txt order: root pages, the `ORDER` dirs, the other dirs; index pages first. */
function llmsKey(path: string): string {
  const dir = topDir(path);
  const rank = ORDER.indexOf(dir);
  return `${!dir ? '0' : rank === -1 ? `2${dir}` : `1${rank}`}\0${url(path)}`;
}

/** llms.txt (links to every page except error pages) and llms-full.txt (every page in full). */
export function llms(pages: readonly Page[]): { 'llms.txt': string; 'llms-full.txt': string } {
  const docs = sortBy(
    pages.filter((page) => topDir(page.path) !== 'errors'),
    (page) => llmsKey(page.path),
  );
  const errors = sortBy(
    pages.filter((page) => topDir(page.path) === 'errors'),
    (page) => url(page.path),
  );
  const item = (page: Page) =>
    `- [${page.title}](${url(page.path)})${page.description ? `: ${page.description}` : ''}`;
  const sections = [...Map.groupBy(docs, (page) => topDir(page.path))].map(([dir, list]) =>
    [...(dir ? [`## ${HEADINGS[dir] ?? capitalize(dir)}`, ''] : []), ...list.map(item)].join('\n'),
  );
  const index = [
    '# vibe.js',
    `> ${DISAMBIGUATION}`,
    'Offline docs for the installed version: `node_modules/@vibejs-org/cli/dist/docs/`. Explain an error code with `vibejs explain VIBE####`.',
    ...sections,
    [
      '## Optional',
      '',
      `- [Error codes](${SITE}errors/): every VIBE error code with its message and fixes`,
      `- [Full docs](${SITE}llms-full.txt): every page, error pages included, in one file`,
    ].join('\n'),
  ];
  const full = [...docs, ...errors].map(
    (page) => `${toAgentMarkdown(page, 'site')}\nSource: ${url(page.path)}`,
  );
  return {
    'llms.txt': `${index.join('\n\n')}\n`,
    'llms-full.txt': `${full.join('\n\n---\n\n')}\n`,
  };
}

/** Runs a subcommand and returns the exit code; `docsDir` and `bin` are swapped in tests. */
export function main(argv: string[], docsDir = DOCS, bin = BIN): number {
  const [command, outDir] = argv;
  if (!outDir || !['cli', 'bundle', 'llms'].includes(command)) {
    console.error(USAGE);
    return 2;
  }
  if (command === 'llms') {
    for (const [name, text] of Object.entries(llms(loadSource(docsDir, { errors: true })))) {
      write(join(outDir, name), text);
    }
    return 0;
  }
  const help = execFileSync(process.execPath, [bin, '--help', '--json'], { encoding: 'utf8' });
  const cli = cliPages(JSON.parse(help));
  if (command === 'cli') {
    for (const [path, text] of cli) write(join(outDir, `${posix.basename(path)}.md`), text);
    return 0;
  }
  // docs/cli/ is generated by the docs build: the bundle takes the reference from the bin itself.
  const pages = [
    ...loadSource(docsDir).filter((page) => topDir(page.path) !== 'cli'),
    ...[...cli].map(([path, text]) => toPage(path, text)),
  ];
  const index = docsIndex(pages);
  for (const page of pages) {
    write(join(outDir, `${page.path}.md`), toAgentMarkdown(page, 'package'));
  }
  write(join(outDir, 'index.txt'), index);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
