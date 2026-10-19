import { expect, it } from 'vitest';
import { runFixture } from './fixture.ts';

it('runs the decorated fixture app under Oxc', async () => {
  expect(await runFixture()).toMatchInlineSnapshot(`
    [
      "modules AppModule > CoreModule | AppModule > UsersModule > ConfigModule | AppModule > UsersModule | AppModule",
      "records Clock, CoreModule, Greeting, ConfigModule, UsersService, UsersController, SessionGuard, AuditGuard, AdminGuard, UsersModule, AppModule",
      "Clock.onModuleInit",
      "UsersController.onApplicationBootstrap",
      "SessionGuard roles=admin",
      "AuditGuard roles=admin",
      "AdminGuard roles=admin",
      "GET /users/:id -> {"id":"7","greeting":"hello at 42"}",
      "UsersService.onModuleDestroy",
      "AppModule.onApplicationShutdown(SIGTERM)",
    ]
  `);
});
