// oxlint-disable typescript/no-extraneous-class -- type fixtures
import { expectTypeOf } from 'vitest';
import { token } from './di/token.ts';
import type { App } from './http/app.ts';
import { Test, type TestingModuleBuilder } from './testing.ts';

class Clock {
  now(): string {
    return 'now';
  }
}
abstract class Store {
  abstract read(): string;
}
class MemoryStore extends Store {
  read(): string {
    return 'memory';
  }
}
class NeedsArgs extends Clock {
  readonly zone: string;
  constructor(zone: string) {
    super();
    this.zone = zone;
  }
}
const Port = token<number>('Port');

declare const builder: TestingModuleBuilder;

// useValue checks the value against the token's type.
expectTypeOf(
  builder.overrideProvider(Clock).useValue(new Clock()),
).toEqualTypeOf<TestingModuleBuilder>();
expectTypeOf(builder.overrideProvider(Port).useValue(80)).toEqualTypeOf<TestingModuleBuilder>();
expectTypeOf(
  builder.overrideProvider(Store).useValue(new MemoryStore()),
).toEqualTypeOf<TestingModuleBuilder>();
// @ts-expect-error a string is not a Clock
builder.overrideProvider(Clock).useValue('now');
// @ts-expect-error a string is not a number
builder.overrideProvider(Port).useValue('80');
// @ts-expect-error a Clock is not a Store
builder.overrideProvider(Store).useValue(new Clock());

// useClass takes a class without constructor parameters and a compatible instance.
expectTypeOf(
  builder.overrideProvider(Store).useClass(MemoryStore),
).toEqualTypeOf<TestingModuleBuilder>();
// @ts-expect-error constructor parameters
builder.overrideProvider(Clock).useClass(NeedsArgs);
// @ts-expect-error a MemoryStore is not a Clock
builder.overrideProvider(Clock).useClass(MemoryStore);

// useFactory checks the return type and accepts a promise.
expectTypeOf(
  builder.overrideProvider(Port).useFactory(() => 80),
).toEqualTypeOf<TestingModuleBuilder>();
expectTypeOf(
  builder.overrideProvider(Port).useFactory(async (base: number) => base + 1, [Port]),
).toEqualTypeOf<TestingModuleBuilder>();
// @ts-expect-error a string is not a number
builder.overrideProvider(Port).useFactory(() => '80');
// @ts-expect-error a promise of a string is not a number
builder.overrideProvider(Port).useFactory(async () => '80');

expectTypeOf(builder.compile()).toEqualTypeOf<Promise<App>>();

// createTestingModule takes module and app options, nothing else.
expectTypeOf(
  Test.createTestingModule({ imports: [], providers: [Clock], basePath: '/api', bodyLimit: 1 }),
).toEqualTypeOf<TestingModuleBuilder>();
// @ts-expect-error unknown option
Test.createTestingModule({ provider: [Clock] });
