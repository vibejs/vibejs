import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Route } from './contract.ts';
import type { ParamKeys, RawBody } from './route.ts';

// The value type of a def key, `undefined` when the def lacks it. A key can also be optional (an
// annotated `RouteDef`) or `undefined` (a conditional def), so the helpers match on the value.
export type Declared<R extends Route, K extends string> = K extends keyof R['def']
  ? R['def'][K]
  : undefined;
type Flat<T> = { [K in keyof T]: T[K] };
type Out<S> = S extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<S> : never;
type ParamsOut<R extends Route> = [Out<Declared<R, 'params'>>] extends [never]
  ? {}
  : Out<Declared<R, 'params'>>;

/** Path params are strings; a params schema's output replaces the keys it declares. */
export type RouteParams<R extends Route> = Flat<
  Omit<{ readonly [K in ParamKeys<R['path']>]: string }, keyof ParamsOut<R>> & ParamsOut<R>
>;
/** The query schema's output; `never` when the route declares none. */
export type RouteQuery<R extends Route> = Out<Declared<R, 'query'>>;
/** The headers schema's output; `never` when the route declares none. */
export type RouteHeaders<R extends Route> = Out<Declared<R, 'headers'>>;
/** The body schema's output; `never` when the route declares none. */
export type RouteBody<R extends Route> = Out<Declared<R, 'body'>>;
/** The declared error codes; `never` when the route declares none. */
export type RouteErrorCode<R extends Route> = Codes<Declared<R, 'errors'>>;
type Codes<E> = E extends object ? keyof E & string : never;

/** What a handler returns: the response schema's input, a raw body, or nothing. */
export type RouteReply<R extends Route> = Reply<Declared<R, 'response'>>;
type Reply<S> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<S>
  : S extends RawBody
    ? Response | BodyInit
    : void;

/** What a client receives: the response schema's output as JSON, the raw `Response`, or nothing. */
export type RouteData<R extends Route> = Data<Declared<R, 'response'>>;
type Data<S> = S extends StandardSchemaV1
  ? Jsonify<StandardSchemaV1.InferOutput<S>>
  : S extends RawBody
    ? Response
    : undefined;

type Dropped = undefined | symbol | ((...args: never[]) => unknown);
type JsonItem<V> = V extends Dropped ? null : Jsonify<V>;
type Kept<K, V> = K extends symbol ? never : [Exclude<V, Dropped>] extends [never] ? never : K;
type JsonObject<T> = {
  [K in keyof T as undefined extends T[K] ? never : Kept<K, T[K]>]: Jsonify<Exclude<T[K], Dropped>>;
} & {
  [K in keyof T as undefined extends T[K] ? Kept<K, T[K]> : never]?: Jsonify<
    Exclude<T[K], Dropped>
  >;
};

/**
 * The value `JSON.parse(JSON.stringify(value))` returns for a `T`: `toJSON` is followed (a `Date`
 * becomes a string), `undefined`, function and symbol members are dropped (`null` in arrays) and
 * a `bigint` is `never`, because it cannot be serialized.
 */
export type Jsonify<T> = unknown extends T
  ? T
  : T extends { toJSON(): infer J }
    ? Jsonify<J>
    : T extends Dropped | bigint
      ? never
      : T extends string | number | boolean | null
        ? T
        : T extends ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>
          ? {}
          : T extends readonly unknown[]
            ? { [K in keyof T]: JsonItem<T[K]> }
            : Flat<JsonObject<T>>;

/** The `code` of the problems the server itself sends. */
export type BuiltinErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'INVALID_JSON'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'BODY_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

/** One failed check of a request part; `pointer` is an RFC 6901 JSON pointer into that part. */
export interface ValidationIssue {
  readonly in: 'params' | 'query' | 'headers' | 'body';
  readonly pointer: string;
  readonly message: string;
}

/** An `application/problem+json` error body (RFC 9457) with a required `code`. */
export interface Problem<C extends string = string, S extends number = number> {
  readonly type: string;
  readonly title: string;
  readonly status: S;
  readonly code: C;
  readonly detail?: string;
  readonly errors?: readonly ValidationIssue[];
  /** The server always sends it; only problems that a client creates itself lack it. */
  readonly requestId?: string;
}
