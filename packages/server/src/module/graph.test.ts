// oxlint-disable typescript/no-extraneous-class -- modules and providers are plain classes
import { defineContract, get as route } from '@vibejs-org/contract';
import { describe, expect, it } from 'vitest';
import { get, inject, instantiate, type Scope } from '../di/injector.ts';
import { token } from '../di/token.ts';
import type { CanActivate } from '../http/context.ts';
import { Controller, Handle, Module, UseGuards } from './decorators.ts';
import {
  scan,
  type DynamicModule,
  type ModuleGraph,
  type ModuleImport,
  type ModuleNode,
} from './graph.ts';

const T = token<string>('T');
const nonEmpty = expect.arrayContaining([expect.any(String)]);

async function boot(root: ModuleImport): Promise<ModuleGraph> {
  const graph = scan(root);
  await instantiate(graph.records);
  return graph;
}

function scopeOf(graph: ModuleGraph, module: ModuleImport): Scope {
  const node: ModuleNode | undefined = graph.modules.find((m) => m.module === module);
  if (!node) throw new Error('module not scanned');
  return node.scope;
}

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

const value = (v: string) => ({ provide: T, useValue: v });

describe('visibility', () => {
  it('sees own providers and only the exported providers of imports', async () => {
    class Shared {}
    class Hidden {}
    @Module({ providers: [Shared, Hidden], exports: [Shared] })
    class LibModule {}
    @Module({ imports: [LibModule] })
    class FeatureModule {}
    @Module({})
    class SiblingModule {}
    @Module({ imports: [FeatureModule, SiblingModule] })
    class AppModule {}
    const graph = await boot(AppModule);

    expect(get(scopeOf(graph, LibModule), Hidden)).toBeInstanceOf(Hidden);
    expect(get(scopeOf(graph, FeatureModule), Shared)).toBe(get(scopeOf(graph, LibModule), Shared));
    expect(() => get(scopeOf(graph, FeatureModule), Hidden)).toThrow(
      expect.objectContaining({
        code: 'VIBE9102',
        args: expect.objectContaining({ module: 'AppModule > FeatureModule' }),
      }),
    );
    expect(() => get(scopeOf(graph, SiblingModule), Shared)).toThrow(
      expect.objectContaining({ code: 'VIBE9102' }),
    );
    expect(() => get(graph.root.scope, Shared)).toThrow(
      expect.objectContaining({ code: 'VIBE9102' }),
    );
  });

  it('rejects inject() of a provider that the import does not export', async () => {
    class Hidden {}
    @Module({ providers: [Hidden] })
    class LibModule {}
    class Consumer {
      readonly hidden = inject(Hidden);
    }
    @Module({ imports: [LibModule], providers: [Consumer] })
    class AppModule {}
    await expect(boot(AppModule)).rejects.toMatchObject({
      code: 'VIBE9102',
      args: { token: 'Hidden', module: 'AppModule', chain: 'Consumer -> Hidden' },
    });
  });

  it("passes a re-exported module's exports on to the importer's importer", async () => {
    class Shared {}
    @Module({ providers: [Shared], exports: [Shared] })
    class LibModule {}
    @Module({ imports: [LibModule], exports: [LibModule] })
    class FeatureModule {}
    @Module({ imports: [FeatureModule] })
    class AppModule {}
    const graph = await boot(AppModule);
    expect(get(graph.root.scope, Shared)).toBe(get(scopeOf(graph, LibModule), Shared));
  });

  it("shows a global module's exports to modules that do not import it", async () => {
    class Clock {}
    @Module({ global: true, providers: [Clock], exports: [Clock] })
    class CoreModule {}
    @Module({})
    class FeatureModule {}
    @Module({ imports: [CoreModule, FeatureModule] })
    class AppModule {}
    const graph = await boot(AppModule);
    expect(get(scopeOf(graph, FeatureModule), Clock)).toBe(get(graph.root.scope, Clock));
    expect(graph.modules.map((m) => m.global)).toEqual([true, false, false]);
  });

  it('looks up own providers, then imports in order, then globals', async () => {
    @Module({ global: true, providers: [value('global')], exports: [T] })
    class GlobalModule {}
    @Module({ providers: [value('first')], exports: [T] })
    class FirstModule {}
    @Module({ providers: [value('second')], exports: [T] })
    class SecondModule {}
    @Module({ imports: [FirstModule, SecondModule], providers: [value('own')] })
    class OwnModule {}
    @Module({ imports: [SecondModule, FirstModule] })
    class ImportsModule {}
    @Module({})
    class PlainModule {}
    @Module({ imports: [GlobalModule, OwnModule, ImportsModule, PlainModule] })
    class AppModule {}
    const graph = await boot(AppModule);
    expect(get(scopeOf(graph, OwnModule), T)).toBe('own');
    expect(get(scopeOf(graph, ImportsModule), T)).toBe('second');
    expect(get(scopeOf(graph, PlainModule), T)).toBe('global');
  });

  it('keeps the last provider for a token within a module', async () => {
    @Module({ providers: [value('first'), value('last')] })
    class AppModule {}
    const graph = await boot(AppModule);
    expect(get(graph.root.scope, T)).toBe('last');
    expect(graph.records.map((rec) => rec.token)).toEqual([T, AppModule]);
  });

  it('builds a provider re-exported into two modules once', async () => {
    class Shared {}
    @Module({ providers: [Shared], exports: [Shared] })
    class LibModule {}
    @Module({ imports: [LibModule], exports: [LibModule] })
    class AModule {}
    @Module({ imports: [LibModule] })
    class BModule {}
    @Module({ imports: [AModule, BModule] })
    class AppModule {}
    const graph = await boot(AppModule);
    expect(get(scopeOf(graph, AModule), Shared)).toBe(get(scopeOf(graph, BModule), Shared));
    expect(graph.modules.map((m) => m.path)).toEqual([
      'AppModule > AModule > LibModule',
      'AppModule > AModule',
      'AppModule > BModule',
      'AppModule',
    ]);
    expect(graph.modules[1].imports).toEqual([graph.modules[0]]);
  });
});

