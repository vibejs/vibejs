import { vibeError } from '../errors.gen.ts';
import { shallowRef } from '../reactivity/ref.ts';
import { isFunction, isObject } from '../shared.ts';
import { logError } from '../warn.ts';
import { parseLocation, stringifyQuery, type ParsedLocation } from './location.ts';
import { checkGuard, checkOptions, createMatcher, type MatchedRoute } from './matcher.ts';
import type {
  AnyGuard,
  AnyGuardResult,
  AnyLocation,
  AnyLocationRaw,
  AnyRouter,
  NavigationFailure,
  RouteRecordNormalized,
  Router,
  RouterOptions,
  RouteRecordRaw,
} from './types.ts';

export const START_LOCATION: AnyLocation = {
  path: '/',
  fullPath: '/',
  name: undefined,
  params: {},
  query: {},
  hash: '',
  matched: [],
  meta: {},
  redirectedFrom: undefined,
};

export const NavigationFailureType: {
  readonly aborted: 'aborted';
  readonly cancelled: 'cancelled';
  readonly duplicated: 'duplicated';
} = { aborted: 'aborted', cancelled: 'cancelled', duplicated: 'duplicated' };

class Failure extends Error {
  override name = 'NavigationFailure';
  readonly type: NavigationFailure['type'];
  readonly to: AnyLocation;
  readonly from: AnyLocation;

  constructor(type: NavigationFailure['type'], to: AnyLocation, from: AnyLocation) {
    super(`Navigation from ${from.fullPath} to ${to.fullPath} was ${type}.`);
    this.type = type;
    this.to = to;
    this.from = from;
  }
}

export function isNavigationFailure(
  value: unknown,
  type?: NavigationFailure['type'],
): value is NavigationFailure {
  return value instanceof Failure && (type === undefined || value.type === type);
}

interface ViewGuard {
  kind: 'leave' | 'update';
  record: () => RouteRecordNormalized | undefined;
  guard: AnyGuard;
}

// Keyed by `object`: a `Router<R>` with literal routes is built before it is widened to `AnyRouter`.
const viewGuards = new WeakMap<object, Set<ViewGuard>>();

/** Registers the guard of a view: it runs while `record()` is leaving or updating. */
export function addViewGuard(
  router: AnyRouter,
  kind: ViewGuard['kind'],
  record: ViewGuard['record'],
  guard: AnyGuard,
): () => void {
  checkGuard(guard);
  const entry = { kind, record, guard };
  const set = viewGuards.get(router)!;
  set.add(entry);
  return () => set.delete(entry);
}

/** Load promises, by the record of the lazy loader. */
const loading = new WeakMap<RouteRecordNormalized, Promise<void>>();

function load(record: RouteRecordNormalized, loader: () => unknown): Promise<void> {
  let promise = loading.get(record);
  if (!promise) {
    // A loader that throws rejects like one that returns a rejected promise.
    promise = Promise.resolve()
      .then(loader)
      .then(
        (value) => {
          const component = isObject(value) && isObject(value.default) ? value.default : value;
          if (!isObject(component)) {
            const type = component === null ? 'null' : typeof component;
            throw vibeError('VIBE7110', { path: record.path, type });
          }
          // `component` is read-only for users only.
          Object.assign(record, { component });
        },
        (cause: unknown) => {
          // A later navigation tries again, for example once the network is back.
          loading.delete(record);
          throw vibeError('VIBE7109', { path: record.path }, { cause });
        },
      );
    loading.set(record, promise);
  }
  return promise;
}

const register =
  <T>(set: Set<T>, check?: (item: T) => void) =>
  (item: T): (() => void) => {
    check?.(item);
    set.add(item);
    return () => {
      set.delete(item);
    };
  };

/** Returns `routes` as-is; its literal names and paths type the router. */
export function defineRoutes<const R extends readonly RouteRecordRaw[]>(routes: R): R {
  return routes;
}

