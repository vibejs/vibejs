import type { StandardSchemaV1 } from '@standard-schema/spec';
import { expectTypeOf } from 'vitest';
import { defineContract } from './contract.ts';
import { del, get, post, raw } from './route.ts';
import type {
  Jsonify,
  Problem,
  RouteBody,
  RouteData,
  RouteErrorCode,
  RouteHeaders,
  RouteParams,
  RouteQuery,
  RouteReply,
} from './types.ts';

declare function schema<I, O = I>(): StandardSchemaV1<I, O>;

const users = defineContract('/orgs/:orgId/users', {
  list: get('/', {
    query: schema<{ page?: string }, { page: number }>(),
    headers: schema<{ 'x-tenant': string }>(),
    response: schema<{ at: string }, { at: Date }>(),
  }),
  one: get('/:id', {
    params: schema<{ id: string }, { id: number }>(),
    errors: { USER_NOT_FOUND: 404, GONE: 410 },
  }),
  create: post('/', { body: schema<{ name: string }, { name: string; id: number }>() }),
  file: get('/:id/file', { response: raw('text/csv') }),
  remove: del('/:id'),
});
type Users = typeof users;

// Prefix params stay strings; a params schema's output replaces its own keys.
expectTypeOf<RouteParams<Users['one']>>().toEqualTypeOf<{ readonly orgId: string; id: number }>();
expectTypeOf<RouteParams<Users['remove']>>().toEqualTypeOf<{
  readonly orgId: string;
  readonly id: string;
}>();
expectTypeOf<RouteParams<Users['list']>>().toEqualTypeOf<{ readonly orgId: string }>();

expectTypeOf<RouteQuery<Users['list']>>().toEqualTypeOf<{ page: number }>();
expectTypeOf<RouteHeaders<Users['list']>>().toEqualTypeOf<{ 'x-tenant': string }>();
expectTypeOf<RouteBody<Users['create']>>().toEqualTypeOf<{ name: string; id: number }>();
expectTypeOf<RouteQuery<Users['one']>>().toBeNever();
expectTypeOf<RouteHeaders<Users['one']>>().toBeNever();
expectTypeOf<RouteBody<Users['list']>>().toBeNever();

expectTypeOf<RouteErrorCode<Users['one']>>().toEqualTypeOf<'USER_NOT_FOUND' | 'GONE'>();
expectTypeOf<RouteErrorCode<Users['list']>>().toBeNever();

expectTypeOf<RouteReply<Users['list']>>().toEqualTypeOf<{ at: string }>();
expectTypeOf<RouteReply<Users['file']>>().toEqualTypeOf<Response | BodyInit>();
expectTypeOf<RouteReply<Users['remove']>>().toEqualTypeOf<void>();

expectTypeOf<RouteData<Users['list']>>().toEqualTypeOf<{ at: string }>();
expectTypeOf<RouteData<Users['file']>>().toEqualTypeOf<Response>();
expectTypeOf<RouteData<Users['remove']>>().toEqualTypeOf<undefined>();

// Jsonify follows JSON.stringify.
expectTypeOf<Jsonify<Date>>().toEqualTypeOf<string>();
expectTypeOf<Jsonify<{ at: Date; inner: { toJSON(): { n: Date } } }>>().toEqualTypeOf<{
  at: string;
  inner: { n: string };
}>();
expectTypeOf<
  Jsonify<{
    s: string;
    o?: number;
    u: undefined;
    maybe: string | undefined;
    f: () => void;
    fo?: () => void;
    sym: symbol;
    [Symbol.iterator]: number;
  }>
>().toEqualTypeOf<{ s: string; o?: number; maybe?: string }>();
expectTypeOf<Jsonify<(string | undefined | (() => void) | symbol)[]>>().toEqualTypeOf<
  (string | null)[]
>();
expectTypeOf<Jsonify<readonly [Date, undefined]>>().toEqualTypeOf<readonly [string, null]>();
expectTypeOf<Jsonify<{ n: 1; b: true; z: null; list: Date[] }>>().toEqualTypeOf<{
  n: 1;
  b: true;
  z: null;
  list: string[];
}>();
expectTypeOf<Jsonify<bigint>>().toBeNever();
expectTypeOf<Jsonify<{ big: bigint }>>().toEqualTypeOf<{ big: never }>();
expectTypeOf<Jsonify<unknown>>().toBeUnknown();

expectTypeOf<Problem<'GONE', 410>>().toHaveProperty('status').toEqualTypeOf<410>();
expectTypeOf<Problem['requestId']>().toEqualTypeOf<string | undefined>();
