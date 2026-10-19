// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { defineContract, get } from '@vibejs-org/contract';
import { describe, expect, it, vi } from 'vitest';
import { caught } from '../../test/log.ts';
import { inject, token } from '../index.ts';
import { JsonLogger } from '../logger.ts';
import { Controller, Handle, Module, UseGuards } from '../module/decorators.ts';
import type { ModuleImport } from '../module/graph.ts';
import { inspect, VibeFactory } from './app.ts';
import type { CanActivate } from './context.ts';

const contract = defineContract('/things', { list: get('/') });

describe('inspect', () => {
  it('constructs no provider, controller, enhancer or lifecycle hook', () => {
    const calls = vi.fn<(what: string) => void>();
    const fail = (what: string): never => {
      calls(what);
      throw new Error(what);
    };
    const Factory = token<string>('Factory');
    class Service {
      constructor() {
        fail('Service');
      }
      onModuleInit(): void {
        fail('onModuleInit');
      }
    }
    class Deny implements CanActivate {
      constructor() {
        fail('Deny');
      }
      canActivate(): boolean {
        return fail('canActivate');
      }
    }
    @Controller(contract)
    @UseGuards(Deny)
    class ThingsController {
      readonly service = inject(Service);
      constructor() {
        fail('ThingsController');
      }
      @Handle(contract.list)
      list(): void {}
    }
    @Module({
      providers: [Service, { provide: Factory, useFactory: () => fail('Factory') }],
      controllers: [ThingsController],
    })
    class Root {
      onModuleInit(): void {
        fail('Root.onModuleInit');
      }
    }

    expect(inspect(Root, { guards: [Deny] })).toEqual({
      routes: [
        {
          method: 'GET',
          path: '/things',
          handler: 'ThingsController.list',
          guards: ['Deny', 'Deny'],
          interceptors: [],
          filters: [],
        },
      ],
      modules: [
        {
          path: 'Root',
          global: false,
          imports: [],
          exports: [],
          providers: ['Service', 'Factory'],
        },
      ],
    });
    expect(calls).not.toHaveBeenCalled();
  });

  it('throws the same scan errors as create', async () => {
    const silent = { logger: new JsonLogger({ level: 'silent' }) };
    const both = async (root: ModuleImport, options = {}) => {
      const fromInspect = await caught(() => inspect(root, options));
      const fromCreate = await caught(() => VibeFactory.create(root, { ...silent, ...options }));
      expect(fromInspect).toEqual(fromCreate);
      return fromInspect;
    };

    class Bare {}
    @Module({ imports: [Bare] })
    class Undecorated {}
    expect(await both(Undecorated)).toMatchObject({ code: 'VIBE9201' });

    const imports: ModuleImport[] = [];
    @Module({ imports })
    class Loop {}
    @Module({ imports: [Loop] })
    class Back {}
    imports.push(Back);
    expect(await both(Loop)).toMatchObject({ code: 'VIBE9202' });

    const twin = defineContract('/things', { all: get('/') });
    @Controller(contract)
    class A {
      @Handle(contract.list)
      list(): void {}
    }
    @Controller(twin)
    class B {
      @Handle(twin.all)
      all(): void {}
    }
    @Module({ controllers: [A, B] })
    class Duplicate {}
    expect(await both(Duplicate)).toMatchObject({ code: 'VIBE9401' });

    @Module({})
    class Empty {}
    expect(await both(Empty, { basePath: 'api' })).toMatchObject({ code: 'VIBE9405' });
  });
});
