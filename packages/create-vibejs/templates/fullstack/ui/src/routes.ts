import { defineRoutes } from '@vibejs-org/ui/router';
import HomePage from './pages/HomePage.vibe';

export const routes = defineRoutes([{ path: '/', component: HomePage }]);
