import { createMemoryHistory, createRouter, defineRoutes } from '@usevibejs/ui/router'
import HomePage from './HomePage.vibe'

export const routes = defineRoutes([
  { path: '/', name: 'home', component: HomePage },
  { path: '/users/:id', name: 'user', component: HomePage },
])

export const router = createRouter({ history: createMemoryHistory(), routes })

declare module '@usevibejs/ui/router' {
  interface Register {
    router: typeof router
  }
}
