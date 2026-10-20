import { expectTypeOf } from 'vitest';
import type { ComponentProps, ComponentSlots, Slot } from '../component.ts';
import type { ComputedRef } from '../reactivity/computed.ts';
import { RouterLink, RouterView } from './components.ts';
import { useLink, useRoute, useRouter } from './composables.ts';
import { createMemoryHistory } from './history.ts';
import { createRouter, defineRoutes } from './router.ts';
import type {
  AnyRouter,
  NavigationFailure,
  NavigationGuard,
  RouteLocation,
  RouteLocationOf,
  RouteLocationRaw,
  RouteName,
  RouteParams,
  RouteParamsRaw,
  Router,
  RouterLinkProps,
  RouteRecordRaw,
} from './types.ts';

const page = {};
const routes = defineRoutes([
  { path: '/', name: 'home', component: page },
  {
    path: '/users/:id(\\d+)',
    name: 'user',
    component: async () => page,
    children: [
      { path: '', name: 'user-index' },
      { path: 'posts/:postId?', name: 'user-posts', children: [{ path: ':slug', name: 'post' }] },
      { path: '/about/:section', name: 'about' },
    ],
  },
  { path: '/files/:parts+', name: 'files' },
  { path: '/tags/:tags*', name: 'tags' },
  { path: '/:pathMatch(.*)*', name: 'not-found' },
  { path: '/plain/:p', name: 'plain' },
  { path: '/unnamed' },
]);
type R = typeof routes;
type Raw<N extends RouteName<R>> = RouteParamsRaw<N, R>;

// Names come from every level; an unnamed record adds none.
expectTypeOf<RouteName<R>>().toEqualTypeOf<
  | 'home'
  | 'user'
  | 'user-index'
  | 'user-posts'
  | 'post'
  | 'about'
  | 'files'
  | 'tags'
  | 'not-found'
  | 'plain'
>();

// Read params, per syntax.
expectTypeOf<RouteParams<'plain', R>>().toEqualTypeOf<{ p: string }>();
expectTypeOf<RouteParams<'user', R>>().toEqualTypeOf<{ id: string }>();
expectTypeOf<RouteParams<'files', R>>().toEqualTypeOf<{ parts: string[] }>();
expectTypeOf<RouteParams<'tags', R>>().toEqualTypeOf<{ tags: string[] }>();
expectTypeOf<RouteParams<'not-found', R>>().toEqualTypeOf<{ pathMatch: string[] }>();
// A route without params takes no keys.
expectTypeOf<RouteParams<'home', R>>().toEqualTypeOf<Record<string, never>>();
expectTypeOf<Raw<'home'>>().toEqualTypeOf<Record<string, never>>();
// Children join the parent path: '' is the parent, an absolute child stays absolute, two levels.
expectTypeOf<RouteParams<'user-index', R>>().toEqualTypeOf<{ id: string }>();
expectTypeOf<RouteParams<'user-posts', R>>().toEqualTypeOf<{ id: string; postId?: string }>();
expectTypeOf<RouteParams<'post', R>>().toEqualTypeOf<{
  id: string;
  postId?: string;
  slug: string;
}>();
expectTypeOf<RouteParams<'about', R>>().toEqualTypeOf<{ section: string }>();

// Write params, per syntax.
expectTypeOf<Raw<'plain'>>().toEqualTypeOf<{ p: string | number }>();
expectTypeOf<Raw<'user'>>().toEqualTypeOf<{ id: string | number }>();
expectTypeOf<Raw<'user-posts'>>().toEqualTypeOf<{
  id: string | number;
  postId?: string | number | null;
}>();
expectTypeOf<Raw<'files'>>().toEqualTypeOf<{ parts: readonly (string | number)[] }>();
expectTypeOf<Raw<'tags'>>().toEqualTypeOf<{ tags?: readonly (string | number)[] }>();
expectTypeOf<Raw<'not-found'>>().toEqualTypeOf<{ pathMatch?: readonly (string | number)[] }>();

// Named locations.
const to = (location: RouteLocationRaw<R>) => location;
to({ name: 'home' });
to({ name: 'tags' });
to({ name: 'user', params: { id: 1 }, query: { q: 'a' }, hash: '#top', replace: true });
to({ name: 'user-posts', params: { id: '1', postId: null } });
to({ query: { page: 2 } });
to({ path: '/users/1' });
to('/users/1');
// @ts-expect-error a required param needs params
to({ name: 'user' });
// @ts-expect-error an unknown name
to({ name: 'usr' });
// @ts-expect-error an unknown param
to({ name: 'user', params: { id: 1, extra: 2 } });
// @ts-expect-error a route without params takes no params
to({ name: 'home', params: { id: 1 } });
// @ts-expect-error params is an object
to({ name: 'home', params: 5 });
// @ts-expect-error params is an object
to({ name: 'home', params: 'x' as string });
// @ts-expect-error name and path exclude each other
to({ name: 'home', path: '/' });
// @ts-expect-error a required param has the wrong type
to({ name: 'files', params: { parts: 'a' } });

