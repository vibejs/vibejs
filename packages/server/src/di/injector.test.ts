// oxlint-disable typescript/no-extraneous-class -- providers are plain classes
import { describe, expect, it } from 'vitest';
import { vibeError } from '../errors.gen.ts';
import {
  get,
  inject,
  instantiate,
  providerRecord,
  runInInjectionContext,
  type Injector,
  type Provider,
  type ProviderRecord,
  type Scope,
} from './injector.ts';
import { token, type Token } from './token.ts';

/** A scope that sees its own records, then the records of `imports`. */
function scope(path: string, providers: readonly Provider[], imports: readonly Scope[] = []) {
  const records: ProviderRecord[] = [];
  const self: Scope = {
    path,
    find: (key) =>
      records.find((rec) => rec.token === key) ??
      imports.map((other) => other.find(key)).find(Boolean),
  };
  records.push(...providers.map((provider) => providerRecord(provider, self)));
  return { scope: self, records };
}

async function boot(path: string, providers: readonly Provider[]): Promise<Scope> {
  const { scope: self, records } = scope(path, providers);
  await instantiate(records);
  return self;
}

/** An injector that knows only `values`, and throws VIBE9102 like the container for others. */
function stub(values: Map<Token<unknown>, unknown>): Injector {
  return {
    get: <T>(key: Token<T>): T => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test values match their tokens
      if (values.has(key)) return values.get(key) as T;
      throw vibeError('VIBE9102', { token: 'x', module: 'stub', chain: 'x' });
    },
  };
}

const nonEmpty = expect.arrayContaining([expect.any(String)]);
const Name = token<string>('name');

describe('injection context', () => {
  it('resolves field inject() in declaration order and in the constructor body', async () => {
    const log: string[] = [];
    class A {
      constructor() {
        log.push('A');
      }
    }
    class B {
      constructor() {
        log.push('B');
      }
    }
    class C {
      readonly a = inject(A);
      readonly b = inject(B);
      readonly again: A;
      constructor() {
        this.again = inject(A);
      }
    }
    const app = await boot('AppModule', [C, B, A]);
    const c = get(app, C);
    expect(log).toEqual(['A', 'B']);
    expect(c.a).toBeInstanceOf(A);
    expect(c.b).toBe(get(app, B));
    expect(c.again).toBe(c.a);
  });

  it('lets the sync part of a factory call inject()', async () => {
    class A {}
    const app = await boot('AppModule', [A, { provide: Name, useFactory: () => inject(A) }]);
    expect(get(app, Name)).toBe(get(app, A));
  });

  it('runs runInInjectionContext, nests it and restores the outer context', () => {
    const outer = stub(new Map([[Name, 'outer']]));
    const inner = stub(new Map([[Name, 'inner']]));
    expect(
      runInInjectionContext(outer, () => [
        inject(Name),
        runInInjectionContext(inner, () => inject(Name)),
        inject(Name),
      ]),
    ).toEqual(['outer', 'inner', 'outer']);
    const afterThrow = runInInjectionContext(outer, () => {
      expect(() =>
        runInInjectionContext(inner, () => {
          throw new Error('boom');
        }),
      ).toThrow('boom');
      return inject(Name);
    });
    expect(afterThrow).toBe('outer');
    expect(() => inject(Name)).toThrow(expect.objectContaining({ code: 'VIBE9101' }));
  });

  it('throws VIBE9101 for a bare inject() and for new outside the container', () => {
    class A {}
    class C {
      readonly a = inject(A);
    }
    expect(() => inject(A)).toThrow(
      expect.objectContaining({ code: 'VIBE9101', args: { token: 'A' }, fixes: nonEmpty }),
    );
    expect(() => new C()).toThrow(expect.objectContaining({ code: 'VIBE9101' }));
    expect(() => inject(A)).toThrowErrorMatchingInlineSnapshot(`
      [VibeError: [VIBE9101] inject(A) was called outside an injection context.
        Fix: Move \`inject(A)\` into a field initializer, such as \`private readonly dep = inject(A)\`.
        Fix: Call \`inject()\` before the first \`await\` of a factory or of a \`runInInjectionContext()\` callback.
        Fix: List A in the \`inject\` array of the factory and take it as a factory parameter.
        Docs: https://vibejs.org/v0/errors/VIBE9101]
    `);
  });

  it('throws VIBE9101 after an await in an async factory', async () => {
    class A {}
    const late = {
      provide: Name,
      useFactory: async () => {
        await Promise.resolve();
        return inject(A);
      },
    };
    await expect(boot('AppModule', [A, late])).rejects.toMatchObject({ code: 'VIBE9101' });
  });

  it('throws VIBE9101 after an await in an async runInInjectionContext callback', async () => {
    const injector = stub(new Map([[Name, 'value']]));
    const result = runInInjectionContext(injector, async () => {
      expect(inject(Name)).toBe('value');
      await Promise.resolve();
      return inject(Name);
    });
    await expect(result).rejects.toMatchObject({ code: 'VIBE9101' });
  });
});