describe('dynamic modules', () => {
  class Static {}

  @Module({ providers: [Static, value('static')], exports: [Static, T] })
  class ConfigModule {
    static forRoot(v: string, global?: boolean): DynamicModule {
      return { module: ConfigModule, providers: [value(v)], exports: [T], global };
    }
  }

  it('merges with the static options, static first', async () => {
    const config = ConfigModule.forRoot('dynamic');
    @Module({ imports: [config] })
    class AppModule {}
    const graph = await boot(AppModule);
    const node = graph.modules[0];
    expect(node).toMatchObject({ module: config, path: 'AppModule > ConfigModule', global: false });
    expect(node.hookTargets.map((rec) => rec.token)).toEqual([Static, T, ConfigModule]);
    expect(get(graph.root.scope, T)).toBe('dynamic');
  });

  it('is global when either the static or the dynamic options say so', () => {
    @Module({ global: true })
    class GlobalModule {
      static forRoot(): DynamicModule {
        return { module: GlobalModule };
      }
    }
    expect(scan(GlobalModule.forRoot()).root.global).toBe(true);
    expect(scan(ConfigModule.forRoot('x', true)).root.global).toBe(true);
  });

  it('takes an async factory provider for forRootAsync', async () => {
    class Env {
      readonly name = 'test';
    }
    @Module({ global: true, providers: [Env], exports: [Env] })
    class EnvModule {}
    @Module({})
    class DbModule {
      static forRootAsync(options: {
        useFactory: (env: Env) => Promise<string>;
        inject: [typeof Env];
      }): DynamicModule {
        return { module: DbModule, providers: [{ provide: T, ...options }], exports: [T] };
      }
    }
    const db = DbModule.forRootAsync({
      useFactory: async (env) => `db:${env.name}`,
      inject: [Env],
    });
    @Module({ imports: [EnvModule, db] })
    class AppModule {}
    const graph = await boot(AppModule);
    expect(get(graph.root.scope, T)).toBe('db:test');
  });

  it('treats one forRoot() object as one module and two calls as two modules', async () => {
    const shared = ConfigModule.forRoot('shared');
    @Module({ imports: [shared], exports: [shared] })
    class AModule {}
    @Module({ imports: [ConfigModule.forRoot('b')] })
    class BModule {}
    @Module({ imports: [AModule, shared, BModule] })
    class AppModule {}
    const graph = await boot(AppModule);
    expect(graph.modules.filter((m) => m.path.endsWith('ConfigModule'))).toHaveLength(2);
    expect(get(scopeOf(graph, AModule), T)).toBe('shared');
    expect(get(scopeOf(graph, BModule), T)).toBe('b');
    expect(get(scopeOf(graph, AModule), Static)).not.toBe(get(scopeOf(graph, BModule), Static));
    expect(get(graph.root.scope, Static)).toBe(get(scopeOf(graph, AModule), Static));
  });
});

