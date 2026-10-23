// Usage: node scripts/errors.ts [--check] [--docs <dir>]
// Parses packages/*/messages/*.md and writes the generated error files (see CONTRIBUTING.md).
// --check writes no committed file: it rewrites only the gitignored CLI catalog and fails on
// format, range, duplicate, stale-file and "thrown and tested" problems.
// --docs <dir> also writes one Markdown page per code, retired codes included, and index.md.
// errors.lock is append-only: a released code keeps its line forever; retire it instead.
import {
  existsSync,
  globSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** The only place the docs domain lives. */
const DOCS_ORIGIN = 'https://vibejs.org';

/** Code ranges per package dir (CONTRACTS C2). Unlisted sub-ranges are reserved. */
export const RANGES: Record<string, readonly (readonly [number, number])[]> = {
  errors: [[1, 999]],
  compiler: [[1000, 4999]],
  ui: [
    [5000, 5999],
    [7000, 7999],
  ],
  'language-tools': [
    [6000, 6099],
    [6200, 6999],
  ],
  vscode: [[6100, 6199]],
  cli: [
    [8000, 8099],
    [8200, 8999],
  ],
  'create-vibejs': [[8100, 8199]],
  contract: [[9000, 9099]],
  server: [[9100, 9899]],
};

export interface Entry {
  code: string;
  package: string;
  title: string;
  message: string;
  fixes: string[];
  /** Prose and the optional example: docs only. */
  body: string;
  retired: boolean;
  /** The entry's Markdown after its heading, for the docs page. */
  source: string;
}

interface Manifest {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  bin?: Record<string, string>;
}

const HEADING = /^## (VIBE\d{4}): (.+?)( \(retired\))?$/;
const PLACEHOLDER = /\{[a-z][a-zA-Z0-9]*\}/g;

export function docsBase(version: string): string {
  return `${DOCS_ORIGIN}/v${Number.parseInt(version, 10)}/errors/`;
}

/** Splits lines into chunks at lines starting with `prefix`, ignoring fenced code. */
function split(lines: string[], prefix: string): string[][] {
  const chunks: string[][] = [[]];
  let fenced = false;
  for (const line of lines) {
    if (line.startsWith('```')) fenced = !fenced;
    if (!fenced && line.startsWith(prefix)) chunks.push([line]);
    else chunks.at(-1)!.push(line);
  }
  return chunks;
}

/** Parses one messages file. Lines before the first `## ` heading are ignored. */
export function parseMessages(
  pkg: string,
  file: string,
  text: string,
): { entries: Entry[]; problems: string[] } {
  const entries: Entry[] = [];
  const problems: string[] = [];
  for (const [heading, ...lines] of split(text.split(/\r?\n/), '## ').slice(1)) {
    const fail = (problem: string) => problems.push(`${file}: "${heading}": ${problem}`);
    const match = HEADING.exec(heading);
    if (!match) {
      fail('the heading must be "## VIBE####: Title"');
      continue;
    }
    const [intro, ...sections] = split(lines, '### ');
    const named = new Map(sections.map(([title, ...rest]) => [title.slice(4), rest]));
    for (const [title] of sections) {
      if (!['### Fix', '### Example'].includes(title)) fail(`unexpected section "${title}"`);
    }
    if (named.size !== sections.length) fail('a section appears twice');

    const [first = '', ...prose] = intro.filter((line) => line.trim());
    if (!/^> \S/.test(first) || prose.some((line) => line.startsWith('>'))) {
      fail('exactly one "> message" line must follow the heading');
    } else if (!prose.length) {
      fail('a paragraph must explain the error after the "> message" line');
    }
    const message = first.slice(2).trim();
    const fixLines = (named.get('Fix') ?? []).filter((line) => line.trim());
    const fixes = fixLines
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim());
    if (!fixes.length || fixes.length !== fixLines.length) {
      fail('"### Fix" must hold one or more "- " bullets and nothing else');
    }
    for (const part of [message, ...fixes]) {
      if (/[{}]/.test(part.replace(PLACEHOLDER, ''))) {
        fail(`malformed placeholder in "${part}"; use {camelCase}`);
      }
    }
    const example = named.get('Example');
    entries.push({
      code: match[1],
      package: pkg,
      title: match[2],
      message,
      fixes,
      body: [
        ...intro.filter((line) => line !== first),
        ...(example ? ['### Example', ...example] : []),
      ]
        .join('\n')
        .trim(),
      retired: Boolean(match[3]),
      source: lines.join('\n').trim(),
    });
  }
  return { entries, problems };
}

