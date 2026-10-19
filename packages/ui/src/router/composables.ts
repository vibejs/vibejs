import { vibeError } from '../errors.gen.ts';
import { computed, type ComputedRef } from '../reactivity/computed.ts';
import { toValue, type MaybeRefOrGetter } from '../reactivity/ref.ts';
import { inject, type InjectionKey } from '../runtime/inject.ts';
import { currentInstance } from '../runtime/instance.ts';
import { onUnmounted } from '../runtime/lifecycle.ts';
import { warn } from '../warn.ts';
import { addViewGuard, routerKey, START_LOCATION } from './router.ts';
import type {
  AnyGuard,
  AnyLocation,
  AnyRouter,
  NavigationFailure,
  NavigationGuard,
  RouteLocation,
  RouteLocationOf,
  RouteLocationRaw,
  RouteName,
  Router,
  RouteRecordNormalized,
} from './types.ts';

/** The index in `matched` of the next nested RouterView. */
export const depthKey: InjectionKey<ComputedRef<number>> = Symbol('router view depth');
/** The record that the closest RouterView shows. */
export const recordKey: InjectionKey<ComputedRef<RouteRecordNormalized | undefined>> =
  Symbol('router view record');

/** The installed router, typed by the registered routes; VIBE7111 without one. */
export function injectRouter(api: string): Router {
  const router = inject(routerKey, null);
  if (!router) throw vibeError('VIBE7111', { api });
  // Typed by the registered routes: the assertion is needed once `Register` is augmented.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-assertion
  return router as Router;
}

/** The router that `app.use(router)` installed. */
export function useRouter(): Router {
  return injectRouter('useRouter()');
}

/** One route object per router; its getters read `currentRoute`, so reading it is reactive. */
const routes = new WeakMap<AnyRouter, AnyLocation>();

function routeOf(router: AnyRouter): AnyLocation {
  let route = routes.get(router);
  if (!route) {
    const getters = Object.keys(START_LOCATION).map((key) => [
      key,
      { enumerable: true, get: () => Reflect.get(router.currentRoute.value, key) },
    ]);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the getters cover every key
    route = Object.defineProperties({}, Object.fromEntries(getters)) as AnyLocation;
    routes.set(router, route);
  }
  return route;
}

/** The current route, reactive. With `name`, typed by that route; VIBE7113 when it is not matched. */
export function useRoute(): RouteLocation;
export function useRoute<N extends RouteName>(name: N): RouteLocationOf<N>;
export function useRoute(name?: string): AnyLocation {
  const route = routeOf(injectRouter('useRoute()'));
  if (name !== undefined && !route.matched.some((record) => record.name === name)) {
    throw vibeError('VIBE7113', { name, path: route.fullPath });
  }
  return route;
}

function addGuard(kind: 'leave' | 'update', api: string, guard: NavigationGuard): void {
  const record = inject(recordKey, null);
  if (!record) {
    warn(vibeError('VIBE7112', { api }), currentInstance);
    return;
  }
  // Typed by the registered routes: the assertion is needed once `Register` is augmented.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-assertion
  const remove = addViewGuard(injectRouter(api), kind, () => record.value, guard as AnyGuard);
  onUnmounted(remove);
}

/** Runs `guard` while the route record of this page is leaving; it may cancel or redirect. */
export function onBeforeRouteLeave(guard: NavigationGuard): void {
  addGuard('leave', 'onBeforeRouteLeave()', guard);
}

/** Runs `guard` when the route changes but this page stays, such as on a param change. */
export function onBeforeRouteUpdate(guard: NavigationGuard): void {
  addGuard('update', 'onBeforeRouteUpdate()', guard);
}

/** A URL with a scheme, or protocol-relative. */
const EXTERNAL = /^[a-z][\w+.-]*:|^\/\//i;

/** Whether the param values are equal; repeatable params compare item by item. */
const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const includesParams = (outer: object, inner: object): boolean =>
  Object.entries(inner).every(([key, value]) => sameValue(value, Reflect.get(outer, key)));

/** What a link needs: the target, its `href`, whether it is active, and the click handler. */
export function useLink(options: {
  to: MaybeRefOrGetter<RouteLocationRaw>;
  replace?: MaybeRefOrGetter<boolean | undefined>;
}): {
  route: ComputedRef<RouteLocation & { href: string }>;
  href: ComputedRef<string>;
  isActive: ComputedRef<boolean>;
  isExactActive: ComputedRef<boolean>;
  navigate(e?: MouseEvent): Promise<NavigationFailure | undefined>;
} {
  const router = injectRouter('useLink()');
  const route = computed(() => {
    const to = toValue(options.to);
    if (typeof to === 'string' && EXTERNAL.test(to)) throw vibeError('VIBE7114', { to });
    return router.resolve(to);
  });
  /** The index in the current `matched` of the target's record, or of its parent for an empty-path child. */
  const index = computed(() => {
    const record = route.value.matched.at(-1);
    if (!record) return -1;
    const { matched } = router.currentRoute.value;
    const found = matched.indexOf(record);
    const { parent } = record;
    return found < 0 && parent?.path === record.path ? matched.indexOf(parent) : found;
  });
  const isActive = computed(
    () => index.value >= 0 && includesParams(router.currentRoute.value.params, route.value.params),
  );
  const isExactActive = computed(() => {
    const current = router.currentRoute.value;
    return (
      isActive.value &&
      index.value === current.matched.length - 1 &&
      Object.keys(current.params).length === Object.keys(route.value.params).length
    );
  });
  return {
    route,
    href: computed(() => route.value.href),
    isActive,
    isExactActive,
    async navigate(e) {
      // Modified, non-left, prevented and new-tab clicks keep the browser's behavior.
      const target =
        e?.currentTarget instanceof Element ? e.currentTarget.getAttribute('target') : null;
      if (
        e &&
        (e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          e.button !== 0 ||
          e.defaultPrevented ||
          target === '_blank')
      ) {
        return undefined;
      }
      e?.preventDefault();
      const to = toValue(options.to);
      // A rejection already reached onError.
      return (toValue(options.replace) ? router.replace(to) : router.push(to)).catch(
        () => undefined,
      );
    },
  };
}
