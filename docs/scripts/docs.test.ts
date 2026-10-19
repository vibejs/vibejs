import {
  cpSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@vibejs-org/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import help from './fixtures/help.json' with { type: 'json' };
import {
  cliPages,
  DISAMBIGUATION,
  docsIndex,
  EXCLUDE,
  expandIncludes,
  fences,
  llms,
  loadSource,
  main,
  sidebar,
  SITE,
  stripCut,
  toAgentMarkdown,
  type Page,
} from './docs.ts';

const FIXTURE = fileURLToPath(new URL('fixtures/docs', import.meta.url));

let tmp: string;
let errors: string[];

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'vibejs-docs-'));
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((line: string) => errors.push(line));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const page = (path: string, markdown: string, title = path): Page => ({ path, title, markdown });
/** Every file under dir, `/`-separated and sorted. */
const files = (dir: string): string[] =>
  globSync('**/*', { cwd: dir, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(dir.length + 1)
        .replaceAll(sep, '/'),
    )
    .toSorted();

describe('constants', () => {
  it('derives the site from the errors docs base', () => {
    expect(SITE).toBe('https://vibejs.org/v0/');
  });

  it('puts the disambiguation sentence verbatim on the landing page', () => {
    const landing = readFileSync(fileURLToPath(new URL('../index.md', import.meta.url)), 'utf8');
    expect(landing).toContain(DISAMBIGUATION);
  });
});

describe('loadSource', () => {
  it('loads every page outside EXCLUDE, titled by frontmatter, then `# `, then path', () => {
    expect(EXCLUDE).toContain('errors/**');
    expect(
      loadSource(FIXTURE).map(({ path, title, description }) => [path, title, description]),
    ).toEqual([
      ['guides/no-title', 'guides/no-title', undefined],
      ['guides/start', 'Getting: started', 'Start here.'],
      ['index', 'Fixture home', 'The fixture landing page.'],
      ['server/handlers', 'Handlers', undefined],
      ['zeta/notes', 'Notes', undefined],
    ]);
  });

  it('includes errors/** only on request, reading JSON-quoted frontmatter', () => {
    const pages = loadSource(FIXTURE, { errors: true });
    expect(pages.map((p) => p.path).filter((path) => path.startsWith('errors/'))).toEqual([
      'errors/VIBE0001',
      'errors/index',
    ]);
    expect(pages.find((p) => p.path === 'errors/VIBE0001')?.title).toBe('Fixture error');
  });

  it('reads a numeric frontmatter order', () => {
    writeFileSync(join(tmp, 'a.md'), '---\norder: 2 # second\n---\n');
    writeFileSync(join(tmp, 'b.md'), '# B\n');
    expect(loadSource(tmp).map((p) => p.order)).toEqual([2, undefined]);
  });

  it('throws on a non-numeric frontmatter order, naming the page', () => {
    writeFileSync(join(tmp, 'a.md'), '---\norder: first\n---\n');
    expect(() => loadSource(tmp)).toThrow('a.md: frontmatter order must be a number, not first');
  });

  it('unescapes single-quoted frontmatter', () => {
    writeFileSync(join(tmp, 'q.md'), "---\ntitle: 'It''s here'\n- not a key\n---\n");
    expect(loadSource(tmp)[0].title).toBe("It's here");
  });

  it('drops trailing frontmatter comments', () => {
    const yaml = 'title: "Say \\"hi\\"" # c\ndescription: plain # c\nx: # c';
    writeFileSync(join(tmp, 'c.md'), `---\n${yaml}\n---\n`);
    expect(loadSource(tmp)[0]).toMatchObject({ title: 'Say "hi"', description: 'plain' });
  });

  it.each([
    ['a block scalar', 'description: >\n  Folded text.', 'description: >'],
    ['an unclosed quote', "title: 'open", "title: 'open"],
    ['an escape JSON lacks', 'title: "\\x41"', 'title: \\"\\\\x41\\"'],
  ])('throws on %s, naming the file and line', (_, yaml, line) => {
    mkdirSync(join(tmp, 'guides'));
    writeFileSync(join(tmp, 'guides/bad.md'), `---\n${yaml}\n---\n`);
    expect(() => loadSource(tmp)).toThrow(`guides/bad.md: invalid frontmatter line "${line}"`);
  });

  it('takes the fallback title from the first `# ` line outside fences', () => {
    const fenced = 'Install:\n\n```sh\n# install it\npnpm add x\n```\n';
    writeFileSync(join(tmp, 'a.md'), fenced);
    writeFileSync(join(tmp, 'b.md'), `${fenced}\n# Real\n`);
    expect(loadSource(tmp).map((p) => p.title)).toEqual(['a', 'Real']);
    expect(toAgentMarkdown(loadSource(tmp)[0], 'package')).toMatch(/^# a\n/);
  });
});

describe('expandIncludes', () => {
  beforeEach(() => {
    mkdirSync(join(tmp, 'src'));
    writeFileSync(
      join(tmp, 'src/flags.ts'),
      [
        'const a = 1;',
        '// #region outer',
        'const b = 2;',
        '  // #region inner',
        'const c = 3;',
        '  // #endregion inner',
        '// #endregion outer',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(tmp, 'src/App.vibe'),
      '<template>\n  <!-- #region body -->\n  <p>Hi</p>\n  <!-- #endregion body -->\n</template>\n',
    );
    writeFileSync(join(tmp, 'src/ticks.md'), 'Use:\n\n```sh\nls\n```\n');
  });

  it.each([
    [
      'a whole file',
      '<<< @/src/flags.ts',
      '```ts\nconst a = 1;\n// #region outer\nconst b = 2;\n  // #region inner\nconst c = 3;\n  // #endregion inner\n// #endregion outer\n```',
    ],
    [
      'a // region, without nested markers',
      '<<< @/src/flags.ts#outer',
      '```ts\nconst b = 2;\nconst c = 3;\n```',
    ],
    ['a nested region', '<<< @/src/flags.ts#inner', '```ts\nconst c = 3;\n```'],
    ['an HTML comment region, dedented', '<<< @/src/App.vibe#body', '```vibe\n<p>Hi</p>\n```'],
    ['a {lang} override', '<<< @/src/App.vibe#body{html}', '```html\n<p>Hi</p>\n```'],
    [
      'a file with fences, in a longer fence',
      '<<< @/src/ticks.md',
      '````md\nUse:\n\n```sh\nls\n```\n````',
    ],
  ])('includes %s', (_, line, expected) => {
    expect(expandIncludes(`Before\n${line}\nAfter`, tmp, 'p.md')).toBe(
      `Before\n${expected}\nAfter`,
    );
  });

  it('resolves @ against docsDir, also to files outside it', () => {
    mkdirSync(join(tmp, 'docs'));
    expect(expandIncludes('<<< @/../src/App.vibe#body', join(tmp, 'docs'), 'p.md')).toBe(
      '```vibe\n<p>Hi</p>\n```',
    );
  });

  it('dedents a region by its least indented non-blank line', () => {
    writeFileSync(join(tmp, 'src/i.ts'), '// #region r\n    a;\n\n  b;\n// #endregion r\n');
    expect(expandIncludes('<<< @/src/i.ts#r', tmp, 'p.md')).toBe('```ts\n  a;\n\nb;\n```');
  });

  it('leaves <<< lines inside fences as they are', () => {
    const md = '````md\n<<< @/src/nope.ts\n````\n~~~\n<<< @/src/nope.ts\n~~~';
    expect(expandIncludes(md, tmp, 'p.md')).toBe(md);
  });

  it('leaves other lines, and <<< lines in other forms, as they are', () => {
    const md = '<<< ./src/flags.ts\n  <<< @/src/flags.ts\ntext <<< @/src/flags.ts';
    expect(expandIncludes(md, tmp, 'p.md')).toBe(md);
  });

  it.each([
    ['a missing file', '<<< @/src/nope.ts', 'guides/p.md: no file src/nope.ts to include'],
    [
      'a missing region',
      '<<< @/src/flags.ts#nope',
      'guides/p.md: no region nope in src/flags.ts to include',
    ],
    [
      'a region without its end',
      '<<< @/src/flags.ts#open',
      'guides/p.md: no region open in src/flags.ts to include',
    ],
  ])('throws on %s, naming the page and the path', (_, line, message) => {
    writeFileSync(join(tmp, 'src/flags.ts'), '// #region open\nx;\n');
    expect(() => expandIncludes(line, tmp, 'guides/p.md')).toThrow(message);
  });
});

describe('sidebar', () => {
  const pages = [
    'index',
    'errors/VIBE0001',
    'zeta/notes',
    'cli/index',
    'cli/check',
    'guides/tutorial',
    'guides/getting-started',
    'guides/ai-agents',
    'guides/extending',
    'guides/coming-from-x',
    'server/modules',
    'server/index',
  ].map((path, i): Page => ({
    path,
    title: `Title ${i}`,
    markdown: '',
    order: {
      'guides/getting-started': 1,
      'guides/tutorial': 2,
      'guides/ai-agents': 1,
      'server/modules': 1,
    }[path],
  }));

  it('groups the pages in the fixed order, by order and then path, without error, landing or other pages', () => {
    expect(sidebar(pages)).toMatchSnapshot();
  });

  it('leaves out empty groups', () => {
    expect(sidebar(pages.filter((p) => p.path.startsWith('server/'))).map((g) => g.text)).toEqual([
      'Server',
    ]);
    expect(sidebar([])).toEqual([]);
  });
});

describe('stripCut', () => {
  it.each([
    ['no cut line', 'const a = 1;\nconst b = 2;\n', 'const a = 1;\nconst b = 2;\n'],
    ['a prelude', "import x from 'x';\n// ---cut---\nx();\n", 'x();\n'],
    ['an indented cut line', 'a\n  // ---cut---\n  b\n', '  b\n'],
    ['a cut line at the end', 'setup();\n// ---cut---', ''],
    ['only the first cut', 'a\n// ---cut---\nb\n// ---cut---\nc\n', 'b\n// ---cut---\nc\n'],
  ])('handles %s', (_, code, expected) => {
    expect(stripCut(code)).toBe(expected);
  });
});

describe('toAgentMarkdown', () => {
  it.each<[string, string, string, 'site' | 'package', string]>([
    [
      'removes frontmatter and adds the title',
      'guides/a',
      '---\ntitle: A\n---\n\nText.\n',
      'site',
      '# A\n\nText.\n',
    ],
    [
      'keeps an existing title',
      'a',
      '---\ntitle: X\n---\n\n# Kept\n\nText.',
      'site',
      '# Kept\n\nText.\n',
    ],
    [
      'turns every container kind into a blockquote with its label',
      'a',
      '# A\n\n::: tip\nT.\n:::\n\n::: warning\nW.\n:::\n\n::: danger\nD.\n:::\n\n::: info\nI.\n\nMore.\n:::\n\n::: details Show me\nS.\n:::\n',
      'site',
      '# A\n\n> **Tip:**\n> T.\n\n> **Warning:**\n> W.\n\n> **Danger:**\n> D.\n\n> **Info:**\n> I.\n>\n> More.\n\n> **Show me:**\n> S.\n',
    ],
    [
      'keeps nested container lines, stray closers and other kinds as text',
      'a',
      '# A\n\n::: tip\n::: info\n# Not a title\n:::\n:::\n::: code-group\n',
      'site',
      '# A\n\n> **Tip:**\n> ::: info\n> # Not a title\n:::\n::: code-group\n',
    ],
    [
      'adds the title when the only `# ` line is quoted',
      'a',
      '::: tip\n# Inside\n:::\n',
      'site',
      '# A\n\n> **Tip:**\n> # Inside\n',
    ],
    [
      'drops cut preludes, keeps fences without one, ignores links and titles in code',
      'a',
      "```ts\nimport x from 'x';\n// ---cut---\nx();\n```\n\n~~~sh\n# [x](/y)\n~~~\n\n```ts\n```\n",
      'site',
      '# A\n\n```ts\nx();\n```\n\n~~~sh\n# [x](/y)\n~~~\n\n```ts\n```\n',
    ],
    [
      'quotes a fence inside a container and keeps an unclosed fence',
      'a',
      '# A\n\n::: tip\n```ts\n// ---cut---\nx;\n```\n:::\n\n```ts\nopen',
      'site',
      '# A\n\n> **Tip:**\n> ```ts\n> x;\n> ```\n\n```ts\nopen\n',
    ],
    [
      'quotes an indented or unspaced container, keeping the indent',
      'a',
      '# A\n\n- item\n\n  ::: tip\n  Indented.\n\n Less.\n  :::\n\n:::warning  Careful\nW.\n:::\n',
      'site',
      '# A\n\n- item\n\n  > **Tip:**\n  > Indented.\n  >\n  > Less.\n\n> **Careful:**\n> W.\n',
    ],
    [
      'rewrites links with a title, reference definitions and assets',
      'guides/a',
      '# A\n\nSee [x](/server/x "T"), ![d](./d.png) and [ref].\n\n[ref]: /server/y\n',
      'package',
      '# A\n\nSee [x](../server/x.md "T"), ![d](https://vibejs.org/v0/guides/d.png) and [ref].\n\n[ref]: ../server/y.md\n',
    ],
    [
      'makes internal links absolute in site mode',
      'guides/a',
      '# A\n\n[r](/server/b) [m](./c.md#h) [u](../ui/d.html) [i](/cli/) [h](/) [e](/errors/VIBE0001) [x](https://example.com/a) [s](#s)',
      'site',
      '# A\n\n[r](https://vibejs.org/v0/server/b) [m](https://vibejs.org/v0/guides/c#h) [u](https://vibejs.org/v0/ui/d) [i](https://vibejs.org/v0/cli/) [h](https://vibejs.org/v0/) [e](https://vibejs.org/v0/errors/VIBE0001) [x](https://example.com/a) [s](#s)\n',
    ],
    [
      'makes internal links relative .md files in package mode, except error pages',
      'guides/a',
      '# A\n\n[r](/server/b) [m](./c.md#h) [i](/cli/) [h](/) [e](/errors/VIBE0001) [ei](../errors/) [x](https://example.com/a) [s](#s)',
      'package',
      '# A\n\n[r](../server/b.md) [m](c.md#h) [i](../cli/index.md) [h](../index.md) [e](https://vibejs.org/v0/errors/VIBE0001) [ei](https://vibejs.org/v0/errors/) [x](https://example.com/a) [s](#s)\n',
    ],
  ])('%s', (_, path, markdown, links, expected) => {
    expect(toAgentMarkdown(page(path, markdown, 'A'), links)).toBe(expected);
  });

  it('renders the fixture guide in both modes', () => {
    const start = loadSource(FIXTURE).find((p) => p.path === 'guides/start')!;
    const site = toAgentMarkdown(start, 'site');
    expect(site).toMatchSnapshot();
    expect(site).not.toContain('---cut---');
    expect(site).not.toContain("from '@vibejs-org/errors'");
    expect(toAgentMarkdown(start, 'package')).toContain(
      '[the handlers](../server/handlers.md#ctx)',
    );
  });
});

describe('cliPages', () => {
  it('writes cli/index and one page per command of the recorded help', () => {
    const pages = cliPages(help);
    expect([...pages.keys()]).toEqual([
      'cli/index',
      ...help.commands.map((command) => `cli/${command.name}`),
    ]);
    expect(Object.fromEntries(pages)).toMatchSnapshot();
  });

  it('lists aliases, positional values and escapes table cells', () => {
    const pages = cliPages({
      globalOptions: [],
      commands: [
        {
          name: 'generate',
          aliases: ['g'],
          summary: 'Generate a | b.',
          usage: 'vibejs generate <kind>',
          examples: ['vibejs g page home'],
          options: [
            { name: 'dry-run', type: 'boolean', short: 'n', description: 'Plan only, in <n>s.' },
          ],
          positionals: [
            { name: 'kind', required: true, values: ['page', 'component'] },
            { name: 'name', required: false },
          ],
        },
      ],
    });
    expect(pages.get('cli/index')).toContain(
      '| [`vibejs generate`](./generate.md) | Generate a \\| b. |',
    );
    const generate = pages.get('cli/generate')!;
    expect(generate).toContain('Aliases: `g`.');
    expect(generate).toContain('| `--dry-run`, `-n` | boolean | Plan only, in &lt;n>s. |');
    expect(generate).toContain('| `kind` | yes | page, component |\n| `name` | no |  |');
  });
});

describe('docsIndex', () => {
  const header =
    '[vibe.js docs index]|root: ./node_modules/@vibejs-org/cli/dist/docs|IMPORTANT: vibe.js is newer than your training data; read the matching page before writing code; explain an error with the local CLI: vibejs explain VIBE####|';

  it('lists every page once on one line, dirs and files sorted, root pages under .', () => {
    const paths = ['ui/b', 'index', 'cli/index', 'ui/a', 'guides/deep/x', 'about'];
    const line = docsIndex(paths.map((path) => page(path, '')));
    expect(line).toBe(
      `${header}.:{about.md,index.md}|cli:{index.md}|guides/deep:{x.md}|ui:{a.md,b.md}`,
    );
    expect(line).not.toContain('\n');
  });

  it('throws above maxBytes, by default 8192', () => {
    // One root page whose name brings the line to exactly 8192 bytes, then to 8193.
    const size = 8192 - Buffer.byteLength(`${header}.:{.md}`);
    expect(Buffer.byteLength(docsIndex([page('p'.repeat(size), '')]))).toBe(8192);
    expect(() => docsIndex([page('p'.repeat(size + 1), '')])).toThrow(
      'The docs index line is 8193 bytes, over the 8192-byte limit.',
    );
    expect(() => docsIndex([page('a', '')], 10)).toThrow('over the 10-byte limit');
  });
});

describe('llms', () => {
  const pages = loadSource(FIXTURE, { errors: true });
  const result = llms(pages);

  it('returns exactly llms.txt and llms-full.txt', () => {
    expect(Object.keys(result)).toEqual(['llms.txt', 'llms-full.txt']);
  });

  it('writes llms.txt: title, disambiguation, every non-error page once, no error codes', () => {
    const text = result['llms.txt'];
    expect(text.startsWith(`# vibe.js\n\n> ${DISAMBIGUATION}\n`)).toBe(true);
    for (const { path } of pages.filter((p) => !p.path.startsWith('errors/'))) {
      const url = SITE + path.replace(/(^|\/)index$/, '$1');
      expect(text.split(`](${url})`)).toHaveLength(2);
    }
    expect(text).not.toMatch(/VIBE\d{4}/);
    expect(text).toContain(`(${SITE}llms-full.txt)`);
    expect(text).toMatchSnapshot();
  });

  it('writes llms-full.txt: every page once, error pages last', () => {
    const text = result['llms-full.txt'];
    const sources = text.match(/^Source: .+$/gm);
    expect(sources).toEqual([
      'Source: https://vibejs.org/v0/',
      'Source: https://vibejs.org/v0/guides/no-title',
      'Source: https://vibejs.org/v0/guides/start',
      'Source: https://vibejs.org/v0/server/handlers',
      'Source: https://vibejs.org/v0/zeta/notes',
      'Source: https://vibejs.org/v0/errors/',
      'Source: https://vibejs.org/v0/errors/VIBE0001',
    ]);
    expect(text).toMatchSnapshot();
  });

  it('orders sections guides, ui, server, cli, then the rest, root pages first', () => {
    const list = ['zeta/a', 'cli/a', 'server/a', 'alpha/a', 'ui/a', 'guides/a', 'about'];
    const text = llms(list.map((path) => page(path, `# ${path}`)))['llms.txt'];
    const headings = text.match(/^## .+$/gm);
    expect(headings).toEqual([
      '## Guides',
      '## UI',
      '## Server',
      '## CLI',
      '## Alpha',
      '## Zeta',
      '## Optional',
    ]);
    expect(text.indexOf('[about]')).toBeLessThan(text.indexOf('## Guides'));
  });
});

describe('main', () => {
  let bin: string;
  beforeEach(() => {
    bin = join(tmp, 'bin.js');
    writeFileSync(bin, `process.stdout.write(${JSON.stringify(JSON.stringify(help))});\n`);
  });

  it.each([[[]], [['cli']], [['nope', 'out']]])('prints the usage and exits 2 for %j', (argv) => {
    expect(main(argv, FIXTURE, bin)).toBe(2);
    expect(errors).toEqual(['Usage: node docs/scripts/docs.ts cli|bundle|llms <outDir>']);
  });

  it('llms writes llms.txt and llms-full.txt', () => {
    expect(main(['llms', tmp], FIXTURE, bin)).toBe(0);
    expect(readFileSync(join(tmp, 'llms.txt'), 'utf8')).toBe(
      llms(loadSource(FIXTURE, { errors: true }))['llms.txt'],
    );
    expect(existsSync(join(tmp, 'llms-full.txt'))).toBe(true);
  });

  it('cli writes the reference pages from --help --json', () => {
    const out = join(tmp, 'cli');
    expect(main(['cli', out], FIXTURE, bin)).toBe(0);
    expect(files(out)).toEqual(['check.md', 'docs.md', 'explain.md', 'index.md']);
    expect(readFileSync(join(out, 'explain.md'), 'utf8')).toBe(cliPages(help).get('cli/explain'));
  });

  it('bundle and llms show the included code', () => {
    const docs = join(tmp, 'docs');
    cpSync(FIXTURE, docs, { recursive: true });
    writeFileSync(join(docs, 'part.ts'), 'export const included = 1;\n');
    writeFileSync(join(docs, 'zeta/notes.md'), '# Notes\n\n<<< @/part.ts\n');
    expect(main(['bundle', join(tmp, 'bundle')], docs, bin)).toBe(0);
    expect(main(['llms', join(tmp, 'llms')], docs, bin)).toBe(0);
    const code = '```ts\nexport const included = 1;\n```';
    expect(readFileSync(join(tmp, 'bundle/zeta/notes.md'), 'utf8')).toContain(code);
    expect(readFileSync(join(tmp, 'llms/llms-full.txt'), 'utf8')).toContain(code);
  });

  it('bundle writes the agent pages, the CLI pages and index.txt, never errors/', () => {
    const docs = join(tmp, 'docs');
    cpSync(FIXTURE, docs, { recursive: true });
    // Stale generated reference pages: the bundle writes the reference from --help --json only.
    mkdirSync(join(docs, 'cli'));
    writeFileSync(join(docs, 'cli/index.md'), '# Stale\n');
    writeFileSync(join(docs, 'cli/removed.md'), '# Removed\n');
    const out = join(tmp, 'out');
    expect(main(['bundle', out], docs, bin)).toBe(0);
    expect(files(out)).toEqual([
      'cli/check.md',
      'cli/docs.md',
      'cli/explain.md',
      'cli/index.md',
      'guides/no-title.md',
      'guides/start.md',
      'index.md',
      'index.txt',
      'server/handlers.md',
      'zeta/notes.md',
    ]);
    expect(readFileSync(join(out, 'cli/index.md'), 'utf8')).toBe(
      toAgentMarkdown(
        { path: 'cli/index', title: '', markdown: cliPages(help).get('cli/index')! },
        'package',
      ),
    );
    expect(readFileSync(join(out, 'index.txt'), 'utf8')).toMatch(
      /\|\.:\{index\.md\}\|cli:\{check\.md,docs\.md,explain\.md,index\.md\}\|guides:/,
    );
  });
});

describe('as a script', () => {
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
    process.exitCode = undefined;
  });

  it('runs main with the process arguments and sets the exit code', async () => {
    process.argv = ['node', fileURLToPath(new URL('docs.ts', import.meta.url)), 'nope'];
    vi.resetModules();
    await import('./docs.ts');
    expect(process.exitCode).toBe(2);
  });
});

/** The VitePress anchors of a page's headings. */
const anchors = (markdown: string): string[] =>
  [...markdown.matchAll(/^#+ (.+)$/gm)].map(([, text]) =>
    text
      .toLowerCase()
      .replaceAll(/[^\w\s-]/g, '')
      .trim()
      .replaceAll(/\s+/g, '-'),
  );
const links = (text: string): string[] =>
  [...text.matchAll(/\]\(([^)]+)\)/g)].map(([, target]) => target);

describe('guides and UI docs', () => {
  const docs = loadSource(fileURLToPath(new URL('..', import.meta.url)));
  const codes = new Set(
    globSync('packages/*/messages/*.md', { cwd: fileURLToPath(new URL('../..', import.meta.url)) })
      .flatMap((file) => [
        ...readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8').matchAll(
          /^## (VIBE\d{4}):/gm,
        ),
      ])
      .map(([, code]) => code),
  );
  const markdownOf = (path: string): string => docs.find((p) => p.path === path)?.markdown ?? '';
  /** Why `target`, linked from a guide, is not an existing catalog code or docs section. */
  const broken = (target: string): string | undefined => {
    const code = /^\/errors\/(VIBE\d{4})$/.exec(target)?.[1];
    if (code) return codes.has(code) ? undefined : 'unknown code';
    const [file, hash] = target.split('#');
    const linked = docs.find((p) => `../${p.path}.md` === file);
    if (!linked) return 'no page';
    return !hash || anchors(linked.markdown).includes(hash) ? undefined : 'no section';
  };
  /**
   * The problems of the idiom table of a `coming-from-*` guide, whose header row starts with
   * `source`: every row names a backticked vibe.js form and links only existing targets, and with
   * `codes`, at least one catalog code.
   */
  const idioms = (path: string, source: string, o: { codes: boolean }) => {
    const rows = markdownOf(path)
      .split('\n')
      .filter((line) => line.startsWith('| '))
      .map((line) =>
        line
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim()),
      )
      .filter(([idiom]) => idiom !== source && !idiom.startsWith('---'));
    const problems = rows.flatMap(([idiom, form, caught]) => {
      const targets = links(caught);
      return [
        ...(/`[^`]+`/.test(form) ? [] : [`${idiom}: no vibe.js form`]),
        ...(targets.length ? [] : [`${idiom}: no link`]),
        ...(o.codes && !targets.some((t) => t.startsWith('/errors/')) ? [`${idiom}: no code`] : []),
        ...targets.flatMap((target) => {
          const why = broken(target);
          return why ? [`${idiom}: ${target}: ${why}`] : [];
        }),
      ];
    });
    return { rows: rows.length, problems };
  };

  it('serves the TS1241 link of vibejs check as a page with the TS1241 section', () => {
    // The link that `vibejs check` adds to TS1241 on @Handle (packages/cli check.ts).
    const target = new URL('https://vibejs.org/v0/server/handlers');
    const handlers = docs.find((p) => SITE + p.path === target.href);
    expect(anchors(handlers?.markdown ?? '')).toContain('ts1241-on-handle');
  });

  it('names the vibe.js form and links an existing code or section on every NestJS row', () => {
    const { rows, problems } = idioms('guides/coming-from-nestjs', 'NestJS', { codes: false });
    expect(rows).toBeGreaterThanOrEqual(10);
    expect(problems).toEqual([]);
  });

  it('names the vibe.js form and links an existing catalog code on every Vue idiom row', () => {
    const { rows, problems } = idioms('guides/coming-from-vue', 'Vue', { codes: true });
    expect(rows).toBeGreaterThanOrEqual(25);
    expect(problems).toEqual([]);
  });

  it('links an existing UI section from every Vue behavior difference', () => {
    const section = /^## Same API, different behavior\n([\s\S]*?)^## /m.exec(
      markdownOf('guides/coming-from-vue'),
    )?.[1];
    const bullets = (section ?? '').split('\n').filter((line) => line.startsWith('- '));
    expect(bullets.length).toBeGreaterThanOrEqual(7);
    const problems = bullets.flatMap((bullet) => {
      const targets = links(bullet).filter((t) => t.startsWith('../ui/') && t.includes('#'));
      if (!targets.length) return [`no UI section: ${bullet}`];
      return targets.flatMap((t) => (broken(t) ? [`${t}: ${broken(t)}`] : []));
    });
    expect(problems).toEqual([]);
  });

  it('compiles every vibe fence of the UI pages and the extending guide without diagnostics', () => {
    const pages = docs.filter((p) => p.path.startsWith('ui/') || p.path === 'guides/extending');
    expect(pages.map((p) => p.path)).toEqual(
      expect.arrayContaining(['ui/index', 'ui/components', 'guides/extending']),
    );
    const blocks = pages.flatMap((p) => {
      const lines = p.markdown.split('\n');
      return fences(lines)
        .filter((fence) => fence.info === 'vibe')
        .map((fence) => ({
          at: `${p.path}.md:${fence.open + 1}`,
          source: lines.slice(fence.open + 1, fence.close).join('\n'),
        }));
    });
    expect(blocks.length).toBeGreaterThan(10);
    const problems = blocks.flatMap(({ at, source }) =>
      compile(source, { filename: 'Example.vibe', id: '00000000', dev: false }).diagnostics.map(
        (d) => `${at} ${d.code}`,
      ),
    );
    expect(problems).toEqual([]);
  });
});
