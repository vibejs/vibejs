import { type } from 'arktype';
import * as v from 'valibot';
import { expectTypeOf } from 'vitest';
import { z } from 'zod';
import { defineContract } from './contract.ts';
import { get, post } from './route.ts';
import type {
  RouteBody,
  RouteData,
  RouteErrorCode,
  RouteHeaders,
  RouteParams,
  RouteQuery,
  RouteReply,
} from './types.ts';

// The same contract with each schema vendor. `user` has a default (input differs from output) and
// a Date (Jsonify turns it into a string).
type UserIn = { name?: string; at: Date };
type UserOut = { name: string; at: Date };
type UserData = { name: string; at: string };

const zod = defineContract('/orgs/:orgId/users', {
  one: get('/:id', {
    params: z.object({ id: z.coerce.number<string>() }),
    query: z.object({ full: z.boolean() }),
    headers: z.object({ 'x-tenant': z.string() }),
    response: z.object({ name: z.string().default('anon'), at: z.date() }),
    errors: { USER_NOT_FOUND: 404 },
  }),
  create: post('/', { body: z.object({ name: z.string().default('anon'), at: z.date() }) }),
});
expectTypeOf<RouteParams<typeof zod.one>>().toEqualTypeOf<{ readonly orgId: string; id: number }>();
expectTypeOf<RouteQuery<typeof zod.one>>().toEqualTypeOf<{ full: boolean }>();
expectTypeOf<RouteHeaders<typeof zod.one>>().toEqualTypeOf<{ 'x-tenant': string }>();
expectTypeOf<RouteBody<typeof zod.create>>().toEqualTypeOf<UserOut>();
expectTypeOf<RouteBody<typeof zod.one>>().toBeNever();
expectTypeOf<RouteErrorCode<typeof zod.one>>().toEqualTypeOf<'USER_NOT_FOUND'>();
expectTypeOf<RouteReply<typeof zod.one>>().toEqualTypeOf<UserIn>();
expectTypeOf<RouteData<typeof zod.one>>().toEqualTypeOf<UserData>();
// @ts-expect-error the params schema misses the path param id
get('/users/:id', { params: z.object({ userId: z.string() }) });
// @ts-expect-error a route without path params takes no params schema
get('/users', { params: z.object({ id: z.string() }) });

const valibot = defineContract('/orgs/:orgId/users', {
  one: get('/:id', {
    params: v.object({ id: v.pipe(v.string(), v.transform(Number)) }),
    query: v.object({ full: v.boolean() }),
    headers: v.object({ 'x-tenant': v.string() }),
    response: v.object({ name: v.optional(v.string(), 'anon'), at: v.date() }),
    errors: { USER_NOT_FOUND: 404 },
  }),
  create: post('/', { body: v.object({ name: v.optional(v.string(), 'anon'), at: v.date() }) }),
});
expectTypeOf<RouteParams<typeof valibot.one>>().toEqualTypeOf<{
  readonly orgId: string;
  id: number;
}>();
expectTypeOf<RouteQuery<typeof valibot.one>>().toEqualTypeOf<{ full: boolean }>();
expectTypeOf<RouteHeaders<typeof valibot.one>>().toEqualTypeOf<{ 'x-tenant': string }>();
expectTypeOf<RouteBody<typeof valibot.create>>().toEqualTypeOf<UserOut>();
expectTypeOf<RouteBody<typeof valibot.one>>().toBeNever();
expectTypeOf<RouteErrorCode<typeof valibot.one>>().toEqualTypeOf<'USER_NOT_FOUND'>();
expectTypeOf<RouteReply<typeof valibot.one>>().toEqualTypeOf<UserIn>();
expectTypeOf<RouteData<typeof valibot.one>>().toEqualTypeOf<UserData>();
// @ts-expect-error the params schema misses the path param id
get('/users/:id', { params: v.object({ userId: v.string() }) });
// @ts-expect-error a route without path params takes no params schema
get('/users', { params: v.object({ id: v.string() }) });

const arktype = defineContract('/orgs/:orgId/users', {
  one: get('/:id', {
    params: type({ id: 'string.numeric.parse' }),
    query: type({ full: 'boolean' }),
    headers: type({ 'x-tenant': 'string' }),
    response: type({ name: 'string = "anon"', at: 'Date' }),
    errors: { USER_NOT_FOUND: 404 },
  }),
  create: post('/', { body: type({ name: 'string = "anon"', at: 'Date' }) }),
});
expectTypeOf<RouteParams<typeof arktype.one>>().toEqualTypeOf<{
  readonly orgId: string;
  id: number;
}>();
expectTypeOf<RouteQuery<typeof arktype.one>>().toEqualTypeOf<{ full: boolean }>();
expectTypeOf<RouteHeaders<typeof arktype.one>>().toEqualTypeOf<{ 'x-tenant': string }>();
expectTypeOf<RouteBody<typeof arktype.create>>().toEqualTypeOf<UserOut>();
expectTypeOf<RouteBody<typeof arktype.one>>().toBeNever();
expectTypeOf<RouteErrorCode<typeof arktype.one>>().toEqualTypeOf<'USER_NOT_FOUND'>();
expectTypeOf<RouteReply<typeof arktype.one>>().toEqualTypeOf<UserIn>();
expectTypeOf<RouteData<typeof arktype.one>>().toEqualTypeOf<UserData>();
// @ts-expect-error the params schema misses the path param id
get('/users/:id', { params: type({ userId: 'string' }) });
// @ts-expect-error a route without path params takes no params schema
get('/users', { params: type({ id: 'string' }) });
