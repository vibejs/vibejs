export { createMemoryHistory } from './router/history.ts';
export {
  createRouter,
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
  RouteLocation,
  RouteLocationRaw,
  RouteMeta,
  RouteParams,
  RouteParamsRaw,
  Router,
  RouterHistory,
  RouterOptions,
  RouteRecordNormalized,
  RouteRecordRaw,
} from './router/types.ts';
