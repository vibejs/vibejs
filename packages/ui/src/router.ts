export {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useLink,
  useRoute,
  useRouter,
} from './router/composables.ts';
export { RouterLink, RouterView } from './router/components.ts';
export { createMemoryHistory, createWebHistory } from './router/history.ts';
export {
  createRouter,
  defineRoutes,
  isNavigationFailure,
  NavigationFailureType,
  START_LOCATION,
} from './router/router.ts';
export type {
  LocationQuery,
  LocationQueryRaw,
  NavigationFailure,
  NavigationGuard,
  NavigationGuardResult,
  Register,
  RouteLocation,
  RouteLocationOf,
  RouteLocationRaw,
  RouteMeta,
  RouteName,
  RouteParams,
  RouteParamsRaw,
  Router,
  RouterHistory,
  RouterLinkProps,
  RouterOptions,
  RouteRecordNormalized,
  RouteRecordRaw,
  RouterScrollBehavior,
  ScrollPosition,
} from './router/types.ts';
