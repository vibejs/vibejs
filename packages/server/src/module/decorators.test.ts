// oxlint-disable typescript/no-extraneous-class -- modules, controllers and enhancers are plain classes
import { defineContract, get, post, type Route } from '@usevibejs/contract';
import { describe, expect, it } from 'vitest';
import type { CanActivate, ExceptionFilter, Interceptor } from '../http/context.ts';
import {
  Controller,
  createMetadata,
  Handle,
  Module,
  readMeta,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from './decorators.ts';
import { scan, type RouteBinding } from './graph.ts';

const users = defineContract('/users', { one: get('/:id'), create: post('/') });
const orgs = defineContract('/orgs', { one: get('/:id') });
const Roles = createMetadata<string[]>('roles');
const Tag = createMetadata<string>('tag');
const nonEmpty = expect.arrayContaining([expect.any(String)]);
const tokens = (recs: readonly { token: unknown }[]) => recs.map((rec) => rec.token);

class Guard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
class P extends Guard {}
class A extends Guard {}
class B extends Guard {}
class M extends Guard {}
class Intercept implements Interceptor {
  intercept(_ctx: unknown, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }
}
class PI extends Intercept {}
class AI extends Intercept {}
class BI extends Intercept {}
class Filter implements ExceptionFilter {
  catch(): undefined {
    return undefined;
  }
}
class PF extends Filter {}
class AF extends Filter {}
class BF extends Filter {}

/** Calls a decorator the way a standard (TC39) decorator is called. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- simulates a compiler without experimentalDecorators
const tc39 = (decorator: unknown) => decorator as (value: unknown, context: unknown) => void;

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

describe('registry', () => {
  it('never changes the parent when a subclass is decorated', () => {
    @Controller(users)
    @UseGuards(P)
    @Roles(['parent'])
    class Parent {
      @Handle(users.one)
      @UseGuards(M)
      one(): void {}
      @Handle(users.create)
      create(): void {}
    }
    const expected = {
      contract: users,
      handlers: new Map<string, Route>([
        ['one', users.one],
        ['create', users.create],
      ]),
      enhancers: {
        guards: [P],
        interceptors: [],
        filters: [],
        metadata: new Map([[Roles, ['parent']]]),
      },
      methods: new Map([
        ['one', { guards: [M], interceptors: [], filters: [], metadata: new Map() }],
      ]),
    };
    expect(readMeta(Parent)).toEqual(expected);

    @Controller(orgs)
    @UseGuards(A)
    @Roles(['child'])
    class Child extends Parent {
      @Handle(orgs.one)
      @UseGuards(B)
      @Tag('child')
      override one(): void {}
    }
    expect(readMeta(Parent)).toEqual(expected);
    expect(readMeta(Child)).toMatchObject({
      contract: orgs,
      handlers: new Map<string, Route>([
        ['one', orgs.one],
        ['create', users.create],
      ]),
      enhancers: { guards: [P, A], metadata: new Map([[Roles, ['child']]]) },
      methods: new Map([['one', expect.objectContaining({ guards: [M, B] })]]),
    });
  });

  it('reads the nearest decorated ancestor and nothing for an undecorated class', () => {
    @UseGuards(P)
    class Parent {}
    class Child extends Parent {}
    expect(readMeta(Child)).toBe(readMeta(Parent));
    expect(readMeta(class {})).toBeUndefined();
  });

  it('orders stacked groups after the inherited ones, in source order', () => {
    @UseGuards(P)
    @UseInterceptors(PI)
    @UseFilters(PF)
    class Parent {
      @UseGuards(P)
      @UseInterceptors(PI)
      @UseFilters(PF)
      m(): void {}
    }
    @UseGuards(A)
    @UseGuards(B)
    @UseInterceptors(AI)
    @UseInterceptors(BI)
    @UseFilters(AF, BF)
    class Child extends Parent {
      @UseGuards(A)
      @UseGuards(B)
      @UseInterceptors(AI)
      @UseInterceptors(BI)
      @UseFilters(AF)
      @UseFilters(BF)
      override m(): void {}
      @UseGuards(A)
      n(): void {}
    }
    const meta = readMeta(Child);
    for (const enhancers of [meta?.enhancers, meta?.methods.get('m')]) {
      expect(enhancers).toMatchObject({
        guards: [P, A, B],
        interceptors: [PI, AI, BI],
        filters: [PF, AF, BF],
      });
    }
    expect(meta?.methods.get('n')?.guards).toEqual([A]);
    expect(readMeta(Parent)?.enhancers.guards).toEqual([P]);
  });

  it('lets a later metadata write on the same target replace the value', () => {
    @Tag('outer')
    @Tag('inner')
    class C {}
    expect(readMeta(C)?.enhancers.metadata.get(Tag)).toBe('outer');
    expect(Tag.description).toBe('tag');
  });

  it('binds enhancers and merged metadata per route', () => {
    @Controller(users)
    @UseGuards(P)
    @UseInterceptors(PI)
    @UseFilters(PF)
    @Roles(['parent'])
    @Tag('class')
    class Parent {
      @Handle(users.one)
      @UseGuards(A)
      @UseInterceptors(AI)
      @UseFilters(AF)
      @Tag('method')
      one(): void {}
      @Handle(users.create)
      create(): void {}
    }
    @Roles(['child'])
    class Child extends Parent {}
    @Module({ controllers: [Child] })
    class AppModule {}

    const [one, create]: readonly RouteBinding[] = scan(AppModule).routes;
    expect(one).toMatchObject({ route: users.one, key: 'one' });
    expect(tokens(one.guards)).toEqual([P, A]);
    expect(tokens(one.interceptors)).toEqual([PI, AI]);
    expect(tokens(one.filters)).toEqual([AF, PF]);
    expect(one.metadata).toEqual(
      new Map<unknown, unknown>([
        [Roles, ['child']],
        [Tag, 'method'],
      ]),
    );
    expect(create).toMatchObject({ route: users.create, key: 'create' });
    expect(tokens(create.guards)).toEqual([P]);
    expect(tokens(create.filters)).toEqual([PF]);
    expect(create.metadata.get(Tag)).toBe('class');
  });
});

describe('call shape', () => {
  const context = { kind: 'class', name: 'X' };

  it.each([
    ['@Module', () => tc39(Module({}))(class {}, context)],
    ['@Controller', () => tc39(Controller(users))(class {}, context)],
    ['@Handle', () => tc39(Handle(users.one))(() => undefined, { kind: 'method' })],
    ['@UseGuards', () => tc39(UseGuards(A))(class {}, context)],
    ['@UseInterceptors', () => tc39(UseInterceptors(AI))(() => undefined, { kind: 'method' })],
    ['@UseFilters', () => tc39(UseFilters(AF))(class {}, context)],
    ["createMetadata('roles')", () => tc39(Roles(['a']))(class {}, context)],
  ])('throws VIBE9301 for %s with a standard decorator context', (decorator, call) => {
    expect(thrown(call)).toMatchObject({ code: 'VIBE9301', args: { decorator }, fixes: nonEmpty });
  });

  it('accepts a second argument that is not a standard context', () => {
    class C {}
    tc39(Module({}))(C, null);
    tc39(Module({}))(C, { kind: 1 });
    expect(scan(C).modules).toHaveLength(1);
  });

  it('prints the VIBE9301 message', () => {
    expect(() => tc39(Module({}))(class {}, context)).toThrowErrorMatchingInlineSnapshot(`
      [VibeError: [VIBE9301] @Module was called with a standard decorator context, but the server decorators need \`experimentalDecorators\`.
        Fix: Set \`"experimentalDecorators": true\` in \`compilerOptions\` of the server \`tsconfig.json\`.
        Docs: https://vibejs.org/v0/errors/VIBE9301]
    `);
  });

  it('throws VIBE9307 for @Handle on a static method', () => {
    const error = thrown(() => {
      class UsersController {
        @Handle(users.one)
        static one(): void {}
      }
      return UsersController;
    });
    expect(error).toMatchObject({
      code: 'VIBE9307',
      args: { decorator: '@Handle', controller: 'UsersController', method: 'one' },
      fixes: nonEmpty,
    });
  });

  it('throws VIBE9307 for a method enhancer on a static method and records nothing', () => {
    const enhancers = [
      ['@UseGuards', UseGuards()],
      ['@UseInterceptors', UseInterceptors()],
      ['@UseFilters', UseFilters()],
      ["createMetadata('roles')", Roles([])],
    ] as const;
    for (const [decorator, apply] of enhancers) {
      class UsersController {
        static one(): void {}
      }
      const desc = Object.getOwnPropertyDescriptor(UsersController, 'one') ?? {};
      expect(thrown(() => apply(UsersController, 'one', desc))).toMatchObject({
        code: 'VIBE9307',
        args: { decorator, controller: 'UsersController', method: 'one' },
      });
      expect(readMeta(UsersController)).toBeUndefined();
    }
    expect(readMeta(Function)).toBeUndefined();
  });
});

describe('binding', () => {
  const built: string[] = [];
  class Logged {
    constructor() {
      built.push('Logged');
    }
  }
  const app = (...controllers: (new () => object)[]) => {
    @Module({ providers: [Logged], controllers })
    class AppModule {}
    return AppModule;
  };
  const failure = (root: () => unknown) => {
    const error = thrown(root);
    expect(built).toEqual([]);
    return error;
  };

  it('throws VIBE9302 for a controller without @Controller', () => {
    class UsersController {}
    expect(failure(() => scan(app(UsersController)))).toMatchObject({
      code: 'VIBE9302',
      args: { controller: 'UsersController', module: 'AppModule' },
      fixes: nonEmpty,
    });
  });

  it('accepts an inherited @Controller', () => {
    @Controller(orgs)
    class Base {
      @Handle(orgs.one)
      one(): void {}
    }
    class OrgsController extends Base {}
    expect(scan(app(OrgsController)).routes).toMatchObject([{ route: orgs.one, key: 'one' }]);
  });

  it('throws VIBE9303 for a route without a handler', () => {
    @Controller(users)
    class UsersController {
      @Handle(users.one)
      one(): void {}
    }
    expect(failure(() => scan(app(UsersController)))).toMatchObject({
      code: 'VIBE9303',
      args: { route: 'POST /users', controller: 'UsersController' },
      fixes: nonEmpty,
    });
  });

  it('throws VIBE9304 for a route with two handlers', () => {
    @Controller(orgs)
    class OrgsController {
      @Handle(orgs.one)
      one(): void {}
      @Handle(orgs.one)
      again(): void {}
    }
    expect(failure(() => scan(app(OrgsController)))).toMatchObject({
      code: 'VIBE9304',
      args: { route: 'GET /orgs/:id', controller: 'OrgsController', methods: 'one, again' },
      fixes: nonEmpty,
    });
  });

  it('throws VIBE9305 for a route of another contract and for an unbound route spec', () => {
    @Controller(orgs)
    class OrgsController {
      @Handle(orgs.one)
      one(): void {}
      @Handle(users.one)
      user(): void {}
    }
    expect(failure(() => scan(app(OrgsController)))).toMatchObject({
      code: 'VIBE9305',
      args: { method: 'user', controller: 'OrgsController' },
      fixes: nonEmpty,
    });

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an unbound spec passed where a route is expected
    const spec = get('/orgs/:id') as unknown as Route;
    const key = Symbol('spec');
    @Controller(orgs)
    class SpecController {
      @Handle(orgs.one)
      one(): void {}
      @Handle(spec)
      [key](): void {}
    }
    expect(failure(() => scan(app(SpecController)))).toMatchObject({
      code: 'VIBE9305',
      args: { method: 'Symbol(spec)', controller: 'SpecController' },
    });
  });

  it('throws VIBE9306 for two controllers of one contract anywhere in the app', () => {
    @Controller(orgs)
    class OrgsController {
      @Handle(orgs.one)
      one(): void {}
    }
    class OtherOrgsController extends OrgsController {}
    @Module({ controllers: [OtherOrgsController] })
    class OtherModule {}
    @Module({ imports: [OtherModule], providers: [Logged], controllers: [OrgsController] })
    class AppModule {}
    expect(failure(() => scan(AppModule))).toMatchObject({
      code: 'VIBE9306',
      args: { controllers: 'OtherOrgsController, OrgsController' },
      fixes: nonEmpty,
    });
  });
});
