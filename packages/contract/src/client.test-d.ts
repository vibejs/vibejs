import type { StandardSchemaV1 } from '@standard-schema/spec';
import { expectTypeOf } from 'vitest';
import {
  createClient,
  type ApiResult,
  type CallInput,
  type ClientErrorCode,
  type ClientOptions,
} from './client.ts';
import { defineContract } from './contract.ts';
import { del, get, post, raw } from './route.ts';
import type { BuiltinErrorCode } from './types.ts';

declare function schema<I, O = I>(): StandardSchemaV1<I, O>;

const users = defineContract('/orgs/:orgId/users', {
  list: get('/', {
    query: schema<{ page?: string }, { page: number }>(),
    headers: schema<{ 'x-tenant': string }>(),
    response: schema<{ at: number }, { at: Date }>(),
  }),
  one: get('/:id', { errors: { USER_NOT_FOUND: 404, GONE: 410 } }),
  create: post('/', { body: schema<{ name: string }>() }),
  file: get('/:id/file', { response: raw('text/csv') }),
  remove: del('/:id'),
});
const health = defineContract('/health', {
  ping: get('/', { query: schema<{ verbose?: boolean }>() }),
  search: get('/search', { query: schema<{ q: string }>() }),
});
type Users = typeof users;
type Health = typeof health;

declare const fetchApp: (req: Request) => Promise<Response>;
const api = createClient({ users, nested: { health } }, { baseUrl: '/api', fetch: fetchApp });
const flat = createClient(health, { baseUrl: '/api' });

// Results narrow by `ok`, then a declared code narrows `status` to its literal.
declare const one: ApiResult<Users['one']>;
if (one.ok) {
  expectTypeOf(one.data).toEqualTypeOf<undefined>();
  expectTypeOf(one.response).toEqualTypeOf<Response>();
} else {
  expectTypeOf(one.response).toEqualTypeOf<Response | undefined>();
  expectTypeOf(one.error.code).toEqualTypeOf<
    'USER_NOT_FOUND' | 'GONE' | BuiltinErrorCode | ClientErrorCode
  >();
  if (one.error.code === 'USER_NOT_FOUND') expectTypeOf(one.error.status).toEqualTypeOf<404>();
  if (one.error.code === 'ABORTED') expectTypeOf(one.error.status).toEqualTypeOf<number>();
  if (one.error.code === 'FORBIDDEN') expectTypeOf(one.error.status).toEqualTypeOf<number>();
}

// `data` is the JSON of the response output, the raw `Response`, or `undefined`.
declare const list: ApiResult<Users['list']>;
if (list.ok) expectTypeOf(list.data).toEqualTypeOf<{ at: string }>();
declare const file: ApiResult<Users['file']>;
if (file.ok) expectTypeOf(file.data).toEqualTypeOf<Response>();
declare const remove: ApiResult<Users['remove']>;
if (remove.ok) expectTypeOf(remove.data).toEqualTypeOf<undefined>();

// Inputs: params for every path param (prefix included), declared parts, required keys.
expectTypeOf<CallInput<Users['one']>>().toEqualTypeOf<{
  readonly params: Record<'orgId' | 'id', string | number>;
  readonly query?: never;
  readonly headers?: never;
  readonly body?: never;
}>();
expectTypeOf<CallInput<Users['list']>>().toEqualTypeOf<{
  readonly params: Record<'orgId', string | number>;
  readonly query?: { page?: string };
  readonly headers: { 'x-tenant': string };
  readonly body?: never;
}>();
expectTypeOf<CallInput<Users['create']>>().toEqualTypeOf<{
  readonly params: Record<'orgId', string | number>;
  readonly query?: never;
  readonly headers?: never;
  readonly body: { name: string };
}>();
expectTypeOf<CallInput<Health['search']>>().toEqualTypeOf<{
  readonly params?: never;
  readonly query: { q: string };
  readonly headers?: never;
  readonly body?: never;
}>();

// The client recurses over records; `input` is optional exactly when nothing is required.
expectTypeOf(api.users.one).returns.resolves.toEqualTypeOf<ApiResult<Users['one']>>();
expectTypeOf(api.nested.health.ping).returns.resolves.toEqualTypeOf<ApiResult<Health['ping']>>();
void api.nested.health.ping();
void flat.ping({ query: { verbose: true } }, { signal: AbortSignal.timeout(1) });
void api.users.create({ params: { orgId: 1 }, body: { name: 'a' } });
// @ts-expect-error the input is required when a part has required keys
void flat.search();
// @ts-expect-error a missing path param
void api.users.one({ params: { orgId: 'o' } });
// @ts-expect-error a missing body
void api.users.create({ params: { orgId: 'o' } });
// @ts-expect-error a body that the route does not declare
void api.users.one({ params: { orgId: 'o', id: 1 }, body: {} });
// @ts-expect-error an unknown key
void flat.ping({ verbose: true });
// @ts-expect-error a missing required header
void api.users.list({ params: { orgId: 'o' } });

// @ts-expect-error `baseUrl` is required
createClient(health, {});
expectTypeOf<ClientOptions['fetch']>().toEqualTypeOf<
  ((request: Request) => Promise<Response>) | undefined
>();