// createRouter() infers the routes from an inline literal and from defineRoutes().
const history = createMemoryHistory();
const router = createRouter({ history, routes });
expectTypeOf(router).toEqualTypeOf<Router<R>>();
// A typed router is still any router, for code that takes routers of every route table.
expectTypeOf(router).toExtend<AnyRouter>();
const inline = createRouter({ history, routes: [{ path: '/a/:x', name: 'a' }] });
expectTypeOf(inline).toEqualTypeOf<
  Router<readonly [{ readonly path: '/a/:x'; readonly name: 'a' }]>
>();
expectTypeOf(inline.currentRoute.value.params).toEqualTypeOf<
  { x: string } | Record<string, string | string[]>
>();

// The current route narrows on its name.
const current = router.currentRoute.value;
if (current.name === 'user') expectTypeOf(current.params).toEqualTypeOf<{ id: string }>();
if (current.name === undefined) {
  expectTypeOf(current.params).toEqualTypeOf<Record<string, string | string[]>>();
}
expectTypeOf<RouteLocationOf<'user-posts', R>['params']>().toEqualTypeOf<{
  id: string;
  postId?: string;
}>();
expectTypeOf(router.resolve({ name: 'files', params: { parts: [1] } })).toExtend<
  RouteLocation<R>
>();
const resolved = router.resolve('/files/a');
if (resolved.name === 'files') expectTypeOf(resolved.params.parts).toEqualTypeOf<string[]>();

// Guards receive typed locations and return typed redirects.
router.beforeEach((target) => {
  if (target.name === 'user') expectTypeOf(target.params.id).toEqualTypeOf<string>();
  return { name: 'home' };
});
// @ts-expect-error a guard redirects to an unknown name
router.beforeEach(() => ({ name: 'usr' }));
// @ts-expect-error push() rejects a named location without its required params
void router.push({ name: 'post', params: { id: 1 } });

// Without R, every type is loose.
expectTypeOf<RouteName>().toEqualTypeOf<string>();
expectTypeOf<RouteParams>().toEqualTypeOf<Record<string, string | string[]>>();
expectTypeOf<RouteParams<'anything'>>().toEqualTypeOf<Record<string, string | string[]>>();
expectTypeOf<RouteParamsRaw>().toEqualTypeOf<
  Record<string, string | number | readonly (string | number)[] | null | undefined>
>();
expectTypeOf<RouteLocation['name']>().toEqualTypeOf<string | undefined>();
expectTypeOf<RouteLocation['params']>().toEqualTypeOf<Record<string, string | string[]>>();
const loose: RouteLocationRaw[] = [
  { name: 'anything' },
  { name: 'anything', params: { id: 1, rest: ['a'] } },
  { path: '/x', query: { a: '1' } },
  { hash: '#x' },
];
const guard: NavigationGuard = (target) => target.name === 'any' && { name: 'other' };
void [loose, guard];
// Routes built at runtime give the loose router.
const anyRoutes: readonly RouteRecordRaw[] = routes;
const untyped = createRouter({ history, routes: anyRoutes });
expectTypeOf(untyped).toEqualTypeOf<Router>();
void untyped.push({ name: 'anything', params: { id: 1 } });
untyped.beforeEach(guard);

// Without a registered router, the composables and components are loose.
expectTypeOf(useRouter()).toEqualTypeOf<Router>();
expectTypeOf(useRoute()).toEqualTypeOf<RouteLocation>();
expectTypeOf(useRoute('anything').params).toEqualTypeOf<Record<string, string | string[]>>();
const link = useLink({ to: () => ({ name: 'anything' }), replace: true });
expectTypeOf(link.href).toEqualTypeOf<ComputedRef<string>>();
expectTypeOf(link.isActive).toEqualTypeOf<ComputedRef<boolean>>();
expectTypeOf<ReturnType<typeof link.navigate>>().toEqualTypeOf<
  Promise<NavigationFailure | undefined>
>();
expectTypeOf<ComponentProps<typeof RouterLink>>().toExtend<RouterLinkProps>();
// The attributes of `<a>` fall through.
expectTypeOf<ComponentProps<typeof RouterLink>>().toHaveProperty('target');
expectTypeOf<ComponentProps<typeof RouterLink>>().toHaveProperty('class');
expectTypeOf<RouterLinkProps['to']>().toEqualTypeOf<RouteLocationRaw>();
expectTypeOf<ComponentSlots<typeof RouterLink>>().toEqualTypeOf<{ default?: Slot<{}> }>();
// RouterView takes no props.
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- the props of RouterView are `{}`
expectTypeOf<keyof ComponentProps<typeof RouterView>>().toBeNever();
