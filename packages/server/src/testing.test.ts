// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { defineContract, get, post } from '@vibejs-org/contract';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { captureLog, caught } from '../test/log.ts';
import { inject, runInInjectionContext } from './di/injector.ts';
import { token } from './di/token.ts';
import { VibeFactory } from './http/app.ts';
import type { CanActivate, Ctx } from './http/context.ts';
import { Controller, Handle, Module } from './module/decorators.ts';
import { Logger } from './logger.ts';
import { Test } from './testing.ts';

const quiet = () => captureLog().logger;

const Name = token<string>('Name');
const Dep = token<string>('Dep');
const Alias = token<string>('Alias');

/** A class that records its construction and its four lifecycle hooks in `log`. */
function hooked(log: string[], name: string) {
  return class {
    readonly name = name;
    constructor() {
      log.push(`${name}.new`);
    }
    onModuleInit(): void {
      log.push(`${name}.onModuleInit`);
    }
    onApplicationBootstrap(): void {
      log.push(`${name}.onApplicationBootstrap`);
    }
    onModuleDestroy(): void {
      log.push(`${name}.onModuleDestroy`);
    }
    onApplicationShutdown(): void {
      log.push(`${name}.onApplicationShutdown`);
    }
  };
}

const names = defineContract('/names', { read: get('/', { response: v.string() }) });
const locals = defineContract('/local', { read: get('/', { response: v.string() }) });

@Controller(names)
class NamesController {
  readonly name = inject(Name);
  @Handle(names.read)
  read(): string {
    return this.name;
  }
}

@Controller(locals)
class LocalController {
  readonly name = inject(Name);
  @Handle(locals.read)
  read(): string {
    return this.name;
  }
}

@Module({
  global: true,
  providers: [{ provide: Name, useValue: 'global' }],
  controllers: [NamesController],
  exports: [Name],
})
class GlobalModule {}

@Module({
  providers: [
    { provide: Name, useValue: 'local' },
    { provide: Alias, useExisting: Name },
  ],
  controllers: [LocalController],
})
class LocalModule {}

const text = async (res: Response) => v.parse(v.string(), await res.json());

