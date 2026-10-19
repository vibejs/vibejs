export { createMemoryHistory } from './router/history.ts';
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
  RouterOptions,
  RouteRecordNormalized,
  RouteRecordRaw,
} from './router/types.ts';
