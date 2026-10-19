import { vibeError } from '../errors.gen.ts';
import { warn } from '../warn.ts';
import { buildPath, comparePaths, matchPath, parsePath, type PathParser } from './path.ts';
import type {
  AnyGuard,
  AnyParams,
  AnyParamsRaw,
  RouteMeta,
  RouteRecordNormalized,
  RouteRecordRaw,
} from './types.ts';

export interface MatchedRoute {
  name: string | undefined;
  params: AnyParams;
  matched: readonly RouteRecordNormalized[];
  meta: RouteMeta;
}

export interface Matcher {
  /** Matches an encoded path; no match warns VIBE7106 and gives `matched: []`. */
  resolvePath(path: string): MatchedRoute;
  /** Throws VIBE7105 for an unknown name. */
  resolveName(name: string, params: AnyParamsRaw): MatchedRoute & { path: string };
  /** Every record, in match order. */
  readonly routes: readonly RouteRecordNormalized[];
}

/** Options that are not supported, with what to do instead. */
const DEFERRED: Record<string, string> = {
  components: 'named views are not supported; nest child routes, each with one component',
  alias: 'aliases are not supported; add a route that redirects to this one',
  props: 'route props are not available yet; read the params from the route location',
  sensitive: 'paths always match case-insensitively',
  strict: 'a trailing slash is always optional',
  end: 'paths always match to their end',
  scrollBehavior: 'scroll behavior is not available yet',
  linkActiveClass: 'the active classes of links are not configurable yet',
  linkExactActiveClass: 'the active classes of links are not configurable yet',
  parseQuery: 'queries are always parsed with URLSearchParams',
  stringifyQuery: 'queries are always written with URLSearchParams',
};
const RECORD_KEYS = ['path', 'name', 'component', 'children', 'redirect', 'meta', 'beforeEnter'];

/** Throws VIBE7103 for the first key of `options` that is not in `allowed`. */
export function checkOptions(options: object, allowed: readonly string[], where: string): void {
  const option = Object.keys(options).find((key) => !allowed.includes(key));
  if (option !== undefined) {
    const deferral = Object.hasOwn(DEFERRED, option)
      ? DEFERRED[option]
      : 'it is not a known option';
    throw vibeError('VIBE7103', { option, where, deferral });
  }
}

/** Guards return a result instead of calling a third `next` argument (VIBE7107). */
export function checkGuard(guard: AnyGuard): void {
  if (guard.length >= 3) {
    throw vibeError('VIBE7107', { guard: guard.name || 'anonymous', count: guard.length });
  }
}

function located(record: RouteRecordNormalized | undefined, params: AnyParams): MatchedRoute {
  const matched: RouteRecordNormalized[] = [];
  for (let r = record; r; r = r.parent) matched.unshift(r);
  const meta: RouteMeta = Object.assign({}, ...matched.map((r) => r.meta));
  return { name: record?.name, params, matched, meta };
}

export function createMatcher(routes: readonly RouteRecordRaw[]): Matcher {
  const entries: { record: RouteRecordNormalized; parser: PathParser }[] = [];
  const names = new Map<string, (typeof entries)[number]>();

  function add(raw: RouteRecordRaw, parent: RouteRecordNormalized | undefined) {
    const where = `the route ${raw.path}`;
    checkOptions(raw, RECORD_KEYS, where);
    const path =
      parent && !raw.path.startsWith('/')
        ? raw.path
          ? parent.path.replace(/\/$/, '') + '/' + raw.path
          : parent.path
        : raw.path;
    const parser = parsePath(path);
    const beforeEnter = raw.beforeEnter === undefined ? [] : [raw.beforeEnter].flat();
    beforeEnter.forEach(checkGuard);
    const children: RouteRecordNormalized[] = [];
    const record: RouteRecordNormalized = {
      path,
      name: raw.name,
      meta: raw.meta ?? {},
      redirect: raw.redirect,
      beforeEnter,
      component: raw.component,
      children,
      parent,
    };
    // Children first, so that an empty-path child wins over its parent at an equal score.
    for (const child of raw.children ?? []) children.push(add(child, record));
    const entry = { record, parser };
    entries.push(entry);
    if (raw.name !== undefined) {
      if (names.has(raw.name)) throw vibeError('VIBE7102', { name: raw.name });
      names.set(raw.name, entry);
    }
    return record;
  }

  for (const route of routes) add(route, undefined);
  // A stable sort keeps the children-first order of equal scores.
  entries.sort((a, b) => comparePaths(a.parser.score, b.parser.score));

  return {
    resolvePath(path) {
      for (const { record, parser } of entries) {
        const params = matchPath(parser, path);
        if (params) return located(record, params);
      }
      warn(vibeError('VIBE7106', { path }));
      return located(undefined, {});
    },
    resolveName(name, raw) {
      const entry = names.get(name);
      if (!entry) throw vibeError('VIBE7105', { name });
      const { path, params } = buildPath(entry.parser, raw, name);
      return { ...located(entry.record, params), path };
    },
    routes: entries.map((entry) => entry.record),
  };
}
