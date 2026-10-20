// Usage: node scripts/pack-check.ts (after `pnpm build`)
// Packs every public package with `pnpm pack`, so that pnpm's `workspace:` and `catalog:`
// rewriting is what gets checked, and checks each tarball: it holds only what users need, every
// entry point exists, dependency specs are resolved, and no text has a local path. Prints one
// `<package>: <problem>` line per problem and exits 1 when there is any.
import { execSync } from 'node:child_process';
import { existsSync, globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { LOCAL_PATH } from './lint-repo.ts';

export interface PackedManifest {
  name: string;
  private?: boolean;
  files?: string[];
  main?: string;
  types?: string;
  bin?: string | Record<string, string>;
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const NOTICES = 'THIRD-PARTY-NOTICES.md';
const ALWAYS = ['package.json', 'README.md', 'LICENSE'];
const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;
/** Sources, tests, fixtures and build config: never published. */
const FORBIDDEN =
  /(?:^|\/)(?:src|test|fixtures|node_modules|\.vibejs)\/|\.test\.|\.test-d\.ts$|\.tsbuildinfo$|(?:^|\/)(?:tsconfig[^/]*\.json|tsdown\.config\.[^/]+)$/;
/** The app templates of create-vibejs ship their sources, tests and tsconfigs to users. */
const TEMPLATE = /^templates\//;
const TEMPLATE_FORBIDDEN = /(?:^|\/)(?:node_modules|dist|\.vibejs)\//;
/** The internal packages, which depend on each other at exact versions (ADR 0005). */
const INTERNAL = /^(?:@vibejs-org\/|create-vibejs$)/;
const EXACT = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;

/** Collects the string leaves of an `exports` or `bin` value. */
const targets = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Object.values(value ?? {}).flatMap((inner: unknown) => targets(inner));

/**
 * Returns the problems of one packed package: `dir` is its source directory, `files` the tarball
 * listing and `read` the text of a packed file.
 */
export function checkPackage(
  dir: string,
  manifest: PackedManifest,
  files: readonly string[],
  read: (file: string) => string,
): string[] {
  const problems: string[] = [];
  const required = existsSync(join(dir, NOTICES)) ? [...ALWAYS, NOTICES] : ALWAYS;
  for (const file of required.filter((f) => !files.includes(f))) {
    problems.push(`${file} is missing`);
  }
  const roots = [...(manifest.files ?? []), ...required];
  for (const file of files) {
    if (!roots.some((root) => file === root || file.startsWith(`${root}/`))) {
      problems.push(`${file} is outside "files"`);
    }
    if ((TEMPLATE.test(file) ? TEMPLATE_FORBIDDEN : FORBIDDEN).test(file)) {
      problems.push(`${file} must not be published`);
    }
    const text = read(file);
    const local = text.includes('\0') ? null : text.match(LOCAL_PATH);
    if (local) problems.push(`${file} contains the local path ${local[0]}`);
  }
  const entries = [
    manifest.main,
    manifest.types,
    ...targets(manifest.bin),
    ...targets(manifest.exports),
  ];
  for (const target of entries.filter((t) => t !== undefined)) {
    if (!files.includes(target.replace(/^\.\//, '')))
      problems.push(`${target} is not in the tarball`);
  }
  for (const field of DEP_FIELDS) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (/^(?:workspace|catalog):/.test(spec)) {
        problems.push(`${field}.${name} is "${spec}"; pack with pnpm`);
      } else if (INTERNAL.test(name) && !EXACT.test(spec)) {
        problems.push(`${field}.${name} is "${spec}"; internal packages use exact versions`);
      }
    }
  }
  return problems;
}

/** Reads the files of a `.tgz` that `pnpm pack` wrote (ustar, regular files only). */
function untar(tgz: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(tgz);
  const files = new Map<string, Buffer>();
  for (let at = 0; at + 512 <= tar.length && tar[at] !== 0;) {
    const field = (start: number, length: number): string =>
      tar.toString('utf8', at + start, at + start + length).replace(/\0.*$/s, '');
    const size = Number.parseInt(field(124, 12), 8);
    const name = [field(345, 155), field(0, 100)].filter(Boolean).join('/');
    files.set(name.replace(/^package\//, ''), tar.subarray(at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** Packs and checks every public package under `root`, prints the problems, returns the exit code. */
export function main(root: string): number {
  const out = mkdtempSync(join(tmpdir(), 'vibejs-pack-check-'));
  const problems: string[] = [];
  try {
    for (const file of globSync('packages/*/package.json', { cwd: root }).toSorted()) {
      const dir = join(root, dirname(file));
      const source: PackedManifest = JSON.parse(readFileSync(join(root, file), 'utf8'));
      if (source.private === true) continue;
      // A shell command, so that Windows resolves pnpm.cmd.
      const { filename } = JSON.parse(
        execSync(`pnpm pack --json --pack-destination ${JSON.stringify(out)}`, {
          cwd: dir,
          encoding: 'utf8',
        }),
      );
      const packed = untar(readFileSync(filename));
      const read = (name: string): string => packed.get(name)!.toString('utf8');
      const manifest: PackedManifest = JSON.parse(read('package.json'));
      for (const problem of checkPackage(dir, manifest, [...packed.keys()], read)) {
        problems.push(`${source.name}: ${problem}`);
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  for (const problem of problems) console.error(problem);
  return problems.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.cwd());
}