describe('provider kinds', () => {
  it('builds class shorthand, useClass, useValue, factories and useExisting', async () => {
    abstract class Repo {
      abstract find(): string;
    }
    class MemoryRepo extends Repo {
      find(): string {
        return 'memory';
      }
    }
    class Db {}
    const Zero = token<number>('zero');
    const Missing = token<undefined>('missing');
    const Greeting = token<string>('greeting');
    const Later = token<string>('later');
    const Alias = token<Db>('alias');
    const app = await boot('AppModule', [
      Db,
      { provide: Repo, useClass: MemoryRepo },
      { provide: Zero, useValue: 0 },
      { provide: Missing, useValue: undefined },
      { provide: Name, useValue: 'vibe' },
      {
        provide: Greeting,
        useFactory: (name: string, zero: number, repo: Repo) => `${name} ${zero} ${repo.find()}`,
        inject: [Name, Zero, Repo],
      },
      {
        provide: Later,
        useFactory: async (greeting: string) => `${greeting}!`,
        inject: [Greeting],
      },
      { provide: Alias, useExisting: Db },
    ]);
    expect(get(app, Repo)).toBeInstanceOf(MemoryRepo);
    expect(get(app, Zero)).toBe(0);
    expect(get(app, Missing)).toBeUndefined();
    expect(runInInjectionContext({ get: (key) => get(app, key) }, () => inject(Missing))).toBe(
      undefined,
    );
    expect(get(app, Greeting)).toBe('vibe 0 memory');
    expect(get(app, Later)).toBe('vibe 0 memory!');
    expect(get(app, Alias)).toBe(get(app, Db));
  });

  it.each([
    ['{}', {}],
    ['{ provide } only', { provide: Name }],
    ['two kinds', { provide: Name, useValue: 1, useFactory: () => 2 }],
    ['null', null],
    ['a string', 'Db'],
  ])('throws VIBE9107 for %s', (_, provider) => {
    const { scope: self } = scope('AppModule', []);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- invalid providers on purpose
    expect(() => providerRecord(provider as Provider, self)).toThrow(
      expect.objectContaining({ code: 'VIBE9107', fixes: nonEmpty }),
    );
  });
});

describe('optional', () => {
  it('returns undefined for an unknown token and the instance for a visible one', async () => {
    class A {}
    class Unknown {}
    class C {
      readonly a = inject(A, { optional: true });
      readonly unknown = inject(Unknown, { optional: true });
    }
    const app = await boot('AppModule', [A, C]);
    expect(get(app, C).a).toBe(get(app, A));
    expect(get(app, C).unknown).toBeUndefined();
  });

  it('maps VIBE9102 from an Injector to undefined and lets other errors through', () => {
    const injector = stub(new Map([[Name, 'value']]));
    const Other = token<string>('other');
    runInInjectionContext(injector, () => {
      expect(inject(Name, { optional: true })).toBe('value');
      expect(inject(Other, { optional: true })).toBeUndefined();
      expect(() => inject(Other)).toThrow(expect.objectContaining({ code: 'VIBE9102' }));
    });
    const failing: Injector = {
      get: () => {
        throw new Error('down');
      },
    };
    expect(() => runInInjectionContext(failing, () => inject(Name, { optional: true }))).toThrow(
      'down',
    );
  });
});

describe('missing provider', () => {
  class Db {}
  class UsersService {
    readonly db = inject(Db);
  }
  class UsersController {
    readonly users = inject(UsersService);
  }

  it('reports the token, module, requester chain and fixes for a field inject()', async () => {
    const error: unknown = await boot('AppModule > UsersModule', [
      UsersController,
      UsersService,
    ]).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: 'VIBE9102',
      args: {
        token: 'Db',
        module: 'AppModule > UsersModule',
        chain: 'UsersController -> UsersService -> Db',
      },
      fixes: nonEmpty,
    });
    expect(error).toMatchInlineSnapshot(`
      [VibeError: [VIBE9102] No provider for Db is visible in AppModule > UsersModule (requested by UsersController -> UsersService -> Db).
        Fix: Add Db to \`providers\` of AppModule > UsersModule.
        Fix: Import a module that exports Db into AppModule > UsersModule.
        Fix: Pass the option \`optional: true\` to \`inject(Db)\` when the dependency may be absent.
        Docs: https://vibejs.org/v0/errors/VIBE9102]
    `);
  });

  it('reports a missing factory inject entry', async () => {
    const factory = { provide: Name, useFactory: (db: Db) => db, inject: [Db] };
    await expect(boot('AppModule', [factory])).rejects.toMatchObject({
      code: 'VIBE9102',
      args: { token: 'Db', module: 'AppModule', chain: 'name -> Db' },
    });
  });

  it('reports a missing token in get()', () => {
    const { scope: self } = scope('AppModule', []);
    expect(() => get(self, Db)).toThrow(
      expect.objectContaining({
        code: 'VIBE9102',
        args: { token: 'Db', module: 'AppModule', chain: 'Db' },
      }),
    );
  });
});

