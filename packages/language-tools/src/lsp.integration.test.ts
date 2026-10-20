// The editor path: the pinned TypeScript 7.1 language server (`tsc --lsp --stdio`) runs the built
// content mapper over a temp copy of the typecheck corpus, and every request is answered at the
// exact UTF-16 position in the `.vibe` file.
import { execFileSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyCorpus } from '../test/corpus.ts';
import { at, INIT_OPTIONS, LSP_ARGS, startLsp, type Lsp } from '../test/lsp.ts';

interface Position {
  line: number;
  character: number;
}
interface Range {
  start: Position;
  end: Position;
}
interface Location {
  uri: string;
  range: Range;
}
interface Diagnostic {
  range: Range;
  severity: number;
  code: number;
  source: string;
}
interface CompletionItem {
  label: string;
  sortText: string;
  data?: { autoImport?: { moduleSpecifier: string } };
}

const { root, dispose } = copyCorpus();
afterAll(dispose);
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const uriOf = (file: string) => pathToFileURL(join(root, file)).href;
const ROOT_URI = `${pathToFileURL(root).href}/`;

/** `file:line:col-line:col`, 1-based, relative to the corpus root. */
function where({ uri, range: { start, end } }: Location): string {
  const file = uri.replace(ROOT_URI, '');
  return `${file}:${start.line + 1}:${start.character + 1}-${end.line + 1}:${end.character + 1}`;
}

/** The descendant processes of `pid`, as their command lines. */
function descendants(pid: number): string[] {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' })
    .split('\n')
    .map((row) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(row))
    .filter((match) => match !== null);
  const found: string[] = [];
  const parents = new Set([String(pid)]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [, child, parent, command] of rows) {
      if (parents.has(parent) && !parents.has(child)) {
        parents.add(child);
        found.push(command);
        grew = true;
      }
    }
  }
  return found;
}

/** The mapper's stdio entry, as the language-tools manifest execs it. */
const MAPPER = /dist[\\/]server\.js/;

/** Hover on a template binding, the codes pulled for a `_fail_` file, and whether the mapper ran. */
async function probe(runExternalCode: boolean) {
  const file = 'cases/lsp/Parent.vibe';
  const lsp = await startLsp(root, { runExternalCode });
  try {
    const hover = await lsp.request<{ contents: { value: string } } | null>('textDocument/hover', {
      textDocument: { uri: await lsp.open(join(root, file)) },
      position: at(read(file), '{{ picked }}', 3),
    });
    const report = await lsp.request<{ items: Diagnostic[] }>('textDocument/diagnostic', {
      textDocument: { uri: await lsp.open(join(root, 'cases/_fail_prop-type/App.vibe')) },
    });
    return {
      hover: hover?.contents.value ?? null,
      codes: report.items.map((d) => d.code),
      mapper: descendants(lsp.server.pid!).some((command) => MAPPER.test(command)),
    };
  } finally {
    await lsp.close();
  }
}

describe('fails closed', () => {
  it('answers no type, reports no error and never starts the mapper without runExternalCode', async () => {
    expect(await probe(false)).toEqual({ hover: null, codes: [], mapper: false });
  });

  it('types the same requests with runExternalCode', async () => {
    expect(await probe(true)).toEqual({
      hover: '```typescript\nconst picked: string\n```\n',
      codes: [2322],
      mapper: true,
    });
  });
});