export function errorsGen(pkg: string, entries: readonly Entry[]): string {
  const rows = entries
    .filter((entry) => !entry.retired)
    .map((entry) => `  ${entry.code}: ${JSON.stringify([entry.message, ...entry.fixes])},\n`);
  // ui and contract ship to the browser: their prod bundles drop the table. `__DEV__` is ui only.
  const load =
    pkg === 'ui'
      ? '() => (__DEV__ ? MESSAGES : undefined)'
      : pkg === 'contract'
        ? "() => (process.env.NODE_ENV !== 'production' ? MESSAGES : undefined)"
        : '() => MESSAGES';
  return `// GENERATED by scripts/errors.ts from ../messages/*.md. Do not edit.
import { defineErrors, type VibeErrorFactory } from '@usevibejs/errors';

const MESSAGES = {
${rows.join('')}} as const;

export const vibeError: VibeErrorFactory<typeof MESSAGES> = defineErrors(${load});
`;
}

function docsBaseGen(base: string): string {
  return `// GENERATED by scripts/errors.ts from the package version. Do not edit.
export const DOCS_BASE: string = '${base}';
`;
}

function catalogGen(entries: readonly Entry[], base: string): string {
  const catalog = entries.map(({ code, package: pkg, title, message, fixes, body, retired }) => ({
    code,
    package: pkg,
    title,
    message,
    fixes,
    body,
    docs: base + code,
    retired,
  }));
  return `// GENERATED by scripts/errors.ts from packages/*/messages/*.md. Not committed. Do not edit.
export interface CatalogEntry {
  code: \`VIBE\${number}\`;
  package: string;
  title: string;
  message: string;
  fixes: readonly string[];
  body: string;
  docs: string;
  retired: boolean;
}

export const CATALOG: readonly CatalogEntry[] = ${JSON.stringify(catalog, null, 2)};
`;
}

function docsPage(entry: Entry): string {
  return `---
code: ${entry.code}
title: ${JSON.stringify(entry.title)}
package: ${entry.package}
retired: ${entry.retired}
---

# ${entry.code}: ${entry.title}

${entry.source}
`;
}

function docsIndex(entries: readonly Entry[]): string {
  const rows = entries.map(
    (entry) =>
      `| [${entry.code}](./${entry.code}.md) | ${entry.title} | ${entry.package} | ${entry.retired ? 'retired' : ''} |\n`,
  );
  return `# Error codes\n\n| Code | Title | Package | Status |\n| --- | --- | --- | --- |\n${rows.join('')}`;
}

const read = (file: string): string | null =>
  existsSync(file) ? readFileSync(file, 'utf8') : null;
const manifest = (dir: string): Manifest =>
  JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

