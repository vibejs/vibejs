import { createMemoryHistory, createRouter } from '@vibejs-org/ui/router';
import { routes } from './routes.ts';

export const router = createRouter({ history: createMemoryHistory(), routes });

declare module '@vibejs-org/ui/router' {
  interface Register {
    router: typeof router;
  }
}
