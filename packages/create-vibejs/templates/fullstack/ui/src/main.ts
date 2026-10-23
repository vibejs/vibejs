import { createApp } from '@usevibejs/ui';
import { createRouter, createWebHistory } from '@usevibejs/ui/router';
import App from './App.vibe';
import { API, createApi } from './api.ts';
import { routes } from './routes.ts';

const router = createRouter({ history: createWebHistory(), routes });

// Types route names and params in every router API, RouterLink included.
declare module '@usevibejs/ui/router' {
  interface Register {
    router: typeof router;
  }
}

createApp(App).use(router).provide(API, createApi()).mount('#app');
