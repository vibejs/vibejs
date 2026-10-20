import { vibeError } from '../errors.gen.ts';
import { envelopeError } from '../output.ts';
import {
  appModuleImports,
  contractsObject,
  register,
  routesArray,
  type Target,
} from './register.ts';
import { files, pageRoute } from './templates.ts';

export type GeneratorKind = 'resource' | 'component' | 'page';
export const KINDS: readonly GeneratorKind[] = ['resource', 'component', 'page'];

export type FileOp =
  | { op: 'create'; path: string; content?: string }
  | { op: 'update'; path: string; reason: string; content?: string }
  | { op: 'skip'; path: string; reason: 'identical' | 'registered' }
  | { op: 'conflict'; path: string }
  | { op: 'manual'; path: string; code: 'VIBE8402'; instruction: string };

/** The names a generator derives everything from: `users`/`user`, `UserCard`, `UsersPage`. */
export interface Names {
  name: string;
  singular: string;
}

const RESERVED = new Set(
  `await break case catch class const continue debugger default delete do else enum export extends
  false finally for function if implements import in instanceof interface let new null package
  private protected public return static super switch this throw true try typeof var void while
  with yield`.split(/\s+/),
);

const PATTERN: Record<GeneratorKind, [RegExp, string, string]> = {
  resource: [/^[a-z][A-Za-z0-9]*$/, 'a camelCase identifier such as `users`', 'users'],
  component: [/^[A-Z][A-Za-z0-9]*$/, 'a PascalCase identifier such as `UserCard`', 'UserCard'],
  page: [/^[A-Z][A-Za-z0-9]*$/, 'a PascalCase identifier such as `Users`', 'Users'],
};

/** One rule: `categories` → `category`, `boxes` → `box`, `houses` → `house`, `glass` stays. */
const singularOf = (name: string) =>
  name.replace(/(?:ies|(?<=[xz]|ch|sh|ss)es|(?<!s)s)$/, (end) => (end === 'ies' ? 'y' : ''));

/** Reserved words and names the generated code uses itself, so a generated file would not compile. */
const TAKEN: Record<GeneratorKind, Set<string>> = {
  resource: new Set([
    ...RESERVED,
    ...`app arguments client contracts createClient ctx defineContract del eval expect get inject it
    patch post setup v`.split(/\s+/),
  ]),
  component: RESERVED,
  page: new Set([...RESERVED, 'Page']),
};
/** Singulars whose PascalCase form the controller imports already. */
const TAKEN_SINGULAR = new Set(['controller', 'ctx', 'handle']);

/** The `expected` text of VIBE8403 when `word` is not a valid `kind` name. */
function invalid(kind: GeneratorKind, word: string, taken = TAKEN[kind]): string | undefined {
  const [pattern, expected, example] = PATTERN[kind];
  if (!pattern.test(word)) return expected;
  if (taken.has(word))
    return `a name that is not a reserved word or used by the generated code, such as \`${example}\``;
  return undefined;
}

const valid = (kind: GeneratorKind, name: string) =>
  !invalid(kind, name) && (kind !== 'resource' || !invalid(kind, singularOf(name), TAKEN_SINGULAR));

/** A valid name close to `name`: `my-thing` → `myThing`, `userCard` → `UserCard`. */
export function fixName(kind: GeneratorKind, name: string): string {
  const words = name.replace(/^[^A-Za-z]+/, '').split(/[^A-Za-z0-9]+/);
  const camel = words.map((w, i) => (i ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join('');
  const fixed =
    kind === 'resource'
      ? camel.charAt(0).toLowerCase() + camel.slice(1)
      : camel.charAt(0).toUpperCase() + camel.slice(1);
  return valid(kind, fixed) ? fixed : PATTERN[kind][2];
}

/** The names of a `kind` called `name`; throws VIBE8403 for an invalid name. `singular` is for resources only. */
export function names(kind: GeneratorKind, name: string, singular?: string): Names {
  const fail = (value: string, expected: string) =>
    vibeError('VIBE8403', { name: value, kind, expected });
  const expected = invalid(kind, name);
  if (expected) throw fail(name, expected);
  if (kind === 'resource') {
    const one = singular ?? singularOf(name);
    const wrong = invalid(kind, one, TAKEN_SINGULAR);
    if (wrong && singular !== undefined) throw fail(singular, wrong);
    if (wrong) throw fail(name, 'a name with a valid singular, or `--singular <word>`');
    return { name, singular: one };
  }
  const full = kind === 'page' && !name.endsWith('Page') ? `${name}Page` : name;
  return { name: full, singular: full };
}

/** Where each kind registers its code, and what it adds. */
function targets(kind: GeneratorKind, { name }: Names): [path: string, Target][] {
  if (kind === 'component') return [];
  if (kind === 'page') {
    const { path } = pageRoute(name);
    const element = `{ path: '${path}', component: () => import('./pages/${name}.vibe') }`;
    const instruction = `add \`${element}\` to the \`defineRoutes([...])\` array`;
    return [
      ['ui/src/routes.ts', { element, key: path, find: routesArray, multiline: true, instruction }],
    ];
  }
  const module = `${name.charAt(0).toUpperCase()}${name.slice(1)}Module`;
  const moduleImport = `import { ${module} } from './${name}/${name}.module.ts';`;
  const contractImport = `import { ${name} } from '../../contracts/src/${name}.contract.ts';`;
  return [
    [
      'server/src/app.module.ts',
      {
        import: moduleImport,
        element: module,
        key: module,
        find: appModuleImports,
        instruction: `add \`${moduleImport}\` and \`${module}\` to the \`imports\` of \`@Module\` on \`AppModule\``,
      },
    ],
    [
      'ui/src/api.ts',
      {
        import: contractImport,
        element: name,
        key: name,
        find: contractsObject,
        instruction: `add \`${contractImport}\` and \`${name}\` to the \`const contracts = {...}\` object`,
      },
    ],
  ];
}

/** Pure: what generating `kind` with `n` does to the files that `read` returns. */
export function plan(
  kind: GeneratorKind,
  n: Names,
  read: (path: string) => string | undefined,
): FileOp[] {
  const ops: FileOp[] = Object.entries(files(kind, n)).map(([path, content]) => {
    const current = read(path);
    if (current === undefined) return { op: 'create', path, content };
    return current === content
      ? { op: 'skip', path, reason: 'identical' }
      : { op: 'conflict', path };
  });
  for (const [path, target] of targets(kind, n)) {
    const text = read(path);
    const r = text === undefined ? { manual: target.instruction } : register(text, target);
    if ('text' in r) ops.push({ op: 'update', path, reason: 'register', content: r.text });
    else if ('registered' in r) ops.push({ op: 'skip', path, reason: 'registered' });
    else {
      const what = target.element;
      const { message } = envelopeError(
        vibeError('VIBE8402', { what, path, instruction: r.manual }),
      );
      ops.push({ op: 'manual', path, code: 'VIBE8402', instruction: message });
    }
  }
  return ops;
}
