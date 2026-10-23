import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkPackage, main, type PackedManifest } from './pack-check.ts';

const packages = fileURLToPath(new URL('../packages/', import.meta.url));
/** Builds a home-directory path, so that this file holds no local path itself. */
const home = ['', 'Users', 'someone', 'x.js'].join('/');

const BASE = ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.d.ts'];
const errors = (files: string[], extra: Partial<PackedManifest> = {}, text = ''): string[] =>
  checkPackage(
    join(packages, 'errors'),
    { name: '@usevibejs/errors', files: ['dist'], exports: { '.': './dist/index.js' }, ...extra },
    files,
    () => text,
  );

const ui = (files: string[]): string[] =>
  checkPackage(
    join(packages, 'ui'),
    { name: '@usevibejs/ui', files: ['dist', 'THIRD-PARTY-NOTICES.md'] },
    files,
    () => '',
  );
const sourceManifest = (name: string, extra: object = {}): string =>
  JSON.stringify({
    name,
    version: '1.0.0',
    files: ['dist'],
    exports: './dist/index.js',
    ...extra,
  });

describe('checkPackage', () => {
  it('passes a package that packs only what users need', () => {
    expect(errors(BASE)).toEqual([]);
  });

  it('rejects sources, tests, fixtures, build config and files outside "files"', () => {
    const files = [
      'src/x.ts',
      'dist/test/a.js',
      'dist/a.test.js',
      'dist/a.test-d.ts',
      'dist/fixtures/a.json',
      'dist/node_modules/a/index.js',
      'dist/.vibejs/a.json',
      'dist/tsconfig.build.json',
      'dist/.tsbuildinfo',
      'tsdown.config.ts',
      'notes.md',
    ];
    expect(errors([...BASE, ...files])).toEqual([
      'src/x.ts is outside "files"',
      'src/x.ts must not be published',
      ...files.slice(1, -2).map((file) => `${file} must not be published`),
      'tsdown.config.ts is outside "files"',
      'tsdown.config.ts must not be published',
      'notes.md is outside "files"',
    ]);
  });

  it('lets the create-vibejs templates ship tests and tsconfigs, but not installs or builds', () => {
    const files = ['package.json', 'README.md', 'LICENSE', 'bin.js'];
    const template = 'templates/fullstack';
    const check = (extra: string[]): string[] =>
      checkPackage(
        join(packages, 'create-vibejs'),
        {
          name: 'create-vibejs',
          files: ['bin.js', 'templates'],
          bin: { 'create-vibejs': './bin.js' },
        },
        [...files, ...extra],
        () => '',
      );
    expect(
      check([`${template}/ui/src/pages/HomePage.test.ts`, `${template}/ui/tsconfig.json`]),
    ).toEqual([]);
    expect(
      check([`${template}/node_modules/a.js`, `${template}/dist/a.js`, `${template}/.vibejs/a`]),
    ).toEqual([
      `${template}/node_modules/a.js must not be published`,
      `${template}/dist/a.js must not be published`,
      `${template}/.vibejs/a must not be published`,
    ]);
  });

  it('requires README.md, LICENSE, and the notices when the source has them', () => {
    expect(errors(['package.json', 'dist/index.js'])).toEqual([
      'README.md is missing',
      'LICENSE is missing',
    ]);
    expect(ui(['package.json', 'README.md', 'LICENSE'])).toEqual([
      'THIRD-PARTY-NOTICES.md is missing',
    ]);
    expect(ui(['package.json', 'README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md'])).toEqual([]);
  });

  it('requires every exports, bin, main and types target in the tarball', () => {
    const manifest = {
      exports: {
        '.': { types: './dist/index.d.ts', default: './dist/index.js' },
        './x': './dist/x.js',
      },
      bin: './dist/bin.js',
      main: 'dist/main.js',
      types: './dist/index.d.ts',
    };
    expect(errors(BASE, manifest)).toEqual([
      'dist/main.js is not in the tarball',
      './dist/bin.js is not in the tarball',
      './dist/x.js is not in the tarball',
    ]);
  });

  it('rejects unresolved specs and internal ranges', () => {
    const manifest = {
      dependencies: { '@usevibejs/contract': 'workspace:*', srvx: '^1.0.0' },
      devDependencies: { vite: 'catalog:', 'create-vibejs': '0.1.0-next.1' },
      peerDependencies: { '@usevibejs/ui': '^0.1.0' },
      optionalDependencies: { '@usevibejs/server': '0.1.0' },
    };
    expect(errors(BASE, manifest)).toEqual([
      'dependencies.@usevibejs/contract is "workspace:*"; pack with pnpm',
      'devDependencies.vite is "catalog:"; pack with pnpm',
      'peerDependencies.@usevibejs/ui is "^0.1.0"; internal packages use exact versions',
    ]);
  });

  it('rejects local paths in text files and skips binary files', () => {
    expect(
      errors(
        ['package.json', 'README.md', 'LICENSE'],
        { exports: {}, files: undefined },
        `a ${home}`,
      ),
    ).toEqual(
      ['package.json', 'README.md', 'LICENSE'].map(
        (file) => `${file} contains the local path ${home.slice(0, -4)}`,
      ),
    );
    expect(errors(['LICENSE'], { exports: {} }, 'at C:\\Users\\someone')).toEqual([
      'package.json is missing',
      'README.md is missing',
      'LICENSE contains the local path C:\\Users\\',
    ]);
    expect(errors(BASE, {}, `\0${home}`)).toEqual([]);
  });
});

describe('main', () => {
  let root: string;
  let lines: string[];
  const put = (files: Record<string, string>): void => {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vibejs-pack-check-test-'));
    lines = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => lines.push(line));
    put({
      'packages/a/package.json': sourceManifest('a'),
      'packages/a/README.md': '# a\n',
      'packages/a/LICENSE': 'MIT\n',
      'packages/a/dist/index.js': 'export {};\n',
      // A path longer than the 100 bytes of a tar name field.
      [`packages/a/dist/${'d'.repeat(60)}/${'f'.repeat(60)}.js`]: 'export {};\n',
      'packages/a/src/index.ts': 'export {};\n',
      'packages/b/package.json': sourceManifest('b', { private: true }),
    });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('packs every public package, skips private ones, and exits 0 when they are clean', () => {
    expect(main(root)).toBe(0);
    expect(lines).toEqual([]);
  });

  it('prints each problem with its package and exits 1', () => {
    put({ 'packages/a/dist/index.js': `// ${home}\n`, 'packages/a/README.md': '' });
    rmSync(join(root, 'packages/a/LICENSE'));
    expect(main(root)).toBe(1);
    expect(lines).toEqual([
      'a: LICENSE is missing',
      `a: dist/index.js contains the local path ${home.slice(0, -4)}`,
    ]);
  });

  it('runs on the working directory as a script', async () => {
    rmSync(join(root, 'packages/a'), { recursive: true });
    const argv = process.argv;
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    process.argv = ['node', fileURLToPath(new URL('pack-check.ts', import.meta.url))];
    vi.resetModules();
    try {
      await import('./pack-check.ts');
      expect(process.exitCode).toBe(0);
    } finally {
      process.argv = argv;
      process.exitCode = undefined;
    }
  });
});
