import { defineRoutes } from '@usevibejs/ui/router';
import AboutPage from './pages/AboutPage.vibe';
import HomePage from './pages/HomePage.vibe';

export const routes = defineRoutes([
  { path: '/', name: 'home', component: HomePage },
  { path: '/about', name: 'about', component: AboutPage },
]);
