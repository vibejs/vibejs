import { type } from 'arktype';
import * as v from 'valibot';
import { expectTypeOf } from 'vitest';
import { z } from 'zod';
import { defineContract } from './contract.ts';
import { get, post, raw } from './route.ts';
import type {
  RouteBody,
  RouteData,
  RouteErrorCode,
  RouteHeaders,
  RouteParams,
  RouteQuery,
  RouteReply,
} from './types.ts';

// The same contract with each schema vendor. Every schema's input differs from its output (a
// default or a transform), and the user's Date becomes a string through Jsonify.
type UserIn = { name?: string; at: Date };
type UserOut = { name: string; at: Date };
type UserData = { name: string; at: string };

const zod = defineContract('/orgs/:orgId/users', {
  one: get('/:id', {
    params: z.object({ id: z.coerce.number<string>() }),
    query: z.object({ page: z.string().transform(Number) }),
    headers: z.object({ 'x-tenant': z.string().default('main') }),
    response: z.object({ name: z.string().default('anon'), at: z.date() }),
    errors: { USER_NOT_FOUND: 404 },
  }),
  create: post('/', { body: z.object({ name: z.string().default('anon'), at: z.date() }) }),
  file: get('/:id/file', { response: raw('text/csv') }),
});
expectTypeOf<RouteParams<typeof zod.one>>().toEqualTypeOf<{ readonly orgId: string; id: number }>();
expectTypeOf<RouteQuery<typeof zod.one>>().toEqualTypeOf<{ page: number }>();
expectTypeOf<RouteHeaders<typeof zod.one>>().toEqualTypeOf<{ 'x-tenant': string }>();
expectTypeOf<RouteBody<typeof zod.create>>().toEqualTypeOf<UserOut>();
expectTypeOf<RouteBody<typeof zod.one>>().toBeNever();
expectTypeOf<RouteErrorCode<typeof zod.one>>().toEqualTypeOf<'USER_NOT_FOUND'>();
expectTypeOf<RouteReply<typeof zod.one>>().toEqualTypeOf<UserIn>();
expectTypeOf<RouteData<typeof zod.one>>().toEqualTypeOf<UserData>();
expectTypeOf<RouteQuery<typeof zod.create>>().toBeNever();
expectTypeOf<RouteHeaders<typeof zod.create>>().toBeNever();
expectTypeOf<RouteErrorCode<typeof zod.create>>().toBeNever();
expectTypeOf<RouteReply<typeof zod.create>>().toEqualTypeOf<void>();
expectTypeOf<RouteData<typeof zod.create>>().toEqualTypeOf<undefined>();
expectTypeOf<RouteReply<typeof zod.file>>().toEqualTypeOf<Response | BodyInit>();
expectTypeOf<RouteData<typeof zod.file>>().toEqualTypeOf<Response>();
// @ts-expect-error the params schema misses the path param id
get('/users/:id', { params: z.object({ userId: z.string() }) });
// @ts-expect-error a route without path params takes no params schema
get('/users', { params: z.object({ id: z.string() }) });

