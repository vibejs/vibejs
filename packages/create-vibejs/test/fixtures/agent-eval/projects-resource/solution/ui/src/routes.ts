import { defineRoutes } from '@usevibejs/ui/router';
import HomePage from './pages/HomePage.vibe';

export const routes = defineRoutes([
  { path: '/', name: 'home', component: HomePage },
  { path: '/projects', component: () => import('./pages/ProjectsPage.vibe') },
]);