describe('graph errors', () => {
  it('throws VIBE9201 for a plain class', () => {
    class Plain {}
    @Module({ imports: [Plain] })
    class AppModule {}
    const error = thrown(() => scan(AppModule));
    expect(error).toMatchObject({
      code: 'VIBE9201',
      args: { module: 'Plain', path: 'AppModule > Plain' },
      fixes: nonEmpty,
    });
    expect(error).toMatchInlineSnapshot(`
      [VibeError: [VIBE9201] Plain is imported at AppModule > Plain, but the class has no \`@Module()\` decorator.
        Fix: Add the \`@Module()\` decorator to the class Plain; an empty options object is enough.
        Fix: Import the module class itself instead of a class derived from it.
        Docs: https://vibejs.org/v0/errors/VIBE9201]
    `);
  });

  it('throws VIBE9201 for a dynamic module of a plain class and for a subclass of a module', () => {
    class Plain {}
    @Module({})
    class Base {}
    class Derived extends Base {}
    expect(thrown(() => scan({ module: Plain }))).toMatchObject({
      code: 'VIBE9201',
      args: { module: 'Plain', path: 'Plain' },
    });
    expect(thrown(() => scan(Derived))).toMatchObject({
      code: 'VIBE9201',
      args: { module: 'Derived' },
    });
  });

  it('throws VIBE9202 for an import cycle and accepts a diamond', () => {
    const imports: ModuleImport[] = [];
    @Module({ imports })
    class AModule {}
    @Module({ imports: [AModule] })
    class BModule {}
    imports.push(BModule);
    @Module({ imports: [AModule] })
    class AppModule {}
    const error = thrown(() => scan(AppModule));
    expect(error).toMatchObject({
      code: 'VIBE9202',
      args: { cycle: 'AModule > BModule > AModule' },
      fixes: nonEmpty,
    });
    expect(error).toMatchInlineSnapshot(`
      [VibeError: [VIBE9202] The modules import each other in a cycle: AModule > BModule > AModule.
        Fix: Move the providers that both modules need into a third module and import it in both.
        Docs: https://vibejs.org/v0/errors/VIBE9202]
    `);

    @Module({})
    class Shared {}
    @Module({ imports: [Shared] })
    class Left {}
    @Module({ imports: [Shared] })
    class Right {}
    @Module({ imports: [Left, Right] })
    class Diamond {}
    expect(scan(Diamond).modules.map((m) => m.module)).toEqual([Shared, Left, Right, Diamond]);
  });

  it('throws VIBE9203 for a foreign token and for a module that is not imported', () => {
    @Module({})
    class OtherModule {}
    @Module({ exports: [T] })
    class TokenModule {}
    @Module({ exports: [OtherModule] })
    class ModuleModule {}
    @Module({ exports: [{ module: OtherModule }] })
    class DynamicExport {}
    const error = thrown(() => scan(TokenModule));
    expect(error).toMatchObject({
      code: 'VIBE9203',
      args: { export: 'T', module: 'TokenModule' },
      fixes: nonEmpty,
    });
    expect(error).toMatchInlineSnapshot(`
      [VibeError: [VIBE9203] TokenModule exports T, which is neither one of its providers nor one of its imports.
        Fix: Add T to \`providers\` of TokenModule.
        Fix: Add the module T to \`imports\` of TokenModule.
        Docs: https://vibejs.org/v0/errors/VIBE9203]
    `);
    expect(thrown(() => scan(ModuleModule))).toMatchObject({
      args: { export: 'OtherModule', module: 'ModuleModule' },
    });
    expect(thrown(() => scan(DynamicExport))).toMatchObject({
      args: { export: 'OtherModule', module: 'DynamicExport' },
    });
  });
});