const valibot = defineContract('/orgs/:orgId/users', {
  one: get('/:id', {
    params: v.object({ id: v.pipe(v.string(), v.transform(Number)) }),
    query: v.object({ page: v.pipe(v.string(), v.transform(Number)) }),
    headers: v.object({ 'x-tenant': v.optional(v.string(), 'main') }),
    response: v.object({ name: v.optional(v.string(), 'anon'), at: v.date() }),
    errors: { USER_NOT_FOUND: 404 },
  }),
  create: post('/', { body: v.object({ name: v.optional(v.string(), 'anon'), at: v.date() }) }),
  file: get('/:id/file', { response: raw('text/csv') }),
});
expectTypeOf<RouteParams<typeof valibot.one>>().toEqualTypeOf<{
  readonly orgId: string;
  id: number;
}>();
expectTypeOf<RouteQuery<typeof valibot.one>>().toEqualTypeOf<{ page: number }>();
expectTypeOf<RouteHeaders<typeof valibot.one>>().toEqualTypeOf<{ 'x-tenant': string }>();
expectTypeOf<RouteBody<typeof valibot.create>>().toEqualTypeOf<UserOut>();
expectTypeOf<RouteBody<typeof valibot.one>>().toBeNever();
expectTypeOf<RouteErrorCode<typeof valibot.one>>().toEqualTypeOf<'USER_NOT_FOUND'>();
expectTypeOf<RouteReply<typeof valibot.one>>().toEqualTypeOf<UserIn>();
expectTypeOf<RouteData<typeof valibot.one>>().toEqualTypeOf<UserData>();
expectTypeOf<RouteQuery<typeof valibot.create>>().toBeNever();
expectTypeOf<RouteHeaders<typeof valibot.create>>().toBeNever();
expectTypeOf<RouteErrorCode<typeof valibot.create>>().toBeNever();
expectTypeOf<RouteReply<typeof valibot.create>>().toEqualTypeOf<void>();
expectTypeOf<RouteData<typeof valibot.create>>().toEqualTypeOf<undefined>();
expectTypeOf<RouteReply<typeof valibot.file>>().toEqualTypeOf<Response | BodyInit>();
expectTypeOf<RouteData<typeof valibot.file>>().toEqualTypeOf<Response>();
// @ts-expect-error the params schema misses the path param id
get('/users/:id', { params: v.object({ userId: v.string() }) });
// @ts-expect-error a route without path params takes no params schema
get('/users', { params: v.object({ id: v.string() }) });

const arktype = defineContract('/orgs/:orgId/users', {
  one: get('/:id', {
    params: type({ id: 'string.numeric.parse' }),
    query: type({ page: 'string.numeric.parse' }),
    headers: type({ 'x-tenant': 'string = "main"' }),
    response: type({ name: 'string = "anon"', at: 'Date' }),
    errors: { USER_NOT_FOUND: 404 },
  }),
  create: post('/', { body: type({ name: 'string = "anon"', at: 'Date' }) }),
  file: get('/:id/file', { response: raw('text/csv') }),
});
expectTypeOf<RouteParams<typeof arktype.one>>().toEqualTypeOf<{
  readonly orgId: string;
  id: number;
}>();
expectTypeOf<RouteQuery<typeof arktype.one>>().toEqualTypeOf<{ page: number }>();
expectTypeOf<RouteHeaders<typeof arktype.one>>().toEqualTypeOf<{ 'x-tenant': string }>();
expectTypeOf<RouteBody<typeof arktype.create>>().toEqualTypeOf<UserOut>();
expectTypeOf<RouteBody<typeof arktype.one>>().toBeNever();
expectTypeOf<RouteErrorCode<typeof arktype.one>>().toEqualTypeOf<'USER_NOT_FOUND'>();
expectTypeOf<RouteReply<typeof arktype.one>>().toEqualTypeOf<UserIn>();
expectTypeOf<RouteData<typeof arktype.one>>().toEqualTypeOf<UserData>();
expectTypeOf<RouteQuery<typeof arktype.create>>().toBeNever();
expectTypeOf<RouteHeaders<typeof arktype.create>>().toBeNever();
expectTypeOf<RouteErrorCode<typeof arktype.create>>().toBeNever();
expectTypeOf<RouteReply<typeof arktype.create>>().toEqualTypeOf<void>();
expectTypeOf<RouteData<typeof arktype.create>>().toEqualTypeOf<undefined>();
expectTypeOf<RouteReply<typeof arktype.file>>().toEqualTypeOf<Response | BodyInit>();
expectTypeOf<RouteData<typeof arktype.file>>().toEqualTypeOf<Response>();
// @ts-expect-error the params schema misses the path param id
get('/users/:id', { params: type({ userId: 'string' }) });
// @ts-expect-error a route without path params takes no params schema
get('/users', { params: type({ id: 'string' }) });
