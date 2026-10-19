// oxlint-disable typescript/no-extraneous-class -- modules and providers are plain classes
import { defineContract, get } from '@vibejs-org/contract';
import { expectTypeOf } from 'vitest';
import { token } from '../di/token.ts';
import { Controller, Module } from './decorators.ts';
import type { DynamicModule, ModuleImport, ModuleOptions } from './graph.ts';
import type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
} from './lifecycle.ts';

const contract = defineContract('/items', { list: get('/') });

class Service {}
class WithParams {
  readonly id: number;
  constructor(id: number) {
    this.id = id;
  }
}

Module({ providers: [Service], controllers: [Service] });
// @ts-expect-error a provider has no constructor parameters
Module({ providers: [WithParams] });
// @ts-expect-error a controller has no constructor parameters
Module({ controllers: [WithParams] });
// @ts-expect-error a controller has no constructor parameters
Controller(contract)(WithParams);

@Module({})
class LibModule {}
const Name = token<string>('name');
const dynamic: DynamicModule = { module: LibModule, providers: [{ provide: Name, useValue: 'a' }] };
expectTypeOf(dynamic).toExtend<ModuleImport>();
expectTypeOf(LibModule).toExtend<ModuleImport>();
expectTypeOf({ exports: [Name, Service, LibModule, dynamic] }).toExtend<ModuleOptions>();
// @ts-expect-error an export is a token or a module
expectTypeOf({ exports: ['name'] }).toExtend<ModuleOptions>();

@Module({ imports: [dynamic], exports: [dynamic] })
class AppModule
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy, OnApplicationShutdown
{
  onModuleInit(): void {}
  async onApplicationBootstrap(): Promise<void> {}
  onModuleDestroy(): void {}
  onApplicationShutdown(signal?: string): void {
    expectTypeOf(signal).toEqualTypeOf<string | undefined>();
  }
}
expectTypeOf(AppModule).toExtend<ModuleImport>();