/** The first 10 labels in the order an editor sorts them: by sortText, then label. */
function top(items: CompletionItem[]): string[] {
  const key = (item: CompletionItem) => `${item.sortText}\0${item.label}`;
  return items
    .toSorted((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
    .slice(0, 10)
    .map((item) => item.label);
}

describe('language features', () => {
  let lsp: Lsp;
  beforeAll(async () => {
    lsp = await startLsp(root);
  });
  afterAll(() => lsp.close());

  const PARENT = 'cases/lsp/Parent.vibe';
  const MAIN = 'cases/lsp/main.ts';
  /** `[name, file, needle, delta]`: the request goes to `needle` + `delta` in `file`. */
  type Case = [name: string, file: string, needle: string, delta: number];
  const request = async <T>(method: string, [, file, needle, delta]: Case, extra = {}) =>
    lsp.request<T>(`textDocument/${method}`, {
      textDocument: { uri: await lsp.open(join(root, file)) },
      position: at(read(file), needle, delta),
      ...extra,
    });

  // Each result is relativized to the corpus root and snapshotted.
  const hovers: Case[] = [
    ['a script binding in {{ }}', PARENT, '{{ picked }}', 3],
    ['a v-for item', PARENT, '{{ row.length', 3],
    ['@event on a component: the onX handler', PARENT, '@pick=', 1],
    ['a scoped-slot param', PARENT, '{ item }', 2],
  ];
  for (const c of hovers) {
    it(`hover: ${c[0]}`, async () => {
      const hover = await request<{ contents: { value: string } }>('hover', c);
      expect(hover.contents.value).toMatchSnapshot('markdown');
    });
  }

  const definitions: Case[] = [
    ['a template binding: its <script setup> declaration', PARENT, '{{ picked }}', 3],
    [':prop: the defineProps member', PARENT, ':label', 1],
    ['#slot: the defineSlots member', PARENT, '#row', 1],
    ['a self tag: the component itself', 'cases/self/Loop.vibe', '<Loop', 1],
    ['a component in .ts: its .vibe file', MAIN, 'Child,', 0],
    ['a .vibe module specifier: its file (#64828 passes on this pin)', MAIN, "'./Child.vibe'", 3],
  ];
  for (const c of definitions) {
    it(`definition: ${c[0]}`, async () => {
      const locations = await request<Location[]>('definition', c);
      expect(locations.map(where)).toMatchSnapshot('locations');
    });
  }

  const references: Case[] = [
    ['a script ref: its template uses', PARENT, 'const picked', 6],
    ['a component import: its tags and the .ts importer', PARENT, 'import Child', 7],
  ];
  for (const c of references) {
    it(`references: ${c[0]}`, async () => {
      const locations = await request<Location[]>('references', c, {
        context: { includeDeclaration: true },
      });
      expect(locations.map(where).toSorted()).toMatchSnapshot('locations');
    });
  }

  const completions: Case[] = [
    ['an attribute key on a component tag', PARENT, ':label', 1],
    ['a member access in a template expression', PARENT, 'item.toUpperCase', 5],
    ['a tag name', PARENT, '<Child', 1],
  ];
  for (const c of completions) {
    it(`completion: ${c[0]}`, async () => {
      const { items } = await request<{ items: CompletionItem[] }>('completion', c);
      expect(top(items)).toMatchSnapshot('top 10 labels');
    });
  }

  describe('rename', () => {
    const file = 'cases/lsp/Parent.vibe';
    const rename = (needle: string, delta: number) => {
      const position = at(read(file), needle, delta);
      const textDocument = { textDocument: { uri: uriOf(file) }, position };
      return Promise.all([
        lsp.request<{ range: Range } | null>('textDocument/prepareRename', textDocument).then(
          (result) => result,
          () => null,
        ),
        lsp.request<{ changes: Record<string, { range: Range }[]> } | null>('textDocument/rename', {
          ...textDocument,
          newName: 'chosen',
        }),
      ]);
    };

    beforeAll(() => lsp.open(join(root, file)));

    it('renames a script ref in the script only: template uses are not propagated (#63879)', async () => {
      const [prepared, edit] = await rename('const picked', 6);
      expect(prepared).not.toBeNull();
      const edits = Object.entries(edit!.changes).flatMap(([uri, list]) =>
        list.map(({ range }) => where({ uri, range })),
      );
      expect(edits).toEqual(['cases/lsp/Parent.vibe:4:7-4:13', 'cases/lsp/Parent.vibe:7:3-7:9']);
    });

    for (const [kind, needle] of [
      ['a component tag (BOUND)', '<Child'],
      ['a prop key (BOUND)', ':label'],
      ['an event name (ALIAS)', '@pick'],
    ] as const) {
      it(`refuses ${kind}`, async () => {
        expect(await rename(needle, 1)).toEqual([null, null]);
      });
    }
  });

  it.fails('completion: auto-imports an unimported export (known-upstream #64119)', async () => {
    const file = 'cases/lsp/Parent.vibe';
    const uri = await lsp.open(join(root, file));
    const source = read(file);
    const seeded = source.replace("const rows = ['a', 'b']", '$&\nconst check = expectTyp');
    await lsp.change(uri, seeded);
    try {
      const { items } = await lsp.request<{ items: CompletionItem[] }>('textDocument/completion', {
        textDocument: { uri },
        position: at(seeded, 'expectTyp', 'expectTyp'.length),
      });
      expect(items.find((item) => item.label === 'expectType')?.data?.autoImport).toMatchObject({
        moduleSpecifier: '../../expect.ts',
      });
    } finally {
      await lsp.change(uri, source);
    }
  });
});

/** `file(line,col): CODE`, 1-based, as the corpus snapshot prints it. */
function line(file: string, d: Diagnostic): string {
  const code = `${d.source === 'VIBE' ? 'VIBE' : 'TS'}${d.code}`;
  return `${file}(${d.range.start.line + 1},${d.range.start.character + 1}): ${code}`;
}

describe('diagnostics', () => {
  let lsp: Lsp;
  beforeAll(async () => {
    lsp = await startLsp(root);
  });
  afterAll(() => lsp.close());

  const opened = new Set<string>();
  const pull = async (file: string) => {
    const uri = uriOf(file);
    if (!opened.has(file)) {
      opened.add(file);
      await lsp.open(join(root, file));
    }
    const report = await lsp.request<{ items: Diagnostic[] }>('textDocument/diagnostic', {
      textDocument: { uri },
    });
    return report.items;
  };
  const corpus = readFileSync(
    fileURLToPath(new URL('__snapshots__/typecheck.corpus.txt', import.meta.url)),
    'utf8',
  )
    .split('\n')
    .map((l) => /^(\S+\(\d+,\d+\)): error (\w+):/.exec(l))
    .filter((match) => match !== null)
    .map(([, location, code]) => `${location}: ${code}`);
  const files = globSync('cases/*/*.vibe', { cwd: root })
    .map((file) => file.replaceAll('\\', '/'))
    .toSorted();

  it('reports the CLI diagnostics of every _fail_ .vibe file at the same positions, and none elsewhere', async () => {
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    const codes = new Set<number>();
    for (const file of files) {
      const items = await pull(file);
      for (const d of items) codes.add(d.code);
      // The server reports unused declarations (TS6133), errors in the CLI, as warnings.
      const errors = items.filter((d) => d.severity <= 2).map((d) => line(file, d));
      const cli = corpus.filter((l) => l.startsWith(`${file}(`));
      // The CLI hides semantic errors in a project with a mapper diagnostic; the editor does not.
      const project = file.slice(0, file.lastIndexOf('/') + 1);
      const hidden = corpus.some((l) => l.startsWith(project) && / VIBE60\d\d$/.test(l));
      actual[file] = (hidden ? errors.filter((e) => cli.includes(e)) : errors).toSorted();
      expected[file] = cli.toSorted();
    }
    expect(actual).toEqual(expected);
    expect(codes).not.toContain(18080);
  });

  it('suppresses the errors that @vibe-expect-error expects', async () => {
    expect(await pull('cases/expect-error/App.vibe')).toEqual([]);
  });

  it('reports VIBE6010 at each unused directive comment', async () => {
    const file = 'cases/_fail_expect-error-unused/App.vibe';
    const source = read(file);
    const directive = '<!-- @vibe-expect-error -->';
    const ranges = [...source.matchAll(new RegExp(directive, 'g'))].map(({ index }) => ({
      start: at(source, '', index),
      end: at(source, '', index + directive.length),
    }));
    const vibe = (await pull(file)).filter((d) => d.source === 'VIBE');
    expect(vibe.map((d) => [d.code, d.range])).toEqual(ranges.map((range) => [6010, range]));
  });

  it('re-checks an edited template: a seeded error appears at its range and goes on revert', async () => {
    const file = 'cases/lsp/Parent.vibe';
    const source = read(file);
    const uri = uriOf(file);
    expect(await pull(file)).toEqual([]);
    const seeded = source.replace('{{ row.length }}', '{{ row.toFixed() }}');
    await lsp.change(uri, seeded);
    const start = at(seeded, 'toFixed');
    expect(await pull(file)).toEqual([
      expect.objectContaining({
        code: 2551,
        range: { start, end: { ...start, character: start.character + 'toFixed'.length } },
      }),
    ]);
    await lsp.change(uri, source);
    expect(await pull(file)).toEqual([]);
  });
});

it('documents the Neovim setup that this suite runs', () => {
  const guide = readFileSync(
    fileURLToPath(new URL('../../../docs/guides/editors.md', import.meta.url)),
    'utf8',
  );
  const lua = /```lua\n([\s\S]*?)```/.exec(guide)![1];
  const cmd = [.../cmd = \{([^}]*)\}/.exec(lua)![1].matchAll(/'([^']*)'/g)].map(([, s]) => s);
  const init = Object.fromEntries(
    [.../init_options = \{([^}]*)\}/.exec(lua)![1].matchAll(/(\w+) = (\w+)/g)].map(
      ([, key, value]) => [key, JSON.parse(value)],
    ),
  );
  expect(cmd.slice(-LSP_ARGS.length)).toEqual(LSP_ARGS);
  expect(init).toEqual(INIT_OPTIONS);
});
