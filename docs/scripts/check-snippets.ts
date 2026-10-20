// Usage: node docs/scripts/check-snippets.ts <docsDir>
// Type-checks every inline ```ts and ```vibe fence of the docs pages (error pages excluded) with
// the real tsc and the .vibe content mapper, and prints each diagnostic as
// `page.md:line:col TSnnnn message`. Exits 1 on any diagnostic. Hidden setup above `// ---cut---`
// is checked too; intentional errors use `// @ts-expect-error`. A fence titled with a file path
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
}

// The docs' TypeScript (catalog:ts-next); its exports map hides the bin.
const TSC = createRequire(import.meta.url)
  .resolve('typescript/package.json')
  .replace(/package\.json$/, 'bin/tsc');
const BASE = fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url));
/** Types a `.vibe` import in a snippet as a component without a typed signature. */
const VIBE_MODULE = `declare module '*.vibe' {
  import type { Component, Handle } from '@vibejs-org/ui';
  const component: Component<(props: any) => Handle<any, any, any>>;
  export default component;
}
`;
const DIAGNOSTIC = /^(?:.*[\\/])?(\d+)\.(?:ts|vibe)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/** The page whose `[file]`-titled fences the tutorial test runs. */
const TUTORIAL = 'guides/tutorial.md';

/**
 * The `ts` and `vibe` fences without a `[file]` title: the info string's leading language name,
 * as VitePress reads it, is `ts` or `vibe`. A titled one outside the tutorial throws, since
 * nothing would check it.
 */
export function extractSnippets(md: string, file: string): Snippet[] {
  const lines = md.split('\n');
  return fences(lines).flatMap((fence) => {
    const ext = /^[\w-]*/.exec(fence.info)![0];
    if (ext !== 'ts' && ext !== 'vibe') return [];
    if (/\[[^\]]+\]/.test(fence.info)) {
      if (file === TUTORIAL) return [];
      throw new Error(
        `${file}:${fence.open + 1}: a [file]-titled ${ext} fence is checked only in ${TUTORIAL}`,
      );
    }
    const code = lines.slice(fence.open + 1, fence.close).join('\n');
    return [{ file, mdLine: fence.open + 1, ext, code }];
  });
}

/**
 * Maps `<n>.ts(L,C): error TSnnnn: msg` to `<page>.md:<line>:C TSnnnn msg`; other lines pass. The
 * mapper reports `<n>.vibe(L,C)` in `.vibe` coordinates, so it maps the same way.
 */
export function mapDiagnostics(tscOutput: string, snippets: readonly Snippet[]): string[] {
  return tscOutput
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const match = DIAGNOSTIC.exec(line);
      const snippet = match ? snippets.at(Number(match[1])) : undefined;
      if (!match || !snippet) return line;
      const [, , l, c, code, message] = match;
      return `${snippet.file}:${snippet.mdLine + Number(l)}:${c} ${code} ${message}`;
    });
}

/** Writes the snippets to `<docsDir>/.snippets`, runs tsc on them and returns the exit code. */
export function main(docsDir: string, tsc = TSC): number {
  const snippets = loadSource(docsDir).flatMap((page) =>
    extractSnippets(page.markdown, `${page.path}.md`),
  );
  const dir = join(docsDir, '.snippets');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [n, snippet] of snippets.entries()) {
    writeFileSync(join(dir, `${n}.${snippet.ext}`), `${snippet.code}\n`);
  }
  if (!snippets.length) {
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
    include: ['*.ts', '*.vibe'],
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
  console.log(`check-snippets: ${snippets.length} snippets type-check`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv[2]);
}
