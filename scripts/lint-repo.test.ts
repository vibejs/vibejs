import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from './lint-repo.ts';

// Turkish letters are written as \u escapes so that this file stays ASCII.
const G = '\u011F';
const S = '\u015F';

const DIRS: Record<string, string> = {
  errors: '@vibejs-org/errors',
  ui: '@vibejs-org/ui',
  compiler: '@vibejs-org/compiler',
  'language-tools': '@vibejs-org/language-tools',
  contract: '@vibejs-org/contract',
  server: '@vibejs-org/server',
  cli: '@vibejs-org/cli',
  'create-vibejs': 'create-vibejs',
};

const manifest = (dir: string, extra: object = {}): string =>
  JSON.stringify({
    name: DIRS[dir],
    type: 'module',
    sideEffects: false,
    license: 'MIT',
    engines: { node: '^24.15.0 || >=26' },
    files: ['dist'],
    repository: {
      type: 'git',
      url: 'git+https://github.com/vibejs/vibejs.git',
      directory: `packages/${dir}`,
    },
    publishConfig: { access: 'public' },
    devDependencies: { tsdown: 'catalog:' },
    ...extra,
  });

const BASE: Record<string, string> = {
  LICENSE: 'MIT License\n',
  '.nvmrc': '24\n',
  'coverage-ignores.json': '[]\n',
  'package.json': JSON.stringify({
    private: true,
    devDependencies: { vitest: 'catalog:' },
    devEngines: { runtime: { name: 'node', version: '^24.15.0' } },
  }),
  'tsconfig.json': '{ "files": [], "references": [{ "path": "packages/errors" }] }',
  ...Object.fromEntries(
    Object.keys(DIRS).flatMap((dir) => [
      [`packages/${dir}/package.json`, manifest(dir)],
      [`packages/${dir}/LICENSE`, 'MIT License\n'],
      [`packages/${dir}/tsconfig.json`, '{ "extends": "../../tsconfig.base.json" }'],
    ]),
  ),
  'packages/ui/package.json': manifest('ui', {
    dependencies: { '@vibejs-org/errors': 'workspace:*' },
  }),
  'packages/ui/tsconfig.json': '{ "references": [{ "path": "../errors" }] }',
  'packages/ui/src/dev.ts': [
    'declare var __DEV__: boolean;',
    'const flags = { __DEV__: 1 };',
    'export const read = () => flags.__DEV__ && __DEV__;',
    'export function warn(): void { if (__DEV__) console.warn("dev"); }',
  ].join('\n'),
  'packages/ui/vitest.setup.ts': 'globalThis.__DEV__ = true;',
  'packages/server/tsconfig.json': '{ "compilerOptions": { "experimentalDecorators": true } }',
  'packages/server/src/service.ts': 'function Tag(_: unknown) {}\n@Tag\nexport class Service {}\n',
};

const entry = (file: string, reason: string): string => JSON.stringify([{ file, reason }]);
/** Builds hint text, so that no line of this file turns coverage off. */
const off = (kind: string): string => `v8 ignore ${kind}`;

let root: string;
let errors: string[];

