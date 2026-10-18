// oxlint-disable typescript/no-extraneous-class -- providers are plain classes
import { expectTypeOf } from 'vitest';
import {
  inject,
  runInInjectionContext,
  token,
  type InjectionToken,
  type Injector,
  type Provider,
} from '../index.ts';

class Db {}
abstract class Repo {
  abstract find(): string;
}
class MemoryRepo extends Repo {
  find(): string {
    return 'memory';
  }
}
class WithParams {
  readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }
}
const Name = token<string>('name');
declare const injector: Injector;

expectTypeOf(inject(Db)).toEqualTypeOf<Db>();
expectTypeOf(inject(Repo)).toEqualTypeOf<Repo>();
expectTypeOf(inject(Name)).toEqualTypeOf<string>();
expectTypeOf(inject(Db, { optional: true })).toEqualTypeOf<Db | undefined>();
expectTypeOf(inject(Name, { optional: true })).toEqualTypeOf<string | undefined>();
expectTypeOf(runInInjectionContext(injector, () => 1)).toEqualTypeOf<number>();
expectTypeOf(injector.get(Repo)).toEqualTypeOf<Repo>();

expectTypeOf<InjectionToken<string>>().not.toExtend<InjectionToken<number>>();
// @ts-expect-error a string token is not a number token
expectTypeOf(Name).toEqualTypeOf<InjectionToken<number>>();

expectTypeOf([
  Db,
  { provide: Repo, useClass: MemoryRepo },
  { provide: Name, useValue: 'vibe' },
  { provide: Name, useFactory: (db: Db) => db, inject: [Db] },
  { provide: Name, useFactory: async () => 'vibe' },
  { provide: Repo, useExisting: MemoryRepo },
]).toExtend<Provider[]>();

// @ts-expect-error a provider class takes no constructor parameters
expectTypeOf(WithParams).toExtend<Provider>();
// @ts-expect-error useClass takes a class without constructor parameters
expectTypeOf({ provide: Db, useClass: WithParams }).toExtend<Provider>();
// @ts-expect-error an abstract class cannot be constructed as a provider
expectTypeOf(Repo).toExtend<Provider>();
