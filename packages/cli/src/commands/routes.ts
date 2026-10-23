import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { VibeError } from '@usevibejs/errors';
import type { AppInspection } from '@usevibejs/server';
import { parseSync, type ArrayExpression, type Expression, type Program } from 'oxc-parser';
import type { CommandDef } from '../command.ts';
import { loadAppModule, loadError, withServerRunner } from '../dev/app-module.ts';
import { vibeError } from '../errors.gen.ts';
import { nameOf, routesArray } from '../generate/register.ts';
import { envelopeError, type JsonEnvelope, type MissingInput } from '../output.ts';
import { fullstackRoot } from '../project.ts';

export interface UiRoute {
  /** Full path, joined with the parent paths. */
  path: string;
  name?: string;
  /** Root-relative file of the page (`ui/src/pages/HomePage.vibe`) for an imported identifier or `() => import('...')`. */
  component?: string;
  /** A string literal redirect. */
  redirect?: string;
  /** Fields whose value is not a literal (e.g. `['component', 'redirect']`); their values are omitted. */
  dynamic?: string[];
}

export interface RoutesResult extends JsonEnvelope {
  /** Absent with `--kind ui`; `[]` on error. */
  api?: AppInspection['routes'];
  /** Absent with `--kind api`; `[]` on error. */
  ui?: UiRoute[];
}

const ROUTES = 'ui/src/routes.ts';
const KINDS = ['api', 'ui'];

/** The string value of a literal, else undefined. */
const string = (node: Expression) =>
  node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;

/** A child path joined to its parent's, as the router does. */
const joinPath = (parent: string | undefined, path: string) =>
  parent === undefined || path.startsWith('/')
    ? path
    : path
      ? `${parent.replace(/\/$/, '')}/${path}`
      : parent;

/** The UI routes of `ui/src/routes.ts`, depth-first in source order, or VIBE8504. */
export function uiRoutes(text: string): UiRoute[] | VibeError {
  const { program, errors } = parseSync('routes.ts', text, { lang: 'ts', sourceType: 'module' });
  if (errors.length) {
    const lines = text.slice(0, errors[0].labels[0].start).split('\n');
    const at = `${lines.length}:${lines.at(-1)!.length + 1}`;
    return vibeError('VIBE8504', { reason: `${errors[0].message} at ${at}` });
  }
  const array = routesArray(program);
  if (array?.type !== 'ArrayExpression') {
    return vibeError('VIBE8504', { reason: 'no `defineRoutes([...])` with an array literal' });
  }
  const out: UiRoute[] = [];
  walk(array, undefined, imports(program), text, out);
  return out;
}

/** Local import names and their root-relative files, for relative specifiers. */
function imports(program: Program): Map<string, string> {
  const files = new Map<string, string>();
  for (const s of program.body) {
    if (s.type !== 'ImportDeclaration' || !s.source.value.startsWith('.')) continue;
    for (const x of s.specifiers) files.set(x.local.name, posix.join('ui/src', s.source.value));
  }
  return files;
}

/** The file of `Page` (imported) or `() => import('./Page.vibe')`. */
function componentFile(node: Expression, files: Map<string, string>): string | undefined {
  if (node.type === 'Identifier') return files.get(node.name);
  if (node.type !== 'ArrowFunctionExpression' || node.body.type !== 'ImportExpression')
    return undefined;
  const source = string(node.body.source);
  return source?.startsWith('.') ? posix.join('ui/src', source) : undefined;
}

