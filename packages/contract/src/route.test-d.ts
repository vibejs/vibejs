import type { StandardSchemaV1 } from '@standard-schema/spec';
import { expectTypeOf } from 'vitest';
import { del, get, post, raw, type ParamKeys, type RawBody, type RouteSpec } from './route.ts';

declare function schema<I, O = I>(): StandardSchemaV1<I, O>;

expectTypeOf<ParamKeys<'/'>>().toEqualTypeOf<never>();
expectTypeOf<ParamKeys<'/users'>>().toEqualTypeOf<never>();
expectTypeOf<ParamKeys<'/users/:id'>>().toEqualTypeOf<'id'>();
expectTypeOf<ParamKeys<'/orgs/:orgId/users/:id'>>().toEqualTypeOf<'orgId' | 'id'>();
expectTypeOf<ParamKeys<'/:a/:b/c'>>().toEqualTypeOf<'a' | 'b'>();

expectTypeOf(raw()).toEqualTypeOf<RawBody>();
expectTypeOf(get('/users')).toEqualTypeOf<RouteSpec<'GET', '/users', {}>>();
expectTypeOf(del('/users/:id').method).toEqualTypeOf<'DELETE'>();
const summary = post('/users', { summary: 'Create', status: 201 });
expectTypeOf(summary.def).toEqualTypeOf<{ readonly summary: 'Create'; readonly status: 201 }>();

// A params schema covers every own path param; extra keys are allowed.
get('/users/:id', { params: schema<{ id: string }, { id: number }>() });
get('/orgs/:orgId/users/:id', { params: schema<{ orgId: string; id: string; x?: string }>() });

// @ts-expect-error the params schema misses the path param orgId
get('/orgs/:orgId/users/:id', { params: schema<{ id: string }>() });
// @ts-expect-error a route without path params takes no params schema
get('/users', { params: schema<{ id: string }>() });
// @ts-expect-error status is 200, 201 or 202
get('/users', { status: 204 });
// @ts-expect-error an error status is a number
get('/users', { errors: { NOT_FOUND: '404' } });
// @ts-expect-error a response is a schema or raw()
get('/users', { response: 'text/plain' });
// An explicit undefined def is a route without a def.
expectTypeOf(get('/users', undefined)).toEqualTypeOf<RouteSpec<'GET', '/users', {}>>();
// @ts-expect-error respnse is not a def key
get('/users', { summary: 'x', respnse: schema<{ a: 1 }>() });
declare const maybe: { readonly summary: 'x' } | undefined;
expectTypeOf(get('/users', maybe).def).toEqualTypeOf<{ readonly summary: 'x' }>();