describe('cycles', () => {
  it('reports a class cycle A -> B -> A', async () => {
    class A {
      readonly b: B = inject(B);
    }
    class B {
      readonly a: A = inject(A);
    }
    await expect(boot('AppModule', [A, B])).rejects.toMatchObject({
      code: 'VIBE9103',
      args: { cycle: 'A -> B -> A', module: 'AppModule' },
      fixes: nonEmpty,
    });
    await expect(boot('AppModule', [A, B])).rejects.toThrowErrorMatchingInlineSnapshot(`
      [VibeError: [VIBE9103] Circular dependency in AppModule: A -> B -> A.
        Fix: Move the part that both providers need into a third provider and inject it in both.
        Docs: https://vibejs.org/v0/errors/VIBE9103]
    `);
  });

  it('reports a self cycle A -> A', async () => {
    class A {
      readonly self: A = inject(A);
    }
    await expect(boot('AppModule', [A])).rejects.toThrowErrorMatchingInlineSnapshot(`
      [VibeError: [VIBE9103] Circular dependency in AppModule: A -> A.
        Fix: Move the part that both providers need into a third provider and inject it in both.
        Docs: https://vibejs.org/v0/errors/VIBE9103]
    `);
  });

  it('reports a factory cycle through inject lists', async () => {
    const First = token<string>('first');
    const Second = token<string>('second');
    const providers = [
      { provide: First, useFactory: (s: string) => s, inject: [Second] },
      { provide: Second, useFactory: (f: string) => f, inject: [First] },
    ];
    await expect(boot('AppModule', providers)).rejects.toThrowErrorMatchingInlineSnapshot(`
      [VibeError: [VIBE9103] Circular dependency in AppModule: first -> second -> first.
        Fix: Move the part that both providers need into a third provider and inject it in both.
        Docs: https://vibejs.org/v0/errors/VIBE9103]
    `);
  });

  it('reports a mixed class and factory cycle', async () => {
    class A {
      readonly name = inject(Name);
    }
    const factory = { provide: Name, useFactory: (a: A) => a, inject: [A] };
    await expect(boot('AppModule', [A, factory])).rejects.toThrowErrorMatchingInlineSnapshot(`
      [VibeError: [VIBE9103] Circular dependency in AppModule: name -> A -> name.
        Fix: Move the part that both providers need into a third provider and inject it in both.
        Docs: https://vibejs.org/v0/errors/VIBE9103]
    `);
  });
});