function walk(
  array: ArrayExpression,
  parent: string | undefined,
  files: Map<string, string>,
  text: string,
  out: UiRoute[],
): void {
  for (const element of array.elements) {
    if (element === null) continue;
    if (element.type !== 'ObjectExpression') {
      out.push({ path: text.slice(element.start, element.end), dynamic: ['path'] });
      continue;
    }
    const dynamic: string[] = [];
    /** `value`, or undefined after adding `key` to `dynamic`. */
    const literal = (key: string, value: string | undefined) => {
      if (value === undefined) dynamic.push(key);
      return value;
    };
    let path: string | undefined;
    let name, component, redirect, children: ArrayExpression | undefined;
    for (const p of element.properties) {
      if (p.type !== 'Property') continue;
      const value = p.value;
      const key = nameOf(p);
      if (key === 'path') path = literal(key, string(value)) ?? text.slice(value.start, value.end);
      else if (key === 'name') name = literal(key, string(value));
      else if (key === 'redirect') redirect = literal(key, string(value));
      else if (key === 'component') component = literal(key, componentFile(value, files));
      else if (key === 'children' && value.type === 'ArrayExpression') children = value;
      else if (key === 'children') dynamic.push(key);
    }
    // A spread can set `path`, and a record without one has none to read.
    const spread = element.properties.some((p) => p.type !== 'Property');
    if ((path === undefined || spread) && !dynamic.includes('path')) dynamic.push('path');
    path = joinPath(parent, path ?? '');
    const route: UiRoute = { path, name, component, redirect, dynamic };
    // Without the absent fields, so a route reads the same as JSON and in a snapshot.
    for (const field of ['name', 'component', 'redirect'] as const)
      if (route[field] === undefined) delete route[field];
    if (!dynamic.length) delete route.dynamic;
    out.push(route);
    if (children) walk(children, path, files, text, out);
  }
}

/** Rows with padded columns, each line indented. */
const table = (rows: string[][]) => {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  return rows.map((row) =>
    `  ${row.map((cell, i) => cell.padEnd(widths[i])).join('  ')}`.trimEnd(),
  );
};

function apiText(api: NonNullable<RoutesResult['api']>): string[] {
  if (!api.length) return ['API', '  No routes.'];
  const lines = table(api.map((r) => [r.method, r.path, `→ ${r.handler}`]));
  return [
    'API',
    ...api.flatMap((r, i) => [
      lines[i],
      ...(['guards', 'interceptors', 'filters'] as const)
        .filter((kind) => r[kind].length)
        .map((kind) => `    ${kind}: ${r[kind].join(', ')}`),
    ]),
  ];
}

function uiText(ui: UiRoute[]): string[] {
  if (!ui.length) return ['UI', '  No routes.'];
  return [
    'UI',
    ...table(ui.map((r) => [r.path, r.name ?? '-', `→ ${r.component ?? r.redirect ?? '-'}`])),
  ];
}

export const routes: CommandDef<RoutesResult> = {
  name: 'routes',
  summary: 'List the API routes and the UI routes, without starting a server or running UI code.',
  usage: 'vibejs routes [--kind api|ui]',
  examples: ['vibejs routes', 'vibejs routes --kind api'],
  options: {
    kind: { type: 'string', description: 'Only the api or the ui routes.' },
  },
  positionals: [],
  async run({ values }, ctx) {
    const kind = typeof values.kind === 'string' ? values.kind : undefined;
    const want = (k: string) => kind === undefined || kind === k;
    const empty = { api: want('api') ? [] : undefined, ui: want('ui') ? [] : undefined };
    const base = { ok: true, command: 'routes', version: ctx.version };
    const failed = (e: VibeError, missing?: MissingInput[]): RoutesResult => ({
      ...base,
      ok: false,
      next: missing?.map((m) => m.example),
      error: envelopeError(e, missing),
      ...empty,
    });
    if (kind !== undefined && !KINDS.includes(kind)) {
      const e = vibeError('VIBE8004', { name: `--kind ${kind}` });
      const example = 'vibejs routes --kind api';
      // Neither kind is known, so both lists are there, empty.
      return {
        ...failed(e, [{ name: 'kind', flag: '--kind', values: KINDS, example }]),
        api: [],
        ui: [],
      };
    }
    const root = fullstackRoot(ctx.cwd, 'routes');
    if (typeof root !== 'string') return failed(root);
    const file = join(root, ROUTES);
    const ui = !want('ui')
      ? undefined
      : existsSync(file)
        ? uiRoutes(readFileSync(file, 'utf8'))
        : [];
    if (ui instanceof Error) return failed(ui);
    let api: RoutesResult['api'];
    if (want('api')) {
      try {
        api = await withServerRunner(root, async (runner) => {
          const { server, AppModule, appOptions } = await loadAppModule(runner, root);
          return server.inspect(AppModule, appOptions).routes;
        });
      } catch (error) {
        return failed(loadError(error));
      }
    }
    return { ...base, api, ui };
  },
  human: (r) => [...(r.api ? apiText(r.api) : []), ...(r.ui ? uiText(r.ui) : [])].join('\n'),
};
