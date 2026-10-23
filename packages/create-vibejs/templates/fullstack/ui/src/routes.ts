import { defineRoutes } from '@usevibejs/ui/router';
import HomePage from './pages/HomePage.vibe';

export const routes = defineRoutes([{ path: '/', name: 'home', component: HomePage }]);
