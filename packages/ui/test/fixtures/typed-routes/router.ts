import { createMemoryHistory, createRouter } from '@usevibejs/ui/router';
import { routes } from './routes.ts';

export const router = createRouter({ history: createMemoryHistory(), routes });

declare module '@usevibejs/ui/router' {
  interface Register {
    router: typeof router;
  }
}
