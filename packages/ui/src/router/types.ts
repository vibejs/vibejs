import type { ShallowRef } from '../reactivity/ref.ts';

export interface RouterOptions {
  history: RouterHistory;
  routes: readonly RouteRecordRaw[];
}

/** Custom data of a route record. Augment it to type `meta`. */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type -- augmentable
export interface RouteMeta extends Record<PropertyKey, unknown> {}

export interface RouteRecordRaw {
  path: string;
  name?: string;
  /** A component, or a function that loads one lazily. */
  component?: object | (() => Promise<object>);
  children?: readonly RouteRecordRaw[];
  redirect?: RouteLocationRaw | ((to: RouteLocation) => RouteLocationRaw);
  meta?: RouteMeta;
  beforeEnter?: NavigationGuard | readonly NavigationGuard[];
}

export interface RouteRecordNormalized {
  /** The full path, joined with the parent paths. */
  readonly path: string;
  readonly name: string | undefined;
  readonly meta: RouteMeta;
  readonly redirect: RouteRecordRaw['redirect'];
  readonly beforeEnter: readonly NavigationGuard[];
  /** A lazy loader is replaced by the loaded component after the first load. */
  readonly component: RouteRecordRaw['component'];
  readonly children: readonly RouteRecordNormalized[];
  readonly parent: RouteRecordNormalized | undefined;
}

/** An absent optional param is a missing key. */
export type RouteParams = Record<string, string | string[]>;
export type RouteParamsRaw = Record<
  string,
  string | number | readonly (string | number)[] | null | undefined
>;
export type LocationQuery = Record<string, string | string[]>;
export type LocationQueryRaw = Record<
  string,
  string | number | null | undefined | readonly (string | number | null | undefined)[]
>;

export interface RouteLocation {
  readonly path: string;
  readonly fullPath: string;
  readonly name: string | undefined;
  readonly params: RouteParams;
  readonly query: LocationQuery;
  /** Starts with `#`, or is empty. */
  readonly hash: string;
  readonly matched: readonly RouteRecordNormalized[];
  /** The `meta` of the matched records, merged from parent to child. */
  readonly meta: RouteMeta;
  readonly redirectedFrom: RouteLocation | undefined;
}

export type RouteLocationRaw =
  | string
  | { path: string; query?: LocationQueryRaw; hash?: string; replace?: boolean }
  | {
      name: string;
      params?: RouteParamsRaw;
      query?: LocationQueryRaw;
      hash?: string;
      replace?: boolean;
    }
  /** Keeps the current path. */
  | { query?: LocationQueryRaw; hash?: string; replace?: boolean };

export type NavigationGuardResult = void | boolean | RouteLocationRaw;
export type NavigationGuard = (
  to: RouteLocation,
  from: RouteLocation,
) => NavigationGuardResult | Promise<NavigationGuardResult>;

export interface NavigationFailure extends Error {
  readonly type: 'aborted' | 'cancelled' | 'duplicated';
  readonly to: RouteLocation;
  readonly from: RouteLocation;
}

export interface Router {
  readonly currentRoute: Readonly<ShallowRef<RouteLocation>>;
  push(to: RouteLocationRaw): Promise<NavigationFailure | undefined>;
  replace(to: RouteLocationRaw): Promise<NavigationFailure | undefined>;
  back(): void;
  forward(): void;
  go(delta: number): void;
  /** `href` is `history.createHref(fullPath)`. */
  resolve(to: RouteLocationRaw): RouteLocation & { readonly href: string };
  beforeEach(guard: NavigationGuard): () => void;
  beforeResolve(guard: NavigationGuard): () => void;
  afterEach(
    hook: (to: RouteLocation, from: RouteLocation, failure?: NavigationFailure) => void,
  ): () => void;
  onError(handler: (error: unknown, to: RouteLocation, from: RouteLocation) => void): () => void;
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
