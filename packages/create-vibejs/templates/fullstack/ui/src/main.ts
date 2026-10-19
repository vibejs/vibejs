import { createApp } from '@vibejs-org/ui';
import { createRouter, createWebHistory } from '@vibejs-org/ui/router';
import App from './App.vibe';
import { API, createApi } from './api.ts';
import { routes } from './routes.ts';

createApp(App)
  .use(createRouter({ history: createWebHistory(), routes }))
  .provide(API, createApi())
  .mount('#app');
