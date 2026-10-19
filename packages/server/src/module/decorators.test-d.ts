// oxlint-disable typescript/no-extraneous-class -- type fixtures
// A typed @Handle rejects a mismatched handler with TS1241 at the decorator. The positive cases
// fail too if Handle loses its generic signature, which turns the directives below into TS2578.
import { defineContract, get, post } from '@vibejs-org/contract';
import * as v from 'valibot';
import { expectTypeOf } from 'vitest';
import type { CanActivate, Ctx, RequestContext } from '../http/context.ts';
import { createMetadata, Handle, UseGuards } from './decorators.ts';

const User = v.object({ id: v.string(), name: v.string() });
type User = v.InferOutput<typeof User>;

const users = defineContract('/orgs/:orgId/users', {
  get: get('/:id', { response: User, errors: { USER_NOT_FOUND: 404 } }),
  create: post('/', { body: v.object({ name: v.string() }), response: User }),
  search: get('/search', {
    query: v.object({ q: v.string() }),
    headers: v.object({ 'x-tenant': v.string() }),
  }),
  typed: get('/:id/typed', { params: v.object({ id: v.pipe(v.string(), v.transform(Number)) }) }),
});
const orgs = defineContract('/orgs', { get: get('/:slug', { response: User }) });

const user = (id: string): User => ({ id, name: 'a' });

class UsersController {
  @Handle(users.get)
  zeroArg(): User {
    return user('1');
  }

  @Handle(users.get)
  async correct(ctx: Ctx<typeof users.get>): Promise<User> {
    return user(ctx.params.id);
  }

  @Handle(users.get)
  sync(ctx: Ctx<typeof users.get>): User {
    return user(ctx.params.orgId);
  }

  @Handle(users.get)
  narrower(): { readonly id: '1'; readonly name: 'a'; readonly extra: true } {
    return { id: '1', name: 'a', extra: true };
  }

  // @ts-expect-error TS1241: the ctx of another route
  @Handle(users.get)
  otherRoute(ctx: Ctx<typeof orgs.get>): User {
    return user(ctx.params.slug);
  }

  // @ts-expect-error TS1241: the return value does not match the response schema
  @Handle(users.get)
  wrongReturn(ctx: Ctx<typeof users.get>): { id: number } {
    return { id: Number(ctx.params.id) };
  }

  // @ts-expect-error TS1241: a positional parameter instead of ctx
  @Handle(users.get)
  positional(id: number): User {
    return user(String(id));
  }

  // @ts-expect-error TS1241: the ctx needs a param that the route lacks
  @Handle(users.get)
  missingParam(ctx: { readonly params: { readonly id: string; readonly slug: string } }): User {
    return user(ctx.params.slug);
  }

  @Handle(users.get)
  fail(ctx: Ctx<typeof users.get>): User {
    ctx.fail('USER_NOT_FOUND');
    // @ts-expect-error TS2345: the route does not declare this code
    return ctx.fail('NOT_DECLARED');
  }

  @Handle(users.get)
  // @ts-expect-error TS7006: a decorator does not type the parameter, so ctx needs its annotation
  implicit(ctx): User {
    return user(String(ctx));
  }
}

// ctx.query, ctx.headers and ctx.body exist only when the route declares them.
declare const search: Ctx<typeof users.search>;
expectTypeOf(search.query).toEqualTypeOf<{ q: string }>();
expectTypeOf(search.headers).toEqualTypeOf<{ 'x-tenant': string }>();
// @ts-expect-error the route declares no body
expectTypeOf(search.body);
declare const create: Ctx<typeof users.create>;
expectTypeOf(create.body).toEqualTypeOf<{ name: string }>();
// @ts-expect-error the route declares no query
expectTypeOf(create.query);
// @ts-expect-error the route declares no headers
expectTypeOf(create.headers);

// Prefix params stay strings; a params schema's output replaces its own keys.
declare const typed: Ctx<typeof users.typed>;
expectTypeOf(typed.params.orgId).toEqualTypeOf<string>();
expectTypeOf(typed.params.id).toEqualTypeOf<number>();
expectTypeOf(search.params.orgId).toEqualTypeOf<string>();

class AuthGuard implements CanActivate {
  canActivate(ctx: RequestContext): boolean {
    return ctx.requestId !== '';
  }
}
class NotAGuard {}
class GuardWithParams implements CanActivate {
  readonly allow: boolean;
  constructor(allow: boolean) {
    this.allow = allow;
  }
  canActivate(): boolean {
    return this.allow;
  }
}
UseGuards(AuthGuard);
// @ts-expect-error a guard needs canActivate
UseGuards(NotAGuard);
// @ts-expect-error a guard has no constructor parameters
UseGuards(GuardWithParams);

const Roles = createMetadata<string[]>('roles');

@Roles(['admin'])
class AdminController {
  @Roles(['owner'])
  @UseGuards(AuthGuard)
  remove(): void {}
}
// @ts-expect-error the value must be a string array
Roles('admin');

expectTypeOf(new UsersController().zeroArg()).toEqualTypeOf<User>();
expectTypeOf(new AdminController().remove()).toBeVoid();

declare const ctx: RequestContext;
expectTypeOf(ctx.getMetadata(Roles)).toEqualTypeOf<string[] | undefined>();
expectTypeOf(Roles.description).toEqualTypeOf<string>();
