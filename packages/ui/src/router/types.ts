import type { ShallowRef } from '../reactivity/ref.ts';

/**
 * Types the router APIs from the app's routes. Augment it once per app:
 * `declare module '@vibejs-org/ui/router' { interface Register { router: typeof router } }`.
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type -- augmentable
export interface Register {}

/** Any routes: names are `string` and params are loose. */
type AnyRoutes = readonly RouteRecordRaw[];
// oxlint-disable-next-line typescript/no-unnecessary-type-arguments -- the default is circular here
type RegisteredRouter = Register extends { router: infer T } ? T : Router<AnyRoutes>;
type RegisteredRoutes = RegisteredRouter extends Router<infer R extends AnyRoutes> ? R : AnyRoutes;

export interface RouterOptions<R extends AnyRoutes = AnyRoutes> {
  history: RouterHistory;
  routes: R;
}

/** Custom data of a route record. Augment it to type `meta`. */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type -- augmentable
export interface RouteMeta extends Record<PropertyKey, unknown> {}

// Records use the loose types, so that declaring routes never depends on `Register` (TS7022).
export interface RouteRecordRaw {
  path: string;
  name?: string;
  /** A component, or a function that loads one lazily. */
  component?: object | (() => Promise<object>);
  children?: readonly RouteRecordRaw[];
  redirect?: AnyLocationRaw | ((to: AnyLocation) => AnyLocationRaw);
  meta?: RouteMeta;
  beforeEnter?: AnyGuard | readonly AnyGuard[];
}

export interface RouteRecordNormalized {
  /** The full path, joined with the parent paths. */
  readonly path: string;
  readonly name: string | undefined;
  readonly meta: RouteMeta;
  readonly redirect: RouteRecordRaw['redirect'];
  readonly beforeEnter: readonly AnyGuard[];
  /** A lazy loader is replaced by the loaded component after the first load. */
  readonly component: RouteRecordRaw['component'];
  readonly children: readonly RouteRecordNormalized[];
  readonly parent: RouteRecordNormalized | undefined;
}

/** An absent optional param is a missing key. */
type AnyParams = Record<string, string | string[]>;
type AnyParamsRaw = Record<
  string,
  string | number | readonly (string | number)[] | null | undefined
>;

/** Joins a child path to its parent: an absolute child stays absolute, `''` is the parent. */
type Join<Parent extends string | undefined, P extends string> = Parent extends string
  ? P extends `/${string}`
    ? P
    : P extends ''
      ? Parent
      : `${Parent extends `${infer Base}/` ? Base : Parent}/${P}`
  : P;

/** `[name, full path]` of a record and of its descendants. */
type Entries<Rec, Parent extends string | undefined> = Rec extends {
  readonly path: infer P extends string;
}
  ? string extends P
    ? [string, string]
    :
        | (Rec extends { readonly name: infer N extends string } ? [N, Join<Parent, P>] : never)
        | (Rec extends { readonly children: infer C extends AnyRoutes }
            ? Entries<C[number], Join<Parent, P>>
            : never)
  : never;

/** `{ [name]: full path }`. */
type RouteNamedMap<R extends AnyRoutes> = {
  [E in Entries<R[number], undefined> as E[0]]: E[1];
};

/** Splits a path on `/`, tail-recursively: a param regex never contains `/` (VIBE7101). */
type Segments<
  P extends string,
  Acc extends string = never,
> = P extends `${infer Head}/${infer Tail}` ? Segments<Tail, Acc | Head> : Acc | P;
type ParamSegments<P extends string> = Extract<Segments<P>, `:${string}`>;
type Modifier<S extends string> = S extends `${string}?`
  ? '?'
  : S extends `${string}*`
    ? '*'
    : S extends `${string}+`
      ? '+'
      : '';
type ParamName<S extends string> = S extends `:${infer N}(${string}`
  ? N
  : S extends `:${infer N}${Modifier<S>}`
    ? N
    : never;
type Flat<T> = { [K in keyof T]: T[K] };

/** The params of `route.params`. */
type ParamsOf<P> = string extends P
  ? AnyParams
  : P extends string
    ? Flat<
        {
          [
            S in ParamSegments<P> as Modifier<S> extends '?' ? never : ParamName<S>
          ]: Modifier<S> extends '' ? string : string[];
        } & { [S in ParamSegments<P> as Modifier<S> extends '?' ? ParamName<S> : never]?: string }
      >
    : never;

/** The params of a location to navigate to. */
type ParamsRawOf<P> = string extends P
  ? AnyParamsRaw
  : P extends string
    ? Flat<
        {
          [
            S in ParamSegments<P> as Modifier<S> extends '' | '+' ? ParamName<S> : never
          ]: Modifier<S> extends '' ? string | number : readonly (string | number)[];
        } & {
          [
            S in ParamSegments<P> as Modifier<S> extends '?' | '*' ? ParamName<S> : never
          ]?: Modifier<S> extends '?' ? string | number | null : readonly (string | number)[];
        }
      >
    : never;

