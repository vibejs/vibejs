// Usage: node docs/scripts/check-snippets.ts <docsDir>
// Type-checks every inline ```ts and ```vibe fence of the docs pages (error pages excluded) with
// the real tsc and the .vibe content mapper, and prints each diagnostic as
// `page.md:line:col TSnnnn message`. Exits 1 on any diagnostic. Hidden setup above `// ---cut---`
// is checked too; intentional errors use `// @ts-expect-error`. A fence titled with a bare file
// name (```ts [theme.ts]) is written under that name, so a relative import of it from another
// fence of the page is checked against its real code. A fence titled with a file path
// (```vibe [ui/src/App.vibe]) is a file of an app: only the tutorial has them, and the tutorial
// test checks them in a real app.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fences, loadSource } from './docs.ts';

export interface Snippet {
  /** The docs-relative `.md` file. */
  file: string;
  /** The 1-based line of the opening fence. */
  mdLine: number;
  ext: 'ts' | 'vibe';
  code: string;
  /** The file name of a fence titled with a bare file name, e.g. `[theme.ts]`. */
  name?: string;
}

// The docs' TypeScript (catalog:ts-next); its exports map hides the bin.
const TSC = createRequire(import.meta.url)
  .resolve('typescript/package.json')
  .replace(/package\.json$/, 'bin/tsc');
const BASE = fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url));
/**
 * Types a `.vibe` import that no fence of the page shows as a component without a typed signature;
 * a titled sibling fence is checked as real code.
 */
const VIBE_MODULE = `declare module '*.vibe' {
  import type { Component, Handle } from '@vibejs-org/ui';
  const component: Component<(props: any) => Handle<any, any, any>>;
  export default component;
}
`;
/** `<page>/<file>(L,C): error TSnnnn: msg`, the file under the page's snippet directory. */
const DIAGNOSTIC =
  /^(?:.*[\\/])?([^\\/]+)[\\/]([^\\/]+\.(?:ts|vibe))\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/** The page whose `[file]`-titled fences the tutorial test runs. */
const TUTORIAL = 'guides/tutorial.md';

/**
 * The `ts` and `vibe` fences: the info string's leading language name, as VitePress reads it, is
 * `ts` or `vibe`. A fence titled with a bare file name of its language gets that `name`; a
 * duplicate name throws. The tutorial's titled fences are skipped, and another title throws, since
 * nothing would check it.
 */
export function extractSnippets(md: string, file: string): Snippet[] {
  const lines = md.split('\n');
  const names = new Set<string>();
  return fences(lines).flatMap((fence) => {
    const ext = /^[\w-]*/.exec(fence.info)![0];
    if (ext !== 'ts' && ext !== 'vibe') return [];
    const mdLine = fence.open + 1;
    const title = /\[([^\]]+)\]/.exec(fence.info)?.[1];
    let name: string | undefined;
    if (title !== undefined) {
      if (file === TUTORIAL) return [];
      if (/^[\w.-]+$/.test(title) && title.endsWith(`.${ext}`)) name = title;
      else
        throw new Error(
          `${file}:${mdLine}: a [file]-titled ${ext} fence is checked only in ${TUTORIAL}`,
        );
      if (names.has(name)) throw new Error(`${file}:${mdLine}: duplicate snippet file ${name}`);
      names.add(name);
    }
    const code = lines.slice(fence.open + 1, fence.close).join('\n');
    return [{ file, mdLine, ext, code, ...(name && { name }) }];
  });
}

/**
 * Maps `<page>/<file>(L,C): error TSnnnn: msg` to `<page>.md:<line>:C TSnnnn msg`, `snippets`
 * being keyed by `<page>/<file>`; other lines pass. The mapper reports a `.vibe` file in `.vibe`
 * coordinates, so it maps the same way.
 */
export function mapDiagnostics(
  tscOutput: string,
  snippets: ReadonlyMap<string, Snippet>,
): string[] {
  return tscOutput
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const match = DIAGNOSTIC.exec(line);
      const snippet = match ? snippets.get(`${match[1]}/${match[2]}`) : undefined;
      if (!match || !snippet) return line;
      const [, , , l, c, code, message] = match;
      return `${snippet.file}:${snippet.mdLine + Number(l)}:${c} ${code} ${message}`;
    });
}

/** Writes the snippets to `<docsDir>/.snippets`, runs tsc on them and returns the exit code. */
export function main(docsDir: string, tsc = TSC): number {
  const dir = join(docsDir, '.snippets');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // Each page's snippets go to `.snippets/<page index>/`, so a relative import of a titled fence
  // resolves only within its page.
  const snippets = new Map<string, Snippet>();
  for (const [page, { markdown, path }] of loadSource(docsDir).entries()) {
    for (const [n, snippet] of extractSnippets(markdown, `${path}.md`).entries()) {
      const file = `${page}/${snippet.name ?? `${n}.${snippet.ext}`}`;
      mkdirSync(join(dir, String(page)), { recursive: true });
      writeFileSync(join(dir, file), `${snippet.code}\n`);
      snippets.set(file, snippet);
    }
  }
  if (!snippets.size) {
    console.log('check-snippets: no snippets');
    return 0;
  }
  // Built dist types, not src: no vibejs-source condition.
  const tsconfig = {
    extends: BASE,
    compilerOptions: {
      composite: false,
      emitDeclarationOnly: false,
      isolatedDeclarations: false,
      noEmit: true,
      rootDir: '.',
      lib: ['es2024', 'dom'],
      customConditions: [],
      // The server pages use the server decorators, as a server tsconfig does.
      experimentalDecorators: true,
    },
    contentMappers: [{ package: '@vibejs-org/language-tools', extensions: ['.vibe'] }],
    include: ['**/*.ts', '**/*.vibe'],
  };
  writeFileSync(join(dir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
  writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n');
  writeFileSync(join(dir, 'vibe.d.ts'), VIBE_MODULE);
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [tsc, '-p', dir, '--pretty', 'false', '--runExternalCode'],
    { encoding: 'utf8' },
  );
  for (const line of mapDiagnostics(stdout + stderr, snippets)) console.error(line);
  if (status !== 0) return 1;
  console.log(`check-snippets: ${snippets.size} snippets type-check`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv[2]);
}
