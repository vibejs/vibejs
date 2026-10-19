// Usage: node scripts/lint-repo.ts
// Enforces the repo rules that oxlint and tsc cannot: coverage hints, __DEV__ and decorator scope,
// dependency specs, tsconfig references, manifests, Upstream headers, the Node pin, English-only
// text, and public-text hygiene (local paths, email addresses, positioning). Prints one
// `file:line:col rule message` line per finding and exits 1 when there is any. Rules 10-12 scan
// the files git would commit (tracked, or untracked and not ignored); the others glob the tree.
import { execFileSync } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync, type Comment } from 'oxc-parser';

/** The repository of every published manifest (docs/decisions/0005). */
const REPO_URL = 'git+https://github.com/vibejs/vibejs.git';
const NODE_RANGE = '^24.15.0 || >=26';
/** The 8 npm packages of CONTRACTS C1: exactly these manifests are not private. */
const PUBLISHED = [
  '@vibejs-org/cli',
  '@vibejs-org/compiler',
  '@vibejs-org/contract',
  '@vibejs-org/errors',
  '@vibejs-org/language-tools',
  '@vibejs-org/server',
  '@vibejs-org/ui',
  'create-vibejs',
];
/** Turkish-specific letters (rule 9), escaped so that this file stays ASCII. */
export const TURKISH = /[\u011F\u011E\u0131\u015F\u015E\u0130\u00E7\u00C7\u00F6\u00D6\u00FC\u00DC]/;
const SPECS = ['catalog:', 'catalog:ts-next', 'catalog:peers', 'workspace:*'];
const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;
/** The C10 consumers of `catalog:ts-next`. */
const TS_NEXT = /^(?:packages\/(?:language-tools|vscode|cli)|examples\/[^/]+|docs)\/package\.json$/;
/** Server tsconfigs, the only ones that may enable legacy decorators (C10). */
const SERVER_TSCONFIG =
  /^(?:packages\/server|examples\/[^/]+\/server|packages\/create-vibejs\/templates\/[^/]+\/server)\/tsconfig\.json$/;
/** Server source, the only place for decorator nodes (C10). */
const SERVER_SRC =
  /^(?:packages\/server\/src|examples\/[^/]+\/server|packages\/create-vibejs\/templates\/[^/]+\/server)\//;