function put(files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
}
/** Writes `files` over the base repo and returns the findings. */
function lint(files: Record<string, string> = {}): string[] {
  put(files);
  errors = [];
  const code = main(root);
  expect(code).toBe(errors.length ? 1 : 0);
  return errors;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibejs-lint-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  put(BASE);
  vi.spyOn(console, 'error').mockImplementation((line: string) => errors.push(line));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

it('passes the base repo', () => {
  expect(lint()).toEqual([]);
});

describe('rule 1: coverage hints', () => {
  const HINT = '/* v8 ignore next -- @preserve the platform always has it */';

  it('rejects a bare hint and the file, istanbul, c8 and line-comment forms', () => {
    const file = 'packages/errors/src/a.ts';
    const forms = [
      '/* v8 ignore next */',
      '/* v8 ignore file -- @preserve x */',
      '/* istanbul ignore next */',
      '/* c8 ignore next */',
      '/* node:coverage ignore next */',
      '/** v8 ignore next -- @preserve x */',
      '// v8 ignore next -- @preserve x',
    ];
    const only =
      'coverage-hint only `/* v8 ignore next|if|else|start|stop -- @preserve <reason> */`';
    expect(lint({ [file]: forms.join('\n') })).toEqual(
      forms.map((_, i) => `${file}:${i + 1}:1 ${only} is allowed`),
    );
  });

  it('requires an allowlist entry for a valid hint', () => {
    expect(lint({ 'packages/errors/src/a.ts': `const a = 1;\n  ${HINT}` })).toEqual([
      'packages/errors/src/a.ts:2:3 coverage-hint add it to coverage-ignores.json',
    ]);
  });

  it('passes a hint with an entry, and fails a stale entry', () => {
    const file = 'packages/errors/src/a.ts';
    expect(
      lint({ [file]: HINT, 'coverage-ignores.json': entry(file, 'the platform always has it') }),
    ).toEqual([]);
    expect(lint({ [file]: '' })).toEqual([
      'coverage-ignores.json:1:1 coverage-hint stale entry {"file":"packages/errors/src/a.ts","reason":"the platform always has it"}',
    ]);
  });

  it('pairs start and stop', () => {
    const start = `/* ${off('start')} -- @preserve r */`;
    const stop = `/* ${off('stop')} -- @preserve r */`;
    const file = 'packages/errors/src/a.ts';
    put({ 'coverage-ignores.json': entry(file, 'r') });
    expect(lint({ [file]: [start, stop, stop, start, start].join('\n') })).toEqual([
      `${file}:3:1 coverage-hint an ignore-stop hint has no start`,
      `${file}:5:1 coverage-hint an ignore-start hint has no stop`,
      `${file}:5:1 coverage-hint an ignore-start hint is already open`,
    ]);
  });

  it('rejects start/stop text outside a hint, since the remapper reads raw lines', () => {
    const file = 'packages/errors/src/a.ts';
    const lines = [
      `// Note: ${off('start')}`,
      `export const s = '${off('stop')}';`,
      `/* ${off('next')} -- @preserve r */ const t = 'c8 ignore\tstart';`,
      `const u = 'node:coverage ${off('stop').slice(3)}';`,
    ];
    put({ 'coverage-ignores.json': entry(file, 'r') });
    expect(lint({ [file]: lines.join('\n') })).toEqual([
      `${file}:1:10 coverage-hint this text turns coverage off; reword it`,
      `${file}:2:19 coverage-hint this text turns coverage off; reword it`,
      `${file}:3:48 coverage-hint this text turns coverage off; reword it`,
      `${file}:4:12 coverage-hint this text turns coverage off; reword it`,
    ]);
  });

  it('passes an upstream-defensive: hint with an entry in forked code, and requires the prefix there', () => {
    const file = 'packages/compiler/src/tokenizer.ts';
    const header =
      '// Upstream: vuejs/core@0123abc packages/compiler-core/src/tokenizer.ts (MIT)\n';
    put({
      'packages/compiler/THIRD-PARTY-NOTICES.md': '## vuejs/core (MIT)\n',
      'coverage-ignores.json': entry(file, 'upstream-defensive: unreachable state'),
    });
    expect(
      lint({
        [file]: `${header}/* v8 ignore if -- @preserve upstream-defensive: unreachable state */`,
      }),
    ).toEqual([]);
    put({ 'coverage-ignores.json': entry(file, 'unreachable state') });
    expect(
      lint({ [file]: `${header}/* v8 ignore else -- @preserve unreachable state */` }),
    ).toEqual([`${file}:2:1 coverage-hint forked upstream code uses upstream-defensive: reasons`]);
  });
});

describe('rule 2: __DEV__', () => {
  it('rejects a module-level read in packages/ui/src', () => {
    expect(lint({ 'packages/ui/src/a.ts': 'export const dev = __DEV__;' })).toEqual([
      'packages/ui/src/a.ts:1:20 dev-global read __DEV__ inside function bodies',
    ]);
  });

  it('rejects a read in a module-level IIFE or a default parameter', () => {
    const file = 'packages/ui/src/a.ts';
    expect(
      lint({
        [file]: [
          'export const x = (() => __DEV__)();',
          'export const y = (function () { return __DEV__; })();',
          'export function f(a = __DEV__) { return a; }',
        ].join('\n'),
      }),
    ).toEqual([
      `${file}:1:25 dev-global read __DEV__ inside function bodies`,
      `${file}:2:40 dev-global read __DEV__ inside function bodies`,
      `${file}:3:23 dev-global read __DEV__ inside function bodies`,
    ]);
  });

  it('rejects a read through a global object, but allows assigning one', () => {
    const file = 'packages/ui/src/a.ts';
    expect(
      lint({
        [file]:
          'export const f = () => globalThis.__DEV__ || window.__DEV__;\nglobalThis.__DEV__ = true;',
      }),
    ).toEqual([
      `${file}:1:35 dev-global read the bare __DEV__ global`,
      `${file}:1:53 dev-global read the bare __DEV__ global`,
    ]);
  });

  it('rejects a read outside packages/ui/src, even in a function', () => {
    expect(lint({ 'packages/server/src/a.ts': 'export const f = () => obj[__DEV__];' })).toEqual([
      'packages/server/src/a.ts:1:28 dev-global __DEV__ is read only in packages/ui/src',
    ]);
  });
});

describe('rule 3: decorators', () => {
  it('rejects a decorator outside server code', () => {
    expect(lint({ 'packages/ui/src/a.ts': '@Tag\nexport class A { @Tag m() {} }' })).toEqual([
      'packages/ui/src/a.ts:1:1 decorators decorators are allowed only in packages/server/src',
      'packages/ui/src/a.ts:2:18 decorators decorators are allowed only in packages/server/src',
    ]);
  });

  it('rejects decorators in packages/server outside src', () => {
    expect(
      lint({
        'packages/server/test/helper.ts': '@Tag\nexport class A {}',
        'packages/server/tsdown.config.ts': '@Tag\nexport class B {}',
      }),
    ).toEqual([
      'packages/server/test/helper.ts:1:1 decorators decorators are allowed only in packages/server/src',
      'packages/server/tsdown.config.ts:1:1 decorators decorators are allowed only in packages/server/src',
    ]);
  });

  it('allows decorators and the flag in example and template servers', () => {
    const flag = '{ "compilerOptions": { "experimentalDecorators": true } }';
    expect(
      lint({
        'examples/todo/server/tsconfig.json': flag,
        'examples/todo/server/src/a.ts': '@Tag\nexport class A {}',
        'packages/create-vibejs/templates/app/server/tsconfig.json': flag,
      }),
    ).toEqual([]);
  });

  it('rejects experimentalDecorators outside server tsconfigs, and emitDecoratorMetadata anywhere', () => {
    expect(
      lint({
        'packages/ui/tsconfig.json':
          '{\n  "compilerOptions": { "experimentalDecorators": true },\n  "references": [{ "path": "../errors" }]\n}',
        'packages/server/tsconfig.json':
          '{ "compilerOptions": { "experimentalDecorators": true, "emitDecoratorMetadata": true } }',
      }),
    ).toEqual([
      'packages/server/tsconfig.json:1:56 decorators emitDecoratorMetadata is allowed nowhere',
      'packages/ui/tsconfig.json:2:24 decorators experimentalDecorators is for servers only',
    ]);
  });
});

describe('rule 4: dependency specs', () => {
  it('rejects a version range and a catalog:ts-next outside C10 consumers', () => {
    expect(
      lint({
        'packages/server/package.json': manifest('server', {
          dependencies: { vite: '^8.3.4' },
          peerDependencies: { typescript: 'catalog:ts-next' },
        }),
      }),
    ).toEqual([
      'packages/server/package.json:1:1 dep-spec dependencies.vite is "^8.3.4"; use catalog:, catalog:ts-next, workspace:*',
      'packages/server/package.json:1:1 dep-spec peerDependencies.typescript: catalog:ts-next is for C10 consumers',
    ]);
  });

  it('allows catalog:ts-next in packages/cli', () => {
    expect(
      lint({
        'packages/cli/package.json': manifest('cli', {
          devDependencies: { typescript: 'catalog:ts-next' },
        }),
      }),
    ).toEqual([]);
  });
});

describe('rule 5: references', () => {
  it('rejects a dependency missing from references, and an extra reference', () => {
    expect(
      lint({
        'packages/server/package.json': manifest('server', {
          devDependencies: { '@vibejs-org/errors': 'workspace:*' },
        }),
        'packages/cli/tsconfig.json': '{ "references": [{ "path": "../ui" }] }',
      }),
    ).toEqual([
      'packages/cli/tsconfig.json:1:1 references ../ui is not a workspace dependency',
      'packages/server/tsconfig.json:1:1 references add { "path": "../errors" } (a workspace dependency)',
    ]);
  });

  it('accepts a path to the tsconfig file, and requires a tsconfig for workspace deps', () => {
    put({
      'packages/ui/tsconfig.json': '{ "references": [{ "path": "../errors/tsconfig.json" }] }',
    });
    expect(lint()).toEqual([]);
    rmSync(join(root, 'packages/ui/tsconfig.json'));
    expect(lint()).toEqual([
      'packages/ui/tsconfig.json:1:1 references add { "path": "../errors" } (a workspace dependency)',
    ]);
  });
});

describe('rule 6: manifests', () => {
  it('rejects a manifest without sideEffects', () => {
    const pkg = JSON.parse(manifest('errors'));
    delete pkg.sideEffects;
    expect(lint({ 'packages/errors/package.json': JSON.stringify(pkg) })).toEqual([
      'packages/errors/package.json:1:1 manifest sideEffects must be false',
    ]);
  });

  it('reports every missing field', () => {
    expect(
      lint({ 'packages/contract/package.json': '{ "name": "@vibejs-org/contract" }' }),
    ).toEqual(
      [
        'type must be "module"',
        'sideEffects must be false',
        'license must be "MIT"',
        'engines.node must be "^24.15.0 || >=26"',
        'files must list what is published',
        'repository.url must be "git+https://github.com/vibejs/vibejs.git"',
        'repository.directory must be "packages/contract"',
        'publishConfig.access must be "public"',
      ]
        .map((message) => `packages/contract/package.json:1:1 manifest ${message}`)
        .toSorted(),
    );
  });

  it('rejects a LICENSE that differs from the root, or is missing', () => {
    put({ 'packages/ui/LICENSE': 'MIT License \n' });
    rmSync(join(root, 'packages/cli/LICENSE'));
    expect(lint()).toEqual([
      'packages/cli/package.json:1:1 manifest packages/cli/LICENSE must be a byte-identical copy of the root LICENSE',
      'packages/ui/package.json:1:1 manifest packages/ui/LICENSE must be a byte-identical copy of the root LICENSE',
    ]);
  });

  it('allows exactly the 8 C1 packages to be public', () => {
    put({ 'examples/todo/package.json': '{ "name": "todo", "private": true }' });
    expect(lint()).toEqual([]);
    put({ 'packages/cli/package.json': manifest('cli', { private: true }) });
    expect(lint({ 'packages/extra/package.json': manifest('extra', { name: 'extra' }) })).toEqual([
      'package.json:1:1 manifest C1 package @vibejs-org/cli has no public manifest',
      'packages/extra/package.json:1:1 manifest extra is not a C1 package; set "private": true',
      'packages/extra/package.json:1:1 manifest packages/extra/LICENSE must be a byte-identical copy of the root LICENSE',
    ]);
  });
});

describe('rule 7: Upstream headers', () => {
  it('rejects an unlisted project and a malformed header', () => {
    put({ 'packages/compiler/THIRD-PARTY-NOTICES.md': '## vuejs/core (MIT)\n' });
    expect(
      lint({
        'packages/compiler/src/a.ts':
          '// Upstream: fb55/htmlparser2@abcdef0 src/Tokenizer.ts (MIT)',
        'packages/ui/src/b.ts':
          '// Upstream: vuejs/core@abcdef0 packages/reactivity/src/ref.ts (MIT)',
        'scripts/c.ts': '// Upstream: vuejs/core packages/x.ts',
      }),
    ).toEqual([
      'packages/compiler/src/a.ts:1:1 upstream fb55/htmlparser2 is not listed in packages/compiler/THIRD-PARTY-NOTICES.md',
      'packages/ui/src/b.ts:1:1 upstream vuejs/core is not listed in packages/ui/THIRD-PARTY-NOTICES.md',
      'scripts/c.ts:1:1 upstream use `// Upstream: <repo>@<sha> <path> (<license>)`',
    ]);
  });
});

describe('rule 8: Node pin', () => {
  it('rejects an .nvmrc of 22, and a root without devEngines', () => {
    expect(lint({ '.nvmrc': '22\n' })).toEqual([
      '.nvmrc:1:1 node-pin Node 22 differs from the devEngines Node 24',
    ]);
    expect(lint({ 'package.json': '{ "private": true }' })).toEqual([
      '.nvmrc:1:1 node-pin Node 22 differs from the devEngines Node undefined',
    ]);
  });
});

describe('rule 9: English only', () => {
  it('rejects Turkish letters in src comments, strings and templates', () => {
    expect(
      lint({
        'packages/x/src/a.ts': `// a${G}\nconst s = 'b${S}';\nconst t = \`\${s}c${G}\`;\n/* d${S} */`,
      }),
    ).toEqual([
      'packages/x/src/a.ts:1:5 english comments are English only',
      'packages/x/src/a.ts:2:13 english strings are English only; use \\u',
      'packages/x/src/a.ts:3:17 english strings are English only; use \\u',
      'packages/x/src/a.ts:4:5 english comments are English only',
    ]);
  });

  it('rejects them in the full text of messages, docs and templates', () => {
    expect(
      lint({
        'packages/server/messages/di.md': `## VIBE9101: Title\n> Hello${G}.\n`,
        'docs/guide/index.md': `a ${S}`,
        'packages/create-vibejs/templates/app/ui/src/App.vibe': `<template>${G}</template>`,
      }),
    ).toEqual([
      'docs/guide/index.md:1:3 english text is English only',
      'packages/create-vibejs/templates/app/ui/src/App.vibe:1:11 english text is English only',
      'packages/server/messages/di.md:2:8 english text is English only',
    ]);
  });

  it('allows test fixtures, \\u escapes, binary files and out-of-scope paths', () => {
    expect(
      lint({
        'packages/x/src/test/fixtures/a.ts': `// a${G}`,
        'docs/test/fixtures/page.md': `a ${S}`,
        'packages/x/src/b.ts': "const s = 'b\\u011F';",
        'docs/logo.png': `\0${G}`,
        'scripts/c.ts': `// a${G}`,
      }),
    ).toEqual([]);
  });
});

// The texts below are assembled at runtime, so that this file never contains what the rules reject.
const cat = (...parts: (string | number)[]): string => parts.join('');
const path = (...parts: string[]): string => parts.join('/');
const address = (user: string, domain: string): string => `${user}@${domain}`;

describe('rule 10: local paths', () => {
  it('rejects machine-local and agent-session paths in any committed file', () => {
    const lines = [
      cat('see ', path('', 'Users', 'someone', 'x')),
      cat('at ', path('', 'home', 'someone', 'x')),
      'C:\\Users\\someone',
      path('', 'private', 'tmp', 'x'),
      cat(path('', 'tmp', 'claude'), '-x'),
      cat('~', path('', '.claude', 'projects')),
      cat('claude-', 501),
      cat('wf', '_bf296917-62a'),
      cat('https://example.com', path('', 'home', 'docs', '')),
    ];
    const message = 'is a local path; use a relative one';
    expect(lint({ 'notes.md': lines.join('\n') })).toEqual([
      `notes.md:1:5 local-path ${path('', 'Users', 'someone', '')} ${message}`,
      `notes.md:2:4 local-path ${path('', 'home', 'someone', '')} ${message}`,
      `notes.md:3:1 local-path C:\\Users\\ ${message}`,
      `notes.md:4:1 local-path ${path('', 'private', 'tmp', '')} ${message}`,
      `notes.md:5:1 local-path ${path('', 'tmp', 'claude')} ${message}`,
      `notes.md:6:3 local-path ${path('.claude', 'projects')} ${message}`,
      `notes.md:7:1 local-path ${cat('claude-', 501)} ${message}`,
      `notes.md:8:1 local-path ${cat('wf', '_bf296917')} ${message}`,
    ]);
  });

  it('skips gitignored and binary files', () => {
    const text = path('', 'Users', 'someone', 'x');
    expect(
      lint({ '.gitignore': 'ignored/\n', 'ignored/a.md': text, 'logo.png': `\0${text}` }),
    ).toEqual([]);
  });
});

describe('rule 11: email addresses', () => {
  it('rejects addresses except no-reply and example domains', () => {
    const lines = [
      address('jane.doe', 'corp.io'),
      address('noreply', 'github.com'),
      address('123+jane', 'users.noreply.github.com'),
      address('dev', 'example.com'),
      address('dev', 'mail.example.org'),
      `contact: ${address('ops', 'company.dev')}`,
      'pnpm@12.14.0 and vibejs@0.1.0',
    ];
    const message = 'email no email addresses; link a GitHub page instead';
    expect(lint({ 'notes.md': lines.join('\n') })).toEqual([
      `notes.md:1:1 ${message}`,
      `notes.md:6:10 ${message}`,
    ]);
  });

  it('skips the deprecation notices that pnpm-lock.yaml copies from the registry', () => {
    const notice = `    deprecated: Contact ${address('jane.doe', 'corp.io')} for support\n`;
    expect(lint({ 'pnpm-lock.yaml': notice })).toEqual([]);
  });

  it('skips the address on the copyright line of forked files and notices only', () => {
    const notice = `// Copyright 2010, Jane <${address('jane', 'corp.io')}>. All rights reserved.\n`;
    const header = '// Upstream: fb55/htmlparser2@abcdef0 src/Tokenizer.ts (MIT)\n';
    expect(
      lint({
        'THIRD-PARTY-NOTICES.md': `fb55/htmlparser2\n${notice}`,
        'src/a.ts': header + notice,
        'src/b.ts': notice,
        'NOTICE.md': `x ${address('jane', 'corp.io')}`,
      }),
    ).toEqual([
      'NOTICE.md:1:3 email no email addresses; link a GitHub page instead',
      'src/b.ts:1:26 email no email addresses; link a GitHub page instead',
    ]);
  });

  it('still reports an address on any other pnpm-lock.yaml line', () => {
    const resolution = `    resolution: {tarball: https://${address('jane.doe', 'corp.io')}/x.tgz}\n`;
    expect(lint({ 'pnpm-lock.yaml': resolution })).toEqual([
      'pnpm-lock.yaml:1:35 email no email addresses; link a GitHub page instead',
    ]);
  });
});

describe('rule 12: positioning', () => {
  const vue = cat('Vu', 'e');
  const nest = cat('Nes', 'tJS');
  const react = cat('Reac', 't');
  /** Each line and the text the rule reports in it. */
  const rejected: [string, string][] = [
    [`A ${vue}-like framework`, `${vue}-like`],
    [`works like ${vue}`, `like ${vue}`],
    [`familiar to ${vue} developers`, `familiar to ${vue}`],
    [`${vue}-compatible API`, `${vue}-compatible`],
    [`${nest}-compatible decorators`, `${nest}-compatible`],
    [`similar to ${nest}`, `similar to ${nest}`],
    [`Differences from ${vue}/${nest}`, `Differences from ${vue}`],
    [`a drop-in replacement for ${vue}`, `drop-in replacement for ${vue}`],
    [`${vue}.js-like syntax`, `${vue}.js-like`],
    [`${vue} 3-style components`, `${vue} 3-style`],
    [`${vue}-esque`, `${vue}-esque`],
    [`Inspired by the ${vue} team`, `Inspired by the ${vue}`],
    [`modeled after ${nest}`, `modeled after ${nest}`],
    [`unlike ${react}`, `unlike ${react}`],
    [cat('an alternative to Nex', 't.js'), cat('alternative to Nex', 't.js')],
    [cat('Soli', 'd-like signals'), cat('Soli', 'd-like')],
    [cat('Expres', 's-style middleware'), cat('Expres', 's-style')],
    [`for ${react} users`, `${react} users`],
    [`// Upstream: owner/repo@abcdef0 src/a.ts (MIT) ${vue}-style`, `${vue}-style`],
  ];
  const allowed = [
    'A view-like layout, not a framework name',
    'Child routes nest like directories',
    'a nest-like structure',
    'components react like this',
    'reactivity-based updates',
    'an alternative to react quickly',
  ];
  const lines = [...rejected.map(([line]) => line), ...allowed].join('\n');

  it('rejects text that describes vibe.js through another framework', () => {
    const message = 'describe vibe.js on its own terms';
    expect(lint({ 'README.md': lines })).toEqual(
      rejected
        .map(
          ([line, match], i) =>
            `README.md:${i + 1}:${line.indexOf(match) + 1} positioning "${match}": ${message}`,
        )
        .toSorted(),
    );
  });

  it('allows migration guides and attribution files', () => {
    expect(
      lint({
        'docs/guides/coming-from-x.md': lines,
        'THIRD-PARTY-NOTICES.md': lines,
        'packages/ui/THIRD-PARTY-NOTICES.md': lines,
      }),
    ).toEqual([]);
  });

  it('rejects package keywords that name another framework', () => {
    const keywords = [vue.toLowerCase(), nest.toLowerCase(), cat('reac', 't-hooks'), 'reactivity'];
    const file = 'packages/ui/package.json';
    const message = 'names another framework';
    expect(
      lint({
        [file]: manifest('ui', { dependencies: { '@vibejs-org/errors': 'workspace:*' }, keywords }),
      }),
    ).toEqual([
      `${file}:1:1 positioning keyword "${nest.toLowerCase()}" ${message}`,
      `${file}:1:1 positioning keyword "${cat('reac', 't-hooks')}" ${message}`,
      `${file}:1:1 positioning keyword "${vue.toLowerCase()}" ${message}`,
    ]);
  });
});

describe('as a script', () => {
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
    process.exitCode = undefined;
  });

  it('lints the real repo and exits 0', async () => {
    errors = [];
    process.argv = ['node', fileURLToPath(new URL('lint-repo.ts', import.meta.url))];
    vi.resetModules();
    await import('./lint-repo.ts');
    expect(errors).toEqual([]);
    expect(process.exitCode).toBe(0);
  });
});