export function createRouter<const R extends readonly RouteRecordRaw[]>(
  options: RouterOptions<R>,
): Router<R> {
  checkOptions(options, ['history', 'routes'], 'createRouter()');
  const { history } = options;
  const matcher = createMatcher(options.routes);
  const currentRoute = shallowRef(START_LOCATION);
  const beforeGuards = new Set<AnyGuard>();
  const resolveGuards = new Set<AnyGuard>();
  const afterHooks = new Set<Parameters<AnyRouter['afterEach']>[0]>();
  const errorHandlers = new Set<Parameters<AnyRouter['onError']>[0]>();
  const guards = new Set<ViewGuard>();
  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((onResolve, onReject) => {
    resolveReady = onResolve;
    rejectReady = onReject;
  });
  // isReady() may never be called, and a first navigation that throws still rejects it.
  ready.catch(() => {});
  /** Counts navigations: a navigation is cancelled once a newer one starts. */
  let navigations = 0;
  /** The history steps taken by history-driven navigations since `currentRoute` was committed. */
  let offset = 0;
  let unlisten: (() => void) | undefined;

  function resolve(raw: AnyLocationRaw, current = currentRoute.value): AnyLocation {
    if (typeof raw === 'string') return locate(parseLocation(raw, current.path));
    const hash = raw.hash ?? '';
    const suffix =
      '?' + stringifyQuery(raw.query ?? {}) + (hash && !hash.startsWith('#') ? '#' : '') + hash;
    if ('name' in raw) {
      const route = matcher.resolveName(raw.name, raw.params ?? {});
      return locate(parseLocation(route.path + suffix, '/'), route);
    }
    return locate(parseLocation(('path' in raw ? raw.path : current.path) + suffix, current.path));
  }

  function locate(
    { path, query, hash, fullPath }: ParsedLocation,
    { name, params, matched, meta }: MatchedRoute = matcher.resolvePath(path),
  ): AnyLocation {
    return { path, fullPath, name, params, query, hash, matched, meta, redirectedFrom: undefined };
  }

  /** Moves the history back to `currentRoute` after the latest navigation failed. */
  function restore() {
    if (offset && history.location !== currentRoute.value.fullPath) history.go(-offset, false);
    offset = 0;
  }

  /** `pop` is a navigation that follows a history move. */
  async function navigate(
    raw: AnyLocationRaw,
    replace: boolean,
    pop = false,
  ): Promise<Failure | undefined> {
    const from = currentRoute.value;
    let to: AnyLocation | undefined;
    let id = navigations;
    try {
      const first = resolve(raw);
      id = ++navigations;
      replace ||= typeof raw === 'object' && raw.replace === true;
      to = first;
      let redirects = 0;
      for (;;) {
        const redirect: RouteRecordNormalized['redirect'] = to.matched.at(-1)?.redirect;
        let next: AnyLocationRaw | undefined =
          typeof redirect === 'function' ? redirect(to) : redirect;
        if (next === undefined) {
          const result = await run(to, from, id);
          if (result instanceof Failure) {
            // A cancelled navigation leaves the history position to the newer one.
            if (id === navigations) restore();
            for (const hook of afterHooks) hook(to, from, result);
            return result;
          }
          if (result === undefined) {
            currentRoute.value = to;
            offset = 0;
            if (!pop) history[replace ? 'replace' : 'push'](to.fullPath);
            else if (to !== first) history.replace(to.fullPath);
            resolveReady();
            for (const hook of afterHooks) hook(to, from);
            return undefined;
          }
          next = result;
        }
        if (++redirects > 10) throw vibeError('VIBE7108', { path: first.fullPath });
        replace ||= typeof next === 'object' && next.replace === true;
        to = { ...resolve(next, to), redirectedFrom: first };
      }
    } catch (error) {
      // An error while resolving the first target has no `to` to report to onError.
      if (to) {
        if (id === navigations) restore();
        if (errorHandlers.size) for (const handler of errorHandlers) handler(error, to, from);
        else logError(error);
      }
      rejectReady(error);
      throw error;
    } finally {
      unlisten ??= history.listen((location, _from, info) => {
        offset += info.delta;
        // A failure was handed to afterEach and an error to onError: nothing is left to report.
        navigate(location, false, true).catch(() => {});
      });
    }
  }

  function viewGuardsOf(kind: ViewGuard['kind'], records: readonly RouteRecordNormalized[]) {
    return records.flatMap((record) =>
      [...guards].filter((g) => g.kind === kind && g.record() === record).map((g) => g.guard),
    );
  }

  /** Runs the guards; returns a failure, a redirect, or `undefined` to commit. */
  async function run(
    to: AnyLocation,
    from: AnyLocation,
    id: number,
  ): Promise<Failure | AnyLocationRaw | undefined> {
    // A duplicated navigation still cancels a pending one: the latest intent wins.
    if (to.fullPath === from.fullPath && from !== START_LOCATION) {
      return new Failure('duplicated', to, from);
    }
    const leaving: RouteRecordNormalized[] = [];
    for (const record of from.matched) if (!to.matched.includes(record)) leaving.unshift(record);
    const updating = from.matched.filter((record) => to.matched.includes(record));
    const entering = to.matched.filter((record) => !from.matched.includes(record));
    const phases: (() => Promise<AnyGuardResult>)[] = [
      ...[
        ...viewGuardsOf('leave', leaving),
        ...beforeGuards,
        ...viewGuardsOf('update', updating),
        ...entering.flatMap((record) => record.beforeEnter),
      ].map((guard) => async () => guard(to, from)),
      async () => {
        await Promise.all(
          entering.flatMap((record) =>
            isFunction(record.component) ? [load(record, record.component)] : [],
          ),
        );
      },
      ...[...resolveGuards].map((guard) => async () => guard(to, from)),
    ];
    for (const phase of phases) {
      const result = await phase();
      if (id !== navigations) return new Failure('cancelled', to, from);
      if (result === false) return new Failure('aborted', to, from);
      if (result && result !== true) return result;
    }
    return undefined;
  }

  const router: Router<R> = {
    currentRoute,
    push: (to) => navigate(to, false),
    replace: (to) => navigate(to, true),
    back: () => history.go(-1),
    forward: () => history.go(1),
    go: (delta) => history.go(delta),
    resolve: (to) => {
      const location = resolve(to);
      return { ...location, href: history.createHref(location.fullPath) };
    },
    beforeEach: register(beforeGuards, checkGuard),
    beforeResolve: register(resolveGuards, checkGuard),
    afterEach: register(afterHooks),
    onError: register(errorHandlers),
    isReady: () => ready,
    getRoutes: () => matcher.routes,
  };
  viewGuards.set(router, guards);
  return router;
}