describe('overrideProvider', () => {
  it('replaces a token with useValue, useClass and an async useFactory', async () => {
    class Clock {
      now(): string {
        return 'real';
      }
    }
    class FakeClock extends Clock {
      override now(): string {
        return 'fake';
      }
    }
    @Module({
      providers: [
        Clock,
        { provide: Dep, useValue: 'dep' },
        { provide: Name, useValue: 'real' },
        { provide: Alias, useValue: 'real' },
      ],
    })
    class Feature {}
    const app = await Test.createTestingModule({ imports: [Feature], logger: quiet() })
      .overrideProvider(Name)
      .useValue('value')
      .overrideProvider(Clock)
      .useClass(FakeClock)
      .overrideProvider(Alias)
      .useFactory(async (dep: string) => `factory(${dep})`, [Dep])
      .compile();
    expect(app.get(Name)).toBe('value');
    expect(app.get(Clock).now()).toBe('fake');
    expect(app.get(Alias)).toBe('factory(dep)');
  });

  it('replaces the token in every module that provides it, aliases included', async () => {
    const app = await Test.createTestingModule({
      imports: [GlobalModule, LocalModule],
      logger: quiet(),
    })
      .overrideProvider(Name)
      .useValue('first')
      .overrideProvider(Name)
      .useValue('fake')
      .compile();
    expect(app.get(Name)).toBe('fake');
    expect(app.get(Alias)).toBe('fake');
    expect(await text(await app.request('/names'))).toBe('fake');
    expect(await text(await app.request('/local'))).toBe('fake');
  });

  it('never constructs the replaced provider or runs its hooks', async () => {
    const log: string[] = [];
    const Real = hooked(log, 'Real');
    const Fake = hooked(log, 'Fake');
    @Module({ providers: [Real] })
    class Feature {}
    const app = await Test.createTestingModule({ imports: [Feature], logger: quiet() })
      .overrideProvider(Real)
      .useClass(Fake)
      .compile();
    await app.close();
    expect(app.get(Real).name).toBe('Fake');
    expect(log.filter((entry) => entry.startsWith('Real'))).toEqual([]);
    expect(log).toContain('Fake.onModuleInit');
  });

  it('rejects compile() with VIBE9701 for a token no module provides, before building', async () => {
    const log: string[] = [];
    const Recorder = hooked(log, 'Recorder');
    const Unknown = token<string>('Unknown');
    const error = await caught(() =>
      Test.createTestingModule({ providers: [Recorder], logger: quiet() })
        .overrideProvider(Unknown)
        .useValue('x')
        .compile(),
    );
    expect(error).toMatchObject({ code: 'VIBE9701' });
    expect(String(error)).toContain('TestingModule overrides Unknown');
    expect(log).toEqual([]);
  });

  it('rejects compile() with VIBE9701 for a controller class', async () => {
    const log: string[] = [];
    const Recorder = hooked(log, 'Recorder');
    const error = await caught(() =>
      Test.createTestingModule({
        providers: [Recorder, { provide: Name, useValue: 'name' }],
        controllers: [NamesController],
        logger: quiet(),
      })
        .overrideProvider(NamesController)
        .useClass(class extends NamesController {})
        .compile(),
    );
    expect(error).toMatchObject({ code: 'VIBE9701' });
    expect(log).toEqual([]);
  });

  it('rejects useClass with constructor parameters with VIBE9104', async () => {
    class Params {
      readonly value: string;
      constructor(value: string) {
        this.value = value;
      }
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the type error made a runtime one
    const NeedsParams = Params as unknown as new () => string;
    const error = await caught(() =>
      Test.createTestingModule({ providers: [{ provide: Name, useValue: 'a' }], logger: quiet() })
        .overrideProvider(Name)
        .useClass(NeedsParams)
        .compile(),
    );
    expect(error).toMatchObject({ code: 'VIBE9104' });
  });

  it('builds a fresh app on each compile() from the overrides so far', async () => {
    const builder = Test.createTestingModule({
      providers: [{ provide: Name, useValue: 'real' }],
      logger: quiet(),
    });
    const first = await builder.compile();
    const second = await builder.overrideProvider(Name).useValue('fake').compile();
    expect([first.get(Name), second.get(Name)]).toEqual(['real', 'fake']);
  });
  it('routes injected Logger calls to an overridden Logger, framework logs to the logger option', async () => {
    const framework = captureLog('debug');
    const app = captureLog('debug');
    const hello = defineContract('/hello', { say: get('/') });
    @Controller(hello)
    class HelloController {
      readonly log = inject(Logger);
      @Handle(hello.say)
      say(): void {
        this.log.info('said');
      }
    }
    const compiled = await Test.createTestingModule({
      controllers: [HelloController],
      logger: framework.logger,
    })
      .overrideProvider(Logger)
      .useValue(app.logger)
      .compile();
    await compiled.request('/hello');
    await compiled.close();
    expect(app.lines.map((line) => line.msg)).toEqual(['said']);
    expect(framework.lines.map((line) => line.msg)).toContain('request');
    expect(framework.lines.map((line) => line.msg)).not.toContain('said');
  });
});

/** A module whose `Real` provider is `Fake`, through an override or a `useClass` provider. */
function graph(log: string[], override: boolean) {
  const Real = hooked(log, 'Real');
  const Fake = hooked(log, 'Fake');
  const Service = hooked(log, 'Service');
  @Module({ providers: [Service, override ? Real : { provide: Real, useClass: Fake }] })
  class Feature {}
  return { Real, Fake, Feature };
}

describe('lifecycle', () => {
  it('runs the same hooks in the same order as VibeFactory.create', async () => {
    const expected: string[] = [];
    const prod = graph(expected, false);
    @Module({ imports: [prod.Feature] })
    class AppModule {}
    const created = await VibeFactory.create(AppModule, { logger: quiet() });
    await created.close();

    const log: string[] = [];
    const test = graph(log, true);
    const app = await Test.createTestingModule({ imports: [test.Feature], logger: quiet() })
      .overrideProvider(test.Real)
      .useClass(test.Fake)
      .compile();
    await app.close();
    await app.close();
    expect(log).toEqual(expected);
    expect(log.slice(-4)).toEqual([
      'Fake.onModuleDestroy',
      'Service.onModuleDestroy',
      'Fake.onApplicationShutdown',
      'Service.onApplicationShutdown',
    ]);
  });
});

describe('compiled app', () => {
  const echo = defineContract('/echo', {
    send: post('/', { body: v.object({ n: v.number() }), response: v.number() }),
  });
  class Deny implements CanActivate {
    readonly name = inject(Name);
    canActivate(): boolean {
      return this.name !== 'deny';
    }
  }
  @Controller(echo)
  class EchoController {
    @Handle(echo.send)
    send(ctx: Ctx<typeof echo.send>): number {
      return ctx.body.n * 2;
    }
  }

  it('is the production App with the given AppOptions', async () => {
    const { lines, logger } = captureLog('debug');
    const build = (name: string) =>
      Test.createTestingModule({
        providers: [{ provide: Name, useValue: 'real' }],
        controllers: [EchoController],
        basePath: '/api',
        guards: [Deny],
        logger,
      })
        .overrideProvider(Name)
        .useValue(name)
        .compile();
    const app = await build('fake');
    const res = await app.request('/api/echo', { method: 'POST', json: { n: 2 } });
    expect(await res.json()).toBe(4);
    const fetched = await app.fetch(new Request('http://localhost/api/echo', { method: 'POST' }));
    expect(fetched.status).toBe(400);
    expect(app.inspect().modules.at(-1)).toMatchObject({ path: 'TestingModule' });
    expect(app.inspect().routes[0]).toMatchObject({ path: '/api/echo', guards: ['Deny'] });
    class Helper {
      readonly name = inject(Name);
    }
    expect(runInInjectionContext(app, () => new Helper()).name).toBe('fake');
    expect(lines.some((line) => line.msg === 'request')).toBe(true);
    await app.close();

    const denied = await build('deny');
    expect((await denied.request('/api/echo', { method: 'POST', json: { n: 1 } })).status).toBe(
      403,
    );
    await denied.close();
  });
});

describe('example', () => {
  const User = v.object({
    id: v.string(),
    email: v.pipe(v.string(), v.email()),
    createdAt: v.string(),
  });
  const users = defineContract('/users', {
    findOne: get('/:id', { response: User, errors: { USER_NOT_FOUND: 404 } }),
    create: post('/', {
      body: v.object({ email: v.pipe(v.string(), v.email()) }),
      response: User,
      status: 201,
      errors: { EMAIL_TAKEN: 409 },
    }),
  });
  type UserRow = v.InferInput<typeof User>;
  const USERS_DB = token<Map<string, UserRow>>('USERS_DB');

  class UsersService {
    private readonly db = inject(USERS_DB);
    find(id: string): UserRow | undefined {
      return this.db.get(id);
    }
    create(email: string): UserRow | undefined {
      if ([...this.db.values()].some((u) => u.email === email)) return undefined;
      const u = { id: crypto.randomUUID(), email, createdAt: new Date().toISOString() };
      this.db.set(u.id, u);
      return u;
    }
  }

  @Controller(users)
  class UsersController {
    private readonly users = inject(UsersService);
    @Handle(users.findOne)
    findOne(ctx: Ctx<typeof users.findOne>): UserRow {
      return (
        this.users.find(ctx.params.id) ?? ctx.fail('USER_NOT_FOUND', `No user ${ctx.params.id}`)
      );
    }
    @Handle(users.create)
    create(ctx: Ctx<typeof users.create>): UserRow {
      return this.users.create(ctx.body.email) ?? ctx.fail('EMAIL_TAKEN');
    }
  }

  @Module({
    providers: [UsersService, { provide: USERS_DB, useValue: new Map() }],
    controllers: [UsersController],
    exports: [UsersService],
  })
  class UsersModule {}

  it('serves UsersModule with a seeded USERS_DB', async () => {
    const seeded = { id: '1', email: 'ada@example.com', createdAt: '2026-01-01T00:00:00.000Z' };
    const app = await Test.createTestingModule({ imports: [UsersModule], logger: quiet() })
      .overrideProvider(USERS_DB)
      .useValue(new Map([['1', seeded]]))
      .compile();
    const ok = await app.request('/users/1');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(seeded);
    const missing = await app.request('/users/2');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'USER_NOT_FOUND' });
    const invalid = await app.request('/users', { method: 'POST', json: { email: 'nope' } });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    await app.close();
  });
});
