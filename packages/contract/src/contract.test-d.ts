import { expectTypeOf } from 'vitest';
import { defineContract, isRoute, type Route } from './contract.ts';
import { del, get, post } from './route.ts';

const users = defineContract('/orgs/:orgId/users', {
  list: get('/'),
  create: post('/', { status: 201 }),
  remove: del('/:id'),
});

expectTypeOf(users.list).toEqualTypeOf<Route<'GET', '/orgs/:orgId/users', {}>>();
expectTypeOf(users.create).toEqualTypeOf<
  Route<'POST', '/orgs/:orgId/users', { readonly status: 201 }>
>();
expectTypeOf(users.remove.path).toEqualTypeOf<'/orgs/:orgId/users/:id'>();
expectTypeOf(users.remove.method).toEqualTypeOf<'DELETE'>();
expectTypeOf(users).toEqualTypeOf<{
  readonly list: Route<'GET', '/orgs/:orgId/users', {}>;
  readonly create: Route<'POST', '/orgs/:orgId/users', { readonly status: 201 }>;
  readonly remove: Route<'DELETE', '/orgs/:orgId/users/:id', {}>;
}>();

const value: unknown = users.list;
if (isRoute(value)) expectTypeOf(value).toEqualTypeOf<Route>();

// @ts-expect-error a contract holds route specs only
defineContract('/a', { bad: { method: 'GET', path: '/' } });
// @ts-expect-error the record is read-only
users.list = users.create;