/** Global objects through which `__DEV__` would escape the ui dist rewrite (rule 2). */
const GLOBALS = /^(?:globalThis|window|self|global)$/;
// The hint patterns of the coverage remapper (ast-v8-to-istanbul). It honors if/else/next/file in
// comments, and start/stop anywhere on a raw source line, strings and prose included.
const HINT = /^\s*(?:istanbul|[cv]8|node:coverage)\s+ignore\b/;
const START_STOP = /(?:istanbul|[cv]8|node:coverage)\s+ignore\s+(?:start|stop)(?=\W|$)/;
const VALID_HINT = /^ v8 ignore (next|if|else|start|stop) -- @preserve (\S(?:.*\S)?) $/;
const UPSTREAM = /^ Upstream: ([\w.-]+\/[\w.-]+)@[0-9a-f]{7,40} \S+ \([^()]+\)$/;
/** Generated, installed or out-of-scope trees. */
const IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.tsbuild/**',
  '**/test/fixtures/**',
  '.git/**',
  '.e2e/**',
  '.vitest/**',
  'coverage/**',
];
// Rules 10-12 match text that must never be committed. Each pattern is written so that its own
// source text does not match it.
/** Rule 10: machine-local and agent-session paths. */
const LOCAL_PATH = new RegExp(
  [
    String.raw`(?<![\w.-])\/(?:Users|home)\/[^/\s]+\/`,
    String.raw`\b[A-Za-z]:\\Users\\`,
    String.raw`\/private\/tmp\/`,
    String.raw`\/tmp\/claude`,
    String.raw`\.claude\/projects`,
    String.raw`\bclaude-\d{3,}\b`,
    String.raw`\bwf_[0-9a-f]{6,}`,
  ].join('|'),
  'g',
);
/** Rule 11: email addresses, except no-reply and reserved example domains. */
const EMAIL = /[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
const ALLOWED_EMAIL =
  /^no-?reply@|@users\.noreply\.github\.com$|@(?:[\w-]+\.)*example\.(?:com|org|net)$/i;
/** Rule 12: text that describes vibe.js through another framework. */
// Names are matched case-sensitively, so that prose such as "nest", "react" or "solid" passes.
const FRAMEWORK =
  String.raw`(?:Vue(?:\.?js)?|NestJS|Nest\.js|React(?:\.js)?|Angular(?:JS)?|Svelte(?:Kit)?|` +
  String.raw`Solid(?:JS|\.js)?|Preact|Nuxt(?:\.js)?|Next\.js|Qwik|Ember(?:\.js)?|` +
  String.raw`Express(?:\.js)?|Fastify|Hono|Lit|Alpine(?:\.js)?)(?: ?\d+(?:\.\d+|\.x)*)?`;
/** Matches `word` with either case of its first letter. */
const initial = (word: string): string => `[${word[0]}${word[0].toUpperCase()}]${word.slice(1)}`;
const BEFORE = [
  'like',
  'unlike',
  'similar to',
  'compared to',
  'compared with',
  'vs\\.?',
  'versus',
  'modell?ed after',
  'borrows? from',
  'drop-in replacement for',
  'replacement for',
  'familiar to',
  'coming from',
  'differences from',
  'inspired by',
  'alternative to',
  'port of',
  'clone of',
]
  .map(initial)
  .join('|');
const AFTER = 'compatible|flavou?red|ish|esque|like|styled?|inspired|based|clone';
const POSITIONING = new RegExp(
  [
    String.raw`\b(?:${BEFORE}) (?:the )?${FRAMEWORK}\b`,
    String.raw`\b${FRAMEWORK}[- ](?:${AFTER})\b`,
    String.raw`\b${FRAMEWORK}(?:\/${FRAMEWORK})* (?:developers|users)\b`,
  ].join('|'),
  'g',
);
/** Rule 12: package keywords that tie the npm listing to another framework. */
const FRAMEWORK_KEYWORD =
  /^(?:vue|nest|react|angular|svelte|solid|preact|nuxt|next|qwik|ember|express|fastify|hono|lit|alpine)(?:\.?js)?(?![a-z])/i;
/**
 * Rule 12 exceptions: migration guides, and attribution files, whose text names upstream
 * projects by design.
 */
const POSITIONING_FILES = /^docs\/guides\/coming-from-[^/]+\.md$|(?:^|\/)THIRD-PARTY-NOTICES\.md$/;

// A type alias, not an interface, so that it is assignable to Record<string, unknown>.
type AstNode = { type: string; start: number; end: number };
type Hint = { file: string; reason: string };

interface Manifest {
  name: string;
  private?: boolean;
  type?: string;
  sideEffects?: unknown;
  license?: string;
  keywords?: string[];
  engines?: { node?: string };
  files?: unknown;
  repository?: { url?: string; directory?: string };
  publishConfig?: { access?: string };
  devEngines?: { runtime?: { version?: string } };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const isNode = (value: unknown): value is AstNode =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';
const same = (a: Hint, b: Hint): boolean => a.file === b.file && a.reason === b.reason;
const major = (version = ''): string | undefined => /\d+/.exec(version)?.[0];

/** Lints the repo at `root`, prints the findings and returns the exit code. */
export function main(root: string): number {
  const findings: string[] = [];
  const read = (file: string): string => readFileSync(join(root, file), 'utf8');
  const exists = (file: string): boolean => glob(file).length > 0;
  function glob(pattern: string | string[]): string[] {
    return globSync(pattern, { cwd: root, exclude: IGNORE, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll('\\', '/'));
  }
  const report = (file: string, text: string, offset: number, rule: string, message: string) => {
    const lines = text.slice(0, offset).split('\n');
    findings.push(`${file}:${lines.length}:${lines.at(-1)!.length + 1} ${rule} ${message}`);
  };
  const reportFile = (file: string, rule: string, message: string) =>
    report(file, '', 0, rule, message);

  // Code: rules 1, 2, 3 (decorator nodes), 7 and 9 (src comments and literals).
  const hints: (Hint & { text: string; offset: number })[] = [];
  for (const file of glob('**/*.{ts,mts,cts,js,mjs,cjs}')) {
    const text = read(file);
    // No ParenthesizedExpression nodes, so that `(() => {})()` has the function as its callee.
    const { program, comments } = parseSync(file, text, { preserveParens: false });
    const at = (offset: number, rule: string, message: string) =>
      report(file, text, offset, rule, message);
    const english = /^packages\/[^/]+\/src\/.*\.ts$/.test(file);

    const headers = comments.filter((c) => c.type === 'Line' && /^\s*Upstream:/.test(c.value));
    const noticesFile = `${/^packages\/[^/]+\//.exec(file)?.[0] ?? ''}THIRD-PARTY-NOTICES.md`;
    const notices = exists(noticesFile) ? read(noticesFile) : '';
    for (const header of headers) {
      const repo = UPSTREAM.exec(header.value)?.[1];
      if (repo === undefined) {
        at(header.start, 'upstream', 'use `// Upstream: <repo>@<sha> <path> (<license>)`');
      } else if (!notices.includes(repo)) {
        at(header.start, 'upstream', `${repo} is not listed in ${noticesFile}`);
      }
    }

    let open: Comment | undefined;
    const hintLines = new Set<number>(); // line starts of start/stop hint comments
    for (const comment of comments) {
      const letter = TURKISH.exec(comment.value);
      if (english && letter) {
        at(comment.start + 2 + letter.index, 'english', 'comments are English only');
      }
      // The remapper strips the `/**` of a doc comment before matching.
      const value = comment.type === 'Block' ? comment.value.replace(/^\*/, '') : comment.value;
      if (!HINT.test(value)) continue;
      if (START_STOP.test(value)) hintLines.add(text.lastIndexOf('\n', comment.start) + 1);
      const match = comment.type === 'Block' ? VALID_HINT.exec(comment.value) : null;
      if (!match) {
        at(
          comment.start,
          'coverage-hint',
          'only `/* v8 ignore next|if|else|start|stop -- @preserve <reason> */` is allowed',
        );
        continue;
      }
      const [, kind, reason] = match;
      if (kind === 'start') {
        if (open) at(comment.start, 'coverage-hint', 'an ignore-start hint is already open');
        open = comment;
      } else if (kind === 'stop') {
        if (!open) at(comment.start, 'coverage-hint', 'an ignore-stop hint has no start');
        open = undefined;
      }
      if (headers.length && !reason.startsWith('upstream-defensive:')) {
        at(comment.start, 'coverage-hint', 'forked upstream code uses upstream-defensive: reasons');
      }
      hints.push({ file, reason, text, offset: comment.start });
    }
    if (open) at(open.start, 'coverage-hint', 'an ignore-start hint has no stop');
    let lineStart = 0;
    for (const line of text.split('\n')) {
      const match = START_STOP.exec(line);
      if (match && !hintLines.has(lineStart)) {
        at(lineStart + match.index, 'coverage-hint', 'this text turns coverage off; reword it');
      }
      lineStart += line.length + 1;
    }

    const server = SERVER_SRC.test(file);
    const ui = file.startsWith('packages/ui/src/');
    const walk = (
      node: AstNode,
      parent: Record<string, unknown> | undefined,
      inFunction: boolean,
    ): void => {
      const fields: Record<string, unknown> = node;
      if (node.type === 'Decorator' && !server) {
        at(node.start, 'decorators', 'decorators are allowed only in packages/server/src');
      }
      const named =
        parent !== undefined &&
        (parent.id === node ||
          ((parent.property === node || parent.key === node) && parent.computed !== true));
      if (node.type === 'Identifier' && fields.name === '__DEV__' && !named) {
        if (!ui) at(node.start, 'dev-global', '__DEV__ is read only in packages/ui/src');
        else if (!inFunction) at(node.start, 'dev-global', 'read __DEV__ inside function bodies');
      }
      // The ui dist rewrites only the bare identifier; a setup file may still assign the global.
      const member = fields as {
        object?: { name?: unknown };
        property?: AstNode & { name?: unknown };
      };
      if (
        node.type === 'MemberExpression' &&
        fields.computed === false &&
        member.property?.name === '__DEV__' &&
        GLOBALS.test(String(member.object?.name)) &&
        !(parent?.type === 'AssignmentExpression' && parent.left === node)
      ) {
        at(member.property.start, 'dev-global', 'read the bare __DEV__ global');
      }
      const string =
        (node.type === 'Literal' && typeof fields.value === 'string') ||
        node.type === 'TemplateElement';
      const letter = english && string ? TURKISH.exec(text.slice(node.start, node.end)) : null;
      if (letter) at(node.start + letter.index, 'english', 'strings are English only; use \\u');
      // Only a function body runs later; params and the body of an IIFE run where they stand.
      const deferred =
        node.type.includes('Function') &&
        !(parent?.type === 'CallExpression' && parent.callee === node);
      for (const [key, value] of Object.entries(fields)) {
        const inner = inFunction || (deferred && key === 'body');
        for (const child of [value].flat()) if (isNode(child)) walk(child, fields, inner);
      }
    };
    walk(program, undefined, false);
  }

  // Rule 1: every hint has an allowlist entry, and every entry still has a hint.
  const allowed: Hint[] = JSON.parse(read('coverage-ignores.json'));
  for (const hint of hints.filter((h) => !allowed.some((entry) => same(entry, h)))) {
    report(hint.file, hint.text, hint.offset, 'coverage-hint', 'add it to coverage-ignores.json');
  }
  for (const entry of allowed.filter((e) => !hints.some((hint) => same(e, hint)))) {
    reportFile('coverage-ignores.json', 'coverage-hint', `stale entry ${JSON.stringify(entry)}`);
  }

  // Rule 3: tsconfig flags.
  for (const file of glob('**/tsconfig*.json')) {
    const text = read(file);
    for (const match of text.matchAll(/"(experimental|emit)Decorator\w*"\s*:\s*true/g)) {
      if (match[1] === 'emit') {
        report(file, text, match.index, 'decorators', 'emitDecoratorMetadata is allowed nowhere');
      } else if (!SERVER_TSCONFIG.test(file)) {
        report(file, text, match.index, 'decorators', 'experimentalDecorators is for servers only');
      }
    }
  }

  // Rules 4, 5 and 6: workspace manifests.
  const manifests = new Map<string, Manifest>(
    glob([
      'package.json',
      'packages/*/package.json',
      'examples/*/package.json',
      'docs/package.json',
    ])
      .toSorted()
      .map((file) => [file, JSON.parse(read(file))]),
  );
  const dirOf = new Map([...manifests].map(([file, pkg]) => [pkg.name, posix.dirname(file)]));
  const rootLicense = readFileSync(join(root, 'LICENSE'));
  for (const [file, pkg] of manifests) {
    const dir = posix.dirname(file);
    for (const field of DEP_FIELDS) {
      for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
        if (!SPECS.includes(spec)) {
          reportFile(file, 'dep-spec', `${field}.${name} is "${spec}"; use ${SPECS.join(', ')}`);
        } else if (spec === 'catalog:ts-next' && !TS_NEXT.test(file)) {
          reportFile(file, 'dep-spec', `${field}.${name}: catalog:ts-next is for C10 consumers`);
        } else if (spec === 'catalog:peers' && field !== 'peerDependencies') {
          reportFile(file, 'dep-spec', `${field}.${name}: catalog:peers is for peerDependencies`);
        }
      }
    }

    // An example consumes its workspace dependencies' dist, so it references only its own projects.
    if (dir !== '.' && !dir.startsWith('examples/')) {
      const workspaceDeps = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
        .filter(([, spec]) => spec.startsWith('workspace:'))
        .map(([name]) => posix.relative(dir, dirOf.get(name)!));
      const tsconfig = `${dir}/tsconfig.json`;
      const references: { path: string }[] = exists(tsconfig)
        ? (JSON.parse(read(tsconfig)).references ?? [])
        : [];
      const paths = references.map((ref) =>
        posix.normalize(ref.path).replace(/\/tsconfig\.json$/, ''),
      );
      for (const dep of workspaceDeps.filter((d) => !paths.includes(d))) {
        reportFile(tsconfig, 'references', `add { "path": "${dep}" } (a workspace dependency)`);
      }
      for (const path of paths.filter((p) => !workspaceDeps.includes(p))) {
        reportFile(tsconfig, 'references', `${path} is not a workspace dependency`);
      }
    }

    for (const keyword of pkg.keywords ?? []) {
      if (FRAMEWORK_KEYWORD.test(keyword)) {
        reportFile(file, 'positioning', `keyword "${keyword}" names another framework`);
      }
    }

    if (pkg.private === true) continue;
    const license = `${dir}/LICENSE`;
    const rules: [boolean, string][] = [
      [PUBLISHED.includes(pkg.name), `${pkg.name} is not a C1 package; set "private": true`],
      [pkg.type === 'module', 'type must be "module"'],
      [pkg.sideEffects === false, 'sideEffects must be false'],
      [pkg.license === 'MIT', 'license must be "MIT"'],
      [pkg.engines?.node === NODE_RANGE, `engines.node must be "${NODE_RANGE}"`],
      [Array.isArray(pkg.files) && pkg.files.length > 0, 'files must list what is published'],
      [pkg.repository?.url === REPO_URL, `repository.url must be "${REPO_URL}"`],
      [pkg.repository?.directory === dir, `repository.directory must be "${dir}"`],
      [pkg.publishConfig?.access === 'public', 'publishConfig.access must be "public"'],
      [
        exists(license) && readFileSync(join(root, license)).equals(rootLicense),
        `${license} must be a byte-identical copy of the root LICENSE`,
      ],
    ];
    for (const [ok, message] of rules) if (!ok) reportFile(file, 'manifest', message);
  }
  const published = [...manifests.values()].filter((pkg) => pkg.private !== true);
  for (const name of PUBLISHED.filter((n) => !published.some((pkg) => pkg.name === n))) {
    reportFile('package.json', 'manifest', `C1 package ${name} has no public manifest`);
  }

  // Rule 8: the Node pin.
  const nvmrc = major(read('.nvmrc'));
  const engine = major(manifests.get('package.json')?.devEngines?.runtime?.version);
  if (nvmrc !== engine) {
    reportFile('.nvmrc', 'node-pin', `Node ${nvmrc} differs from the devEngines Node ${engine}`);
  }

  // Rule 9: the full text of messages, docs and templates.
  for (const file of glob([
    'packages/*/messages/**',
    'docs/**',
    'packages/create-vibejs/templates/**',
  ])) {
    const text = read(file);
    if (text.includes('\0')) continue; // A NUL byte marks a binary file.
    for (const match of text.matchAll(new RegExp(TURKISH, 'g'))) {
      report(file, text, match.index, 'english', 'text is English only');
    }
  }

  // Rules 10, 11 and 12: public text in every file git would commit.
  const committed = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => file !== '' && existsSync(join(root, file)));
  for (const file of committed) {
    const text = read(file);
    if (text.includes('\0')) continue;
    for (const match of text.matchAll(LOCAL_PATH)) {
      report(
        file,
        text,
        match.index,
        'local-path',
        `${match[0]} is a local path; use a relative one`,
      );
    }
    for (const match of text.matchAll(EMAIL)) {
      if (ALLOWED_EMAIL.test(match[0])) continue;
      // The lockfile copies registry deprecation notices verbatim, maintainer addresses included.
      const line = text.slice(text.lastIndexOf('\n', match.index) + 1, match.index);
      if (file === 'pnpm-lock.yaml' && /^\s+deprecated: /.test(line)) continue;
      // Forked files and notices keep upstream license notices verbatim, addresses included.
      const notice = text.startsWith('// Upstream: ') || file.endsWith('THIRD-PARTY-NOTICES.md');
      if (notice && /\bCopyright\b/.test(line)) continue;
      report(file, text, match.index, 'email', 'no email addresses; link a GitHub page instead');
    }
    if (POSITIONING_FILES.test(file)) continue;
    for (const match of text.matchAll(POSITIONING)) {
      report(
        file,
        text,
        match.index,
        'positioning',
        `"${match[0]}": describe vibe.js on its own terms`,
      );
    }
  }

  for (const finding of findings.toSorted()) console.error(finding);
  return findings.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(fileURLToPath(new URL('..', import.meta.url)));
}