describe('construction order', () => {
  const contract = defineContract('/items', { list: route('/') });

  function app(log: string[]) {
    const logged = (name: string) =>
      class {
        constructor() {
          log.push(name);
        }
      };
    const LibService = logged('LibService');
    class Repo {
      constructor() {
        log.push('Repo');
      }
    }
    class Guard implements CanActivate {
      constructor() {
        log.push('Guard');
      }
      canActivate(): boolean {
        return true;
      }
    }
    @Module({ providers: [LibService], exports: [LibService] })
    class LibModule {
      readonly lib = inject(LibService);
      constructor() {
        log.push('LibModule');
      }
    }
    @Controller(contract)
    @UseGuards(Guard)
    class ItemsController {
      readonly repo = inject(Repo);
      readonly lib = inject(LibService);
      constructor() {
        log.push('ItemsController');
      }
      @Handle(contract.list)
      list(): void {}
    }
    @Module({ imports: [LibModule], providers: [Repo], controllers: [ItemsController] })
    class AppModule {
      constructor() {
        log.push('AppModule');
      }
    }
    return AppModule;
  }

  it('builds per module in post-order: providers, controllers, enhancers, module class', async () => {
    const runs = [];
    for (let i = 0; i < 2; i++) {
      const log: string[] = [];
      await boot(app(log));
      runs.push(log);
    }
    expect(runs[0]).toEqual([
      'LibService',
      'LibModule',
      'Repo',
      'ItemsController',
      'Guard',
      'AppModule',
    ]);
    expect(runs[1]).toEqual(runs[0]);
  });

  it('throws VIBE9104 for a controller, an enhancer and a module class with constructor parameters', () => {
    class WithParams {
      readonly id: number;
      constructor(id: number) {
        this.id = id;
      }
      canActivate(): boolean {
        return this.id > 0;
      }
      @Handle(contract.list)
      list(): void {}
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the runtime check behind the type
    const Cast = WithParams as unknown as new () => CanActivate;
    Controller(contract)(Cast);
    @Controller(contract)
    @UseGuards(Cast)
    class GuardedController {
      @Handle(contract.list)
      list(): void {}
    }
    @Module({ controllers: [Cast] })
    class ControllerModule {}
    @Module({ controllers: [GuardedController] })
    class EnhancerModule {}
    @Module({})
    class ParamsModule {
      readonly id: number;
      constructor(id: number) {
        this.id = id;
      }
    }
    for (const [root, name] of [
      [ControllerModule, 'WithParams'],
      [EnhancerModule, 'WithParams'],
      [ParamsModule, 'ParamsModule'],
    ] as const) {
      expect(thrown(() => scan(root))).toMatchObject({ code: 'VIBE9104', args: { token: name } });
    }
  });
});
