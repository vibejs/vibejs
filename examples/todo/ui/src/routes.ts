import { defineRoutes, type Router } from '@usevibejs/ui/router';
import TodoPage from './pages/TodoPage.vibe';
import TodosPage from './pages/TodosPage.vibe';

export const routes = defineRoutes([
  { name: 'todos', path: '/', component: TodosPage },
  { name: 'todo', path: '/todos/:id', component: TodoPage },
]);

declare module '@usevibejs/ui/router' {
  interface Register {
    // oxlint-disable-next-line typescript/no-unnecessary-type-arguments -- the default is these routes, through this declaration
    router: Router<typeof routes>;
  }
}
