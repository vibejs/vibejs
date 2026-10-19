// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
// A decorated application that runs the module layer end to end. The Vitest suite runs it through
// Oxc, and the integration suite runs the tsc emit of this file on Node; both logs must match.
import { defineContract, get } from '@vibejs-org/contract';
import * as v from 'valibot';
import { inject, instantiate, recordValue, type ProviderRecord } from '../di/injector.ts';
import { token, tokenName } from '../di/token.ts';
import type { CanActivate, Ctx, RequestContext } from '../http/context.ts';
import {
  Controller,
  createMetadata,
  Handle,
  Module,
  UseGuards,
  type MetadataKey,
} from './decorators.ts';
import { scan, type DynamicModule } from './graph.ts';
import {
  init,
  shutdown,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleDestroy,
  type OnModuleInit,
} from './lifecycle.ts';

let log: string[] = [];

const users = defineContract('/users', {
  one: get('/:id', { response: v.object({ id: v.string(), greeting: v.string() }) }),
});

const Roles = createMetadata<string[]>('roles');
const Greeting = token<string>('Greeting');

class Clock implements OnModuleInit {
  readonly now = (): number => 42;
  onModuleInit(): void {
    log.push('Clock.onModuleInit');
  }
}

@Module({ global: true, providers: [Clock], exports: [Clock] })
class CoreModule {}

@Module({})
class ConfigModule {
  static forRoot(greeting: string): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: Greeting, useFactory: async () => greeting }],
      exports: [Greeting],
    };
  }
}

class UsersService implements OnModuleDestroy {
  private readonly clock = inject(Clock);
  private readonly greeting = inject(Greeting);
  find(id: string): { id: string; greeting: string } {
    return { id, greeting: `${this.greeting} at ${this.clock.now()}` };
  }
  onModuleDestroy(): void {
    log.push('UsersService.onModuleDestroy');
  }
}

abstract class LoggingGuard implements CanActivate {
  canActivate(ctx: RequestContext): boolean {
    log.push(`${this.constructor.name} roles=${String(ctx.getMetadata(Roles))}`);
    return true;
  }
}
class SessionGuard extends LoggingGuard {}
class AuditGuard extends LoggingGuard {}
class AdminGuard extends LoggingGuard {}

@Controller(users)
@UseGuards(SessionGuard)
@Roles(['user'])
class BaseUsersController {
  protected readonly users = inject(UsersService);

  @Handle(users.one)
  @UseGuards(AdminGuard)
  @Roles(['admin'])
  one(ctx: Ctx<typeof users.one>): { id: string; greeting: string } {
    return this.users.find(ctx.params.id);
  }
}

@UseGuards(AuditGuard)
class UsersController extends BaseUsersController implements OnApplicationBootstrap {
  onApplicationBootstrap(): void {
    log.push('UsersController.onApplicationBootstrap');
  }
}

@Module({
  imports: [ConfigModule.forRoot('hello')],
  providers: [UsersService],
  controllers: [UsersController],
})
class UsersModule {}

@Module({ imports: [CoreModule, UsersModule] })
class AppModule implements OnApplicationShutdown {
  onApplicationShutdown(signal?: string): void {
    log.push(`AppModule.onApplicationShutdown(${String(signal)})`);
  }
}

const instances = <T>(records: readonly ProviderRecord[], cls: abstract new () => T): T[] =>
  records.map((rec) => recordValue(rec)).filter((value): value is T => value instanceof cls);

/** Scans, builds, binds, inits and shuts down the application; returns what happened. */
export async function runFixture(): Promise<readonly string[]> {
  log = [];
  const graph = scan(AppModule);
  log.push(`modules ${graph.modules.map((m) => m.path).join(' | ')}`);
  log.push(`records ${graph.records.map((r) => tokenName(r.token)).join(', ')}`);
  await instantiate(graph.records);
  await init(graph);
  for (const binding of graph.routes) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stand-in for the context that the HTTP pipeline builds
    const ctx = {
      params: { id: '7' },
      getMetadata: (key: MetadataKey<unknown>) => binding.metadata.get(key),
    } as unknown as Ctx<typeof users.one>;
    for (const guard of instances(binding.guards, LoggingGuard)) guard.canActivate(ctx);
    for (const controller of instances([binding.controller], BaseUsersController)) {
      const reply = JSON.stringify(controller.one(ctx));
      log.push(`${binding.route.method} ${binding.route.path} -> ${reply}`);
    }
  }
  await shutdown(graph, 'SIGTERM');
  return log;
}