/** The route names; `string` without a registered router. */
export type RouteName<R extends AnyRoutes = RegisteredRoutes> = keyof RouteNamedMap<R> & string;
export type RouteParams<
  N extends RouteName<R> = RouteName,
  R extends AnyRoutes = RegisteredRoutes,
> = ParamsOf<RouteNamedMap<R>[N]>;
export type RouteParamsRaw<
  N extends RouteName<R> = RouteName,
  R extends AnyRoutes = RegisteredRoutes,
> = ParamsRawOf<RouteNamedMap<R>[N]>;
export type LocationQuery = Record<string, string | string[]>;
export type LocationQueryRaw = Record<
  string,
  string | number | null | undefined | readonly (string | number | null | undefined)[]
>;

interface BaseLocation<N extends string | undefined, P, R extends AnyRoutes> {
  readonly path: string;
  readonly fullPath: string;
  readonly name: N;
  readonly params: P;
  readonly query: LocationQuery;
  /** Starts with `#`, or is empty. */
  readonly hash: string;
  readonly matched: readonly RouteRecordNormalized[];
  /** The `meta` of the matched records, merged from parent to child. */
  readonly meta: RouteMeta;
  readonly redirectedFrom: RouteLocation<R> | undefined;
}

/** The location of the route named `N`. */
export type RouteLocationOf<
  N extends RouteName<R>,
  R extends AnyRoutes = RegisteredRoutes,
> = BaseLocation<N, RouteParams<N, R>, R>;

type AnyLocation = BaseLocation<string | undefined, AnyParams, AnyRoutes>;

/** A union by name, narrowed by `route.name === 'user'`; `name` is `undefined` without a named match. */
export type RouteLocation<R extends AnyRoutes = RegisteredRoutes> =
  string extends RouteName<R>
    ? AnyLocation
    :
        | { [N in RouteName<R>]: RouteLocationOf<N, R> }[RouteName<R>]
        | BaseLocation<undefined, AnyParams, R>;

interface LocationOptions {
  query?: LocationQueryRaw;
  hash?: string;
  replace?: boolean;
}

type AnyLocationRaw =
  | string
  | (LocationOptions & { path: string })
  | (LocationOptions & { name: string; params?: AnyParamsRaw })
  /** Keeps the current path. */
  | LocationOptions;

/** The forms exclude each other's keys; `params` is required when the route has a required param. */
export type RouteLocationRaw<R extends AnyRoutes = RegisteredRoutes> =
  string extends RouteName<R>
    ? AnyLocationRaw
    :
        | string
        | (LocationOptions & { path: string; name?: never })
        /** Keeps the current path. */
        | (LocationOptions & { name?: never; path?: never })
        | {
            [N in RouteName<R>]: LocationOptions & {
              name: N;
              path?: never;
            } & ({} extends RouteParamsRaw<N, R>
                ? { params?: RouteParamsRaw<N, R> }
                : { params: RouteParamsRaw<N, R> });
          }[RouteName<R>];

type AnyGuardResult = void | boolean | AnyLocationRaw;
type AnyGuard = (to: AnyLocation, from: AnyLocation) => AnyGuardResult | Promise<AnyGuardResult>;

export type NavigationGuardResult<R extends AnyRoutes = RegisteredRoutes> =
  | void
  | boolean
  | RouteLocationRaw<R>;
export type NavigationGuard<R extends AnyRoutes = RegisteredRoutes> = (
  to: RouteLocation<R>,
  from: RouteLocation<R>,
) => NavigationGuardResult<R> | Promise<NavigationGuardResult<R>>;

export interface NavigationFailure extends Error {
  readonly type: 'aborted' | 'cancelled' | 'duplicated';
  readonly to: RouteLocation;
  readonly from: RouteLocation;
}

export interface Router<R extends AnyRoutes = RegisteredRoutes> {
  readonly currentRoute: Readonly<ShallowRef<RouteLocation<R>>>;
  push(to: RouteLocationRaw<R>): Promise<NavigationFailure | undefined>;
  replace(to: RouteLocationRaw<R>): Promise<NavigationFailure | undefined>;
  back(): void;
  forward(): void;
  go(delta: number): void;
  /** `href` is `history.createHref(fullPath)`. */
  resolve(to: RouteLocationRaw<R>): RouteLocation<R> & { readonly href: string };
  beforeEach(guard: NavigationGuard<R>): () => void;
  beforeResolve(guard: NavigationGuard<R>): () => void;
  afterEach(
    hook: (to: RouteLocation<R>, from: RouteLocation<R>, failure?: NavigationFailure) => void,
  ): () => void;
  onError(
    handler: (error: unknown, to: RouteLocation<R>, from: RouteLocation<R>) => void,
  ): () => void;
  isReady(): Promise<void>;
  getRoutes(): readonly RouteRecordNormalized[];
}

export interface RouterHistory {
  readonly base: string;
  readonly location: string;
  push(to: string): void;
  replace(to: string): void;
  /** `triggerListeners: false` moves without notifying the listeners. */
  go(delta: number, triggerListeners?: boolean): void;
  listen(callback: (to: string, from: string, info: { delta: number }) => void): () => void;
  createHref(location: string): string;
  destroy(): void;
}
