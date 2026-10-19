// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { defineContract, get } from '@vibejs-org/contract';
import { describe, expect, it } from 'vitest';
import { instantiate } from '../di/injector.ts';
import { token } from '../di/token.ts';
import type { CanActivate } from '../http/context.ts';
import { Controller, Handle, Module, UseGuards } from './decorators.ts';
import { scan, type ModuleGraph, type ModuleImport } from './graph.ts';
import {
  init,
  shutdown,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleDestroy,
  type OnModuleInit,
} from './lifecycle.ts';

const contract = defineContract('/items', { list: get('/') });

async function boot(root: ModuleImport): Promise<ModuleGraph> {
  const graph = scan(root);
  await instantiate(graph.records);
  return graph;
}

/** A class whose four hooks record `<name>.<hook>`; `fail` names hooks that throw afterwards. */
function hooked(log: string[], name: string, fail: readonly string[] = []) {
  const record = (hook: string, signal?: string) => {
    log.push(signal === undefined ? `${name}.${hook}` : `${name}.${hook}(${signal})`);
    if (fail.includes(hook)) throw new Error(`${name}.${hook} failed`);
  };
  return class
    implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy, OnApplicationShutdown
  {
    onModuleInit(): void {
      record('onModuleInit');
    }
    onApplicationBootstrap(): void {
      record('onApplicationBootstrap');
    }
    onModuleDestroy(): void {
      record('onModuleDestroy');
    }
    onApplicationShutdown(signal?: string): void {
      record('onApplicationShutdown', signal);
    }
  };
}

function app(log: string[], fail: Record<string, readonly string[]> = {}) {
  const make = (name: string) => hooked(log, name, fail[name]);
  const LibService = class extends make('LibService') {};
  const Service = class extends make('Service') {};
  const Alias = token<object>('Alias');
  const Guard = class extends make('Guard') implements CanActivate {
    canActivate(): boolean {
      return true;
    }
  };
  @Module({ providers: [LibService] })
  class LibModule extends make('LibModule') {}
  @Controller(contract)
  @UseGuards(Guard)
  class ItemsController extends make('ItemsController') {
    @Handle(contract.list)
    list(): void {}
  }
  @Module({
    imports: [LibModule],
    providers: [
      Service,
      { provide: Alias, useExisting: Service },
      { provide: token('Value'), useValue: { onModuleInit: () => log.push('value.onModuleInit') } },
      { provide: token('Null'), useValue: null },
      { provide: token('Number'), useValue: 1 },
      { provide: token('Plain'), useValue: {} },
    ],
    controllers: [ItemsController],
  })
  class AppModule extends make('AppModule') {}
  return AppModule;
}

describe('init', () => {
  it('runs every onModuleInit before any onApplicationBootstrap, in post-order', async () => {
    const log: string[] = [];
    await init(await boot(app(log)));
    const order = ['LibService', 'LibModule', 'Service', 'ItemsController', 'Guard', 'AppModule'];
    expect(log).toEqual([
      ...order.slice(0, 3).map((name) => `${name}.onModuleInit`),
      'value.onModuleInit',
      ...order.slice(3).map((name) => `${name}.onModuleInit`),
      ...order.map((name) => `${name}.onApplicationBootstrap`),
    ]);
  });

  it('awaits async hooks one at a time', async () => {
    const log: string[] = [];
    const slow = (name: string) =>
      class {
        async onModuleInit(): Promise<void> {
          log.push(`${name} start`);
          await new Promise((resolve) => setTimeout(resolve, 5));
          log.push(`${name} end`);
        }
      };
    @Module({ providers: [slow('A'), slow('B')] })
    class AppModule {}
    await init(await boot(AppModule));
    expect(log).toEqual(['A start', 'A end', 'B start', 'B end']);
  });

  it('propagates an init hook error unchanged and stops', async () => {
    const log: string[] = [];
    const graph = await boot(app(log, { Service: ['onModuleInit'] }));
    await expect(init(graph)).rejects.toThrow(new Error('Service.onModuleInit failed'));
    expect(log).toEqual([
      'LibService.onModuleInit',
      'LibModule.onModuleInit',
      'Service.onModuleInit',
    ]);
  });

  it('rejects with the same error object the hook threw', async () => {
    const failure = new Error('init failed');
    class Failing {
      onModuleInit(): void {
        throw failure;
      }
    }
    @Module({ providers: [Failing] })
    class AppModule {}
    await expect(init(await boot(AppModule))).rejects.toBe(failure);
  });
});

describe('shutdown', () => {
  it('runs onModuleDestroy, then onApplicationShutdown(signal), in exact reverse order', async () => {
    const log: string[] = [];
    await shutdown(await boot(app(log)), 'SIGTERM');
    const reverse = ['AppModule', 'Guard', 'ItemsController', 'Service', 'LibModule', 'LibService'];
    expect(log).toEqual([
      ...reverse.map((name) => `${name}.onModuleDestroy`),
      ...reverse.map((name) => `${name}.onApplicationShutdown(SIGTERM)`),
    ]);
  });

  it('runs every hook and throws VIBE9204 with all errors in cause.errors', async () => {
    const log: string[] = [];
    const graph = await boot(
      app(log, { Service: ['onModuleDestroy'], LibModule: ['onApplicationShutdown'] }),
    );
    const error: unknown = await shutdown(graph).catch((e: unknown) => e);
    expect(log).toHaveLength(12);
    expect(error).toMatchObject({
      code: 'VIBE9204',
      args: { count: 2, hooks: 'Service.onModuleDestroy, LibModule.onApplicationShutdown' },
      fixes: expect.arrayContaining([expect.any(String)]),
      cause: {
        errors: [
          new Error('Service.onModuleDestroy failed'),
          new Error('LibModule.onApplicationShutdown failed'),
        ],
      },
    });
    expect(error).toMatchInlineSnapshot(`
      [VibeError: [VIBE9204] 2 shutdown hooks failed: Service.onModuleDestroy, LibModule.onApplicationShutdown.
        Fix: Read \`cause.errors\` of this error and fix each hook that is listed.
        Docs: https://vibejs.org/v0/errors/VIBE9204]
    `);
  });

  it('names failing hooks by token and runs the rest when a target has no prototype', async () => {
    const log: string[] = [];
    const destroy = (name: string) => () => {
      log.push(name);
      throw new Error(name);
    };
    const NullProto = token<object>('NullProto');
    const Later = hooked(log, 'Later');
    @Module({
      providers: [
        Later,
        {
          provide: NullProto,
          useValue: Object.assign(Object.create(null), { onModuleDestroy: destroy('nullproto') }),
        },
        class {
          onModuleDestroy = destroy('anonymous');
        },
      ],
    })
    class AppModule {}
    const error: unknown = await shutdown(await boot(AppModule)).catch((e: unknown) => e);
    expect(log).toEqual([
      'anonymous',
      'nullproto',
      'Later.onModuleDestroy',
      'Later.onApplicationShutdown',
    ]);
    expect(error).toMatchObject({
      code: 'VIBE9204',
      args: {
        count: 2,
        hooks: '<anonymous class>.onModuleDestroy, NullProto.onModuleDestroy',
      },
    });
  });
});
