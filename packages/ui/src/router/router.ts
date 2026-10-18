import { vibeError } from '../errors.gen.ts';
import { shallowRef } from '../reactivity/ref.ts';
import { isFunction, isObject } from '../shared.ts';
import { logError } from '../warn.ts';
import { parseLocation, stringifyQuery, type ParsedLocation } from './location.ts';
import { checkGuard, checkOptions, createMatcher, type MatchedRoute } from './matcher.ts';
import type {
  NavigationFailure,
  NavigationGuard,
  NavigationGuardResult,
  RouteLocation,
  RouteLocationRaw,
  RouteRecordNormalized,
  Router,
  RouterOptions,
} from './types.ts';

export const START_LOCATION: RouteLocation = {
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

class Failure extends Error implements NavigationFailure {
  override name = 'NavigationFailure';
  readonly type: NavigationFailure['type'];
  readonly to: RouteLocation;
  readonly from: RouteLocation;

  constructor(type: NavigationFailure['type'], to: RouteLocation, from: RouteLocation) {
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
  guard: NavigationGuard;
}

const viewGuards = new WeakMap<Router, Set<ViewGuard>>();

/** Registers the guard of a view: it runs while `record()` is leaving or updating. */
export function addViewGuard(
  router: Router,
  kind: ViewGuard['kind'],
  record: ViewGuard['record'],
  guard: NavigationGuard,
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

export function createRouter(options: RouterOptions): Router {
  checkOptions(options, ['history', 'routes'], 'createRouter()');
  const { history } = options;
  const matcher = createMatcher(options.routes);
  const currentRoute = shallowRef(START_LOCATION);
  const beforeGuards = new Set<NavigationGuard>();
  const resolveGuards = new Set<NavigationGuard>();
  const afterHooks = new Set<Parameters<Router['afterEach']>[0]>();
  const errorHandlers = new Set<Parameters<Router['onError']>[0]>();
  const guards = new Set<ViewGuard>();
  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((onResolve, onReject) => {
    resolveReady = onResolve;
    rejectReady = onReject;
  });
  // isReady() may never be called, and a first navigation that throws still rejects it.
  ready.catch(() => {});
  let pending: RouteLocation | undefined;
  let unlisten: (() => void) | undefined;

  function resolve(raw: RouteLocationRaw, current = currentRoute.value): RouteLocation {
    if (typeof raw === 'string') return locate(parseLocation(raw, current.path));
    const suffix = '?' + stringifyQuery(raw.query ?? {}) + (raw.hash ?? '');
    if ('name' in raw) {
      const route = matcher.resolveName(raw.name, raw.params ?? {});
      return locate(parseLocation(route.path + suffix, '/'), route);
    }
    return locate(parseLocation(('path' in raw ? raw.path : current.path) + suffix, current.path));
  }

  function locate(
    { path, query, hash, fullPath }: ParsedLocation,
    { name, params, matched, meta }: MatchedRoute = matcher.resolvePath(path),
  ): RouteLocation {
    return { path, fullPath, name, params, query, hash, matched, meta, redirectedFrom: undefined };
  }

  async function navigate(
    raw: RouteLocationRaw,
    replace: boolean,
    delta?: number,
  ): Promise<NavigationFailure | undefined> {
    const from = currentRoute.value;
    const first = resolve(raw);
    replace ||= typeof raw === 'object' && raw.replace === true;
    let to = first;
    let redirects = 0;
    try {
      for (;;) {
        const redirect = to.matched.at(-1)?.redirect;
        let next = typeof redirect === 'function' ? redirect(to) : redirect;
        if (next === undefined) {
          const result = await run(to, from);
          if (isNavigationFailure(result)) {
            if (delta && result.type !== 'duplicated') history.go(-delta, false);
            for (const hook of afterHooks) hook(to, from, result);
            return result;
          }
          if (result === undefined) {
            currentRoute.value = to;
            if (delta === undefined) history[replace ? 'replace' : 'push'](to.fullPath);
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
      if (errorHandlers.size) for (const handler of errorHandlers) handler(error, to, from);
      else logError(error);
      rejectReady(error);
      throw error;
    } finally {
      unlisten ??= history.listen((location, _from, info) => {
        // A failure was handed to afterEach and an error to onError: nothing is left to report.
        navigate(location, false, info.delta).catch(() => {});
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
    to: RouteLocation,
    from: RouteLocation,
  ): Promise<NavigationFailure | RouteLocationRaw | undefined> {
    if (to.fullPath === from.fullPath && from !== START_LOCATION) {
      return new Failure('duplicated', to, from);
    }
    pending = to;
    const leaving: RouteRecordNormalized[] = [];
    for (const record of from.matched) if (!to.matched.includes(record)) leaving.unshift(record);
    const updating = from.matched.filter((record) => to.matched.includes(record));
    const entering = to.matched.filter((record) => !from.matched.includes(record));
    const phases: (() => Promise<NavigationGuardResult>)[] = [
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
      if (pending !== to) return new Failure('cancelled', to, from);
      if (result === false) return new Failure('aborted', to, from);
      if (result && result !== true) return result;
    }
    return undefined;
  }

  const router: Router = {
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