describe('constructor parameters', () => {
  class Db {}
  class WithParams {
    readonly db: Db;
    constructor(db: Db) {
      this.db = db;
    }
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the type error made a runtime one
  const cast = WithParams as unknown as new () => object;

  it.each([
    ['class shorthand', cast],
    ['useClass', { provide: Db, useClass: cast }],
  ])('throws VIBE9104 for %s', (_, provider) => {
    const { scope: self } = scope('AppModule', []);
    expect(() => providerRecord(provider, self)).toThrow(
      expect.objectContaining({ code: 'VIBE9104', args: { token: 'WithParams' }, fixes: nonEmpty }),
    );
  });
});

describe('singletons', () => {
  it('builds a record visible in two scopes once', async () => {
    let built = 0;
    class Db {
      constructor() {
        built += 1;
      }
    }
    class Users {
      readonly db = inject(Db);
    }
    class Posts {
      readonly db = inject(Db);
    }
    const shared = scope('SharedModule', [Db]);
    const users = scope('AppModule > UsersModule', [Users], [shared.scope]);
    const posts = scope('AppModule > PostsModule', [Posts], [shared.scope]);
    await instantiate([...shared.records, ...users.records, ...posts.records]);
    expect(built).toBe(1);
    expect(get(users.scope, Users).db).toBe(get(posts.scope, Posts).db);
    expect(get(users.scope, Db)).toBe(get(shared.scope, Db));
  });

  it('does not rebuild in phase B a class built on demand in phase A', async () => {
    let built = 0;
    const Wrapped = token<{ db: Db }>('wrapped');
    class Db {
      constructor() {
        built += 1;
      }
    }
    const app = await boot('AppModule', [
      Db,
      { provide: Wrapped, useFactory: (db: Db) => ({ db }), inject: [Db] },
    ]);
    expect(built).toBe(1);
    expect(get(app, Wrapped).db).toBe(get(app, Db));
  });
});

/** Providers whose constructors and factories record their order into `log`. */
function recorded(log: string[]): Provider[] {
  const Mixed = token<string>('mixed');
  const Slow = token<string>('slow');
  const Fast = token<string>('fast');
  const Port = token<number>('port');
  class First {
    constructor() {
      log.push('First');
    }
  }
  class Dep {
    readonly slow = inject(Slow);
    constructor() {
      log.push('Dep');
    }
  }
  class Last {
    constructor() {
      log.push('Last');
    }
  }
  return [
    First,
    { provide: Mixed, useFactory: () => log.push('Mixed'), inject: [Dep] },
    {
      provide: Slow,
      useFactory: async () => {
        log.push('Slow start');
        await new Promise((resolve) => setTimeout(resolve, 1));
        log.push('Slow end');
        return 'slow';
      },
    },
    Last,
    {
      provide: Fast,
      useFactory: (port: number) => log.push(`Fast ${port}`),
      inject: [Port, Slow],
    },
    { provide: Port, useValue: 3000 },
    Dep,
  ];
}

const early = (deps: Token<unknown>[]) => ({
  provide: Name,
  useFactory: () => 'x',
  inject: deps,
});

describe('phases', () => {
  it('awaits class-free factories, then the other factories, then builds classes', async () => {
    const first: string[] = [];
    const second: string[] = [];
    await boot('AppModule', recorded(first));
    await boot('AppModule', recorded(second));
    expect(first).toEqual(['Slow start', 'Slow end', 'Fast 3000', 'Dep', 'Mixed', 'First', 'Last']);
    expect(second).toEqual(first);
  });

  it('throws VIBE9106 when a phase-A class needs an unsettled factory', async () => {
    const Slow = token<string>('slow');
    class Dep {
      readonly slow = inject(Slow);
    }
    class Other {}
    const slow = { provide: Slow, useFactory: async () => 'slow', inject: [Other] };
    const error: unknown = await boot('AppModule', [early([Dep]), slow, Dep, Other]).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({
      code: 'VIBE9106',
      args: { token: 'slow', requester: 'Dep' },
      fixes: nonEmpty,
    });
    expect(error).toMatchInlineSnapshot(`
      [VibeError: [VIBE9106] Dep needs slow before its factory has settled.
        Fix: Add slow to the factory's \`inject\` list, before Dep.
        Docs: https://vibejs.org/v0/errors/VIBE9106]
    `);
    const fixed = await boot('AppModule', [early([Slow, Dep]), slow, Dep, Other]);
    expect(get(fixed, Dep).slow).toBe('slow');
  });

  it('throws VIBE9106 from get() before the factory has run', () => {
    const { scope: self } = scope('AppModule', [{ provide: Name, useFactory: () => 'x' }]);
    expect(() => get(self, Name)).toThrow(
      expect.objectContaining({
        code: 'VIBE9106',
        args: { token: 'name', requester: 'AppModule' },
      }),
    );
  });
});

describe('error wrapping', () => {
  it('wraps a throwing constructor as VIBE9105 with the original as cause', async () => {
    const original = new Error('no connection');
    class Db {
      constructor() {
        throw original;
      }
    }
    const error: unknown = await boot('AppModule > DbModule', [Db]).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({
      code: 'VIBE9105',
      args: { token: 'Db', module: 'AppModule > DbModule' },
      fixes: nonEmpty,
      message: expect.stringContaining('Creating Db in AppModule > DbModule failed.'),
    });
    expect(error instanceof Error && error.cause).toBe(original);
  });

  it('wraps a rejected async factory as VIBE9105', async () => {
    const original = new Error('timeout');
    const error: unknown = await boot('AppModule', [
      { provide: Name, useFactory: () => Promise.reject(original) },
    ]).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: 'VIBE9105',
      args: { token: 'name', module: 'AppModule' },
      message: expect.stringContaining('Creating name in AppModule failed.'),
    });
    expect(error instanceof Error && error.cause).toBe(original);
  });

  it('passes a VIBE9102 from a nested construction through unchanged', async () => {
    class Db {}
    class Inner {
      readonly db = inject(Db);
    }
    class Outer {
      readonly inner = inject(Inner);
    }
    await expect(boot('AppModule', [Outer, Inner])).rejects.toMatchObject({
      code: 'VIBE9102',
      args: { chain: 'Outer -> Inner -> Db' },
    });
  });
});
