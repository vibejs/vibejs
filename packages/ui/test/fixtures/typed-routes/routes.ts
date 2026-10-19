import { defineRoutes } from '@vibejs-org/ui/router';

const Home = {};

export const routes = defineRoutes([
  { path: '/', name: 'home', component: Home },
  {
    path: '/users/:id(\\d+)',
    name: 'user',
    component: () => import('./user-page.ts').then((page) => page.UserPage),
    children: [{ path: 'posts/:postId?', name: 'user-posts' }],
  },
  { path: '/:pathMatch(.*)*', name: 'not-found' },
]);
