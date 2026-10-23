import type { ComponentProps } from '@usevibejs/ui';
import { RouterLink, useLink, useRoute, useRouter } from '@usevibejs/ui/router';
import type {
  NavigationGuard,
  RouteLocationOf,
  RouteLocationRaw,
  RouteParams,
  Router,
} from '@usevibejs/ui/router';
import { router } from './router.ts';
import { routes300 } from './routes-300.ts';
import { UserPage } from './user-page.ts';

// The registered router types every default.
const registered: Router = router;
const label: string = UserPage.setup({ id: '1' }).label;

// currentRoute narrows on the name.
const current = router.currentRoute.value;
if (current.name === 'user') {
  const id: string = current.params.id;
  void id;
}
// @ts-expect-error not narrowed: other routes have no `id`
const notNarrowed: string = current.params.id;

// Guards narrow `to` and `from`, and redirect to registered names only.
const guard: NavigationGuard = (to, from) => {
  if (to.name === 'user-posts' && from.name === 'user') {
    const postId: string | undefined = to.params.postId;
    const id: string = from.params.id;
    void [postId, id];
  }
  return { name: 'home' };
};
router.beforeEach(guard);
// @ts-expect-error an unknown name
const badGuard: NavigationGuard = () => ({ name: 'usr' });

// push() and locations reject bad named locations.
void router.push({ name: 'user', params: { id: 1 } });
void router.push({ name: 'home' });
// @ts-expect-error the required `id` is missing
void router.push({ name: 'user' });
// @ts-expect-error an unknown name
const badRaw: RouteLocationRaw = { name: 'usr' };
// @ts-expect-error an unknown param
const badParam: RouteLocationRaw = { name: 'user', params: { userId: 1 } };

const params: RouteParams<'user'> = { id: '1' };
const ofUser: RouteLocationOf<'user'>['params'] = { id: '1' };
// @ts-expect-error `id` is a string when read
const badOf: RouteLocationOf<'user'>['params'] = { id: 1 };
// @ts-expect-error a route without params takes no params
const badHome: RouteLocationRaw = { name: 'home', params: { id: 1 } };
// @ts-expect-error `id` is a string when read
const numeric: RouteParams<'user'> = { id: 1 };

// 300 routes, with explicit R.
type R300 = typeof routes300;
const leaf: RouteParams<'r49-leaf', R300> = { id: '1', parts: ['a'], leaf: '2' };
const absolute: RouteParams<'r0-abs', R300> = { rest: [] };
// @ts-expect-error `leaf` is required
const badLeaf: RouteParams<'r49-leaf', R300> = { id: '1', parts: ['a'] };
// @ts-expect-error `rest` is an array
const badAbsolute: RouteParams<'r0-abs', R300> = { rest: 'a' };
const splat: RouteParams<'r1-abs', R300> = { pathMatch: ['a'] };
// @ts-expect-error a splat is an array
const badSplat: RouteParams<'r1-abs', R300> = { pathMatch: 'a' };
const to300: RouteLocationRaw<R300> = { name: 'r0-abs' };
const opt: RouteLocationRaw<R300> = { name: 'r25-opt', params: { id: 1, opt: null } };
// @ts-expect-error the required `id` is missing
const bad300: RouteLocationRaw<R300> = { name: 'r0' };
// @ts-expect-error an unknown name
const unknown300: RouteLocationRaw<R300> = { name: 'r50' };

export {
  absolute,
  bad300,
  badAbsolute,
  badGuard,
  badHome,
  badLeaf,
  badOf,
  badParam,
  badRaw,
  badSplat,
  label,
  leaf,
  notNarrowed,
  numeric,
  ofUser,
  opt,
  params,
  registered,
  splat,
  to300,
  unknown300,
};

// The composables and RouterLink take the registered routes.
const installed: typeof router = useRouter();
const userRoute = useRoute('user');
const userId: string = userRoute.params.id;
// @ts-expect-error an unknown name
useRoute('usr');
const current2 = useRoute();
if (current2.name === 'user-posts') {
  const postId: string | undefined = current2.params.postId;
  void postId;
}
const linkProps: ComponentProps<typeof RouterLink> = { to: { name: 'user', params: { id: 1 } } };
// @ts-expect-error an unknown name
const badLink: ComponentProps<typeof RouterLink> = { to: { name: 'usr' } };
// @ts-expect-error the required `id` is missing
useLink({ to: { name: 'user' } });