function write(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/**
 * Concatenated texts of a package's non-test sources (src, or its bins) and of its tests, with the
 * shared suites (`*.suite.ts`) that several test files run.
 */
function packageTexts(dir: string): { sources: string; tests: string } {
  const files = existsSync(join(dir, 'src'))
    ? globSync('src/**/*.ts', { cwd: dir }).filter((file) => !/\.(test|test-d|gen)\.ts$/.test(file))
    : Object.values(manifest(dir).bin ?? {});
  const tests = globSync(['**/*.test.ts', '**/*.suite.ts'], {
    cwd: dir,
    exclude: ['node_modules/**'],
  });
  const concat = (list: string[]) =>
    list.map((file) => readFileSync(join(dir, file), 'utf8')).join('\n');
  return { sources: concat(files), tests: concat(tests) };
}

/** Runs the script against the repo at `root` and returns the exit code. */
export function main(root: string, argv: string[]): number {
  let options: { check?: boolean; docs?: string };
  try {
    ({ values: options } = parseArgs({
      args: argv,
      options: { check: { type: 'boolean' }, docs: { type: 'string' } },
    }));
  } catch (error) {
    console.error(`${String(error)}\nUsage: node scripts/errors.ts [--check] [--docs <dir>]`);
    return 2;
  }

  const packagesDir = join(root, 'packages');
  const dirs = readdirSync(packagesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .toSorted();
  const problems: string[] = [];
  const byPackage = new Map<string, Entry[]>();
  for (const pkg of dirs) {
    const messages = join(packagesDir, pkg, 'messages');
    if (!existsSync(messages)) continue;
    const entries: Entry[] = [];
    for (const name of readdirSync(messages)
      .filter((file) => file.endsWith('.md'))
      .toSorted()) {
      const file = `packages/${pkg}/messages/${name}`;
      const parsed = parseMessages(pkg, file, readFileSync(join(root, file), 'utf8'));
      entries.push(...parsed.entries);
      problems.push(...parsed.problems);
    }
    byPackage.set(
      pkg,
      entries.toSorted((a, b) => a.code.localeCompare(b.code)),
    );
  }

  const all = [...byPackage.values()].flat().toSorted((a, b) => a.code.localeCompare(b.code));
  const seen = new Map<string, string>();
  for (const { code, package: pkg } of all) {
    const number = Number(code.slice(4));
    if (!(RANGES[pkg] ?? []).some(([low, high]) => number >= low && number <= high)) {
      problems.push(`${code} is outside the ranges of packages/${pkg} (see CONTRACTS.md C2)`);
    }
    if (seen.has(code))
      problems.push(`${code} is defined in packages/${seen.get(code)} and packages/${pkg}`);
    seen.set(code, pkg);
  }
  const lockFile = join(root, 'errors.lock');
  const lock = new Set(all.map(({ code, package: pkg }) => `${code} ${pkg}`));
  for (const line of read(lockFile)?.split('\n').filter(Boolean) ?? []) {
    if (!lock.has(line)) {
      problems.push(`${line} is in errors.lock but in no catalog; mark the code (retired) instead`);
    }
  }
  if (problems.length && !options.check) {
    for (const problem of problems) console.error(problem);
    return 1;
  }

  // Committed generated files: path -> expected content, or null when the file must not exist.
  const base = docsBase(manifest(join(packagesDir, 'errors')).version!);
  const committed = new Map<string, string | null>([
    [join(packagesDir, 'errors/src/docs-base.gen.ts'), docsBaseGen(base)],
    [lockFile, [...lock].map((line) => `${line}\n`).join('')],
  ]);
  for (const pkg of dirs) {
    const entries = byPackage.get(pkg);
    // A devDependency counts too: the private VS Code extension bundles @usevibejs/errors. A
    // package without src (the zero-dependency create-vibejs bin) formats its errors itself.
    const deps = (m: Manifest) => ({ ...m.dependencies, ...m.devDependencies });
    const typed =
      entries !== undefined &&
      existsSync(join(packagesDir, pkg, 'src')) &&
      '@usevibejs/errors' in deps(manifest(join(packagesDir, pkg)));
    committed.set(
      join(packagesDir, pkg, 'src/errors.gen.ts'),
      typed ? errorsGen(pkg, entries) : null,
    );
  }
  for (const [file, text] of committed) {
    if (read(file) === text) continue;
    if (options.check) problems.push(`${relative(root, file)} is stale; run pnpm errors`);
    else if (text === null) rmSync(file);
    else write(file, text);
  }
  write(join(packagesDir, 'cli/src/catalog.gen.ts'), catalogGen(all, base));
  if (options.docs) {
    const dir = resolve(options.docs);
    for (const entry of all) write(join(dir, `${entry.code}.md`), docsPage(entry));
    write(join(dir, 'index.md'), docsIndex(all));
  }

  if (options.check) {
    for (const [pkg, entries] of byPackage) {
      const texts = packageTexts(join(packagesDir, pkg));
      for (const { code } of entries.filter((entry) => !entry.retired)) {
        if (!texts.sources.includes(`'${code}'`)) {
          problems.push(
            `${code} is never thrown: no '${code}' in a non-test source of packages/${pkg}`,
          );
        }
        if (!texts.tests.includes(`'${code}'`)) {
          problems.push(
            `${code} is never asserted: no '${code}' in a *.test.ts or *.suite.ts of packages/${pkg}`,
          );
        }
      }
    }
  }
  for (const problem of problems) console.error(problem);
  if (problems.length) return 1;
  console.log(`errors: ${all.length} codes in ${byPackage.size} packages`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(fileURLToPath(new URL('..', import.meta.url)), process.argv.slice(2));
}
