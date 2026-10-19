// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import type { Provider } from './di/injector.ts';
import type { Token } from './di/token.ts';
import { createApp, type App, type AppOptions } from './http/app.ts';
import { Module } from './module/decorators.ts';
import type { ModuleOptions } from './module/graph.ts';

export interface TestingModuleBuilder {
  /** Replaces `token` in every module that provides it; the last override of a token wins. */
  overrideProvider<T>(token: Token<T>): OverrideBuilder<T>;
  /** Scans with the overrides, builds, runs init hooks; same `App` as production. */
  compile(): Promise<App>;
}

export interface OverrideBuilder<T> {
  useValue(value: T): TestingModuleBuilder;
  useClass(cls: new () => T): TestingModuleBuilder;
  useFactory(
    factory: (...deps: never[]) => T | Promise<T>,
    inject?: readonly Token<unknown>[],
  ): TestingModuleBuilder;
}

export const Test = {
  /** A synthetic root module (`TestingModule`) with these imports, providers and controllers. */
  createTestingModule(options: ModuleOptions & AppOptions): TestingModuleBuilder {
    const { imports, providers, controllers, exports, global, ...appOptions } = options;
    class TestingModule {}
    Module({ imports, providers, controllers, exports, global })(TestingModule);
    const overrides = new Map<Token<unknown>, Provider>();
    const override = (provider: Provider & { readonly provide: Token<unknown> }) => {
      overrides.set(provider.provide, provider);
      return builder;
    };
    const builder: TestingModuleBuilder = {
      overrideProvider: (provide) => ({
        useValue: (useValue) => override({ provide, useValue }),
        useClass: (useClass) => override({ provide, useClass }),
        useFactory: (useFactory, inject) => override({ provide, useFactory, inject }),
      }),
      compile: () => createApp(TestingModule, appOptions, new Map(overrides)),
    };
    return builder;
  },
};
