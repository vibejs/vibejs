import type {
  Route,
  RouteBody,
  RouteErrorCode,
  RouteHeaders,
  RouteParams,
  RouteQuery,
} from '@vibejs-org/contract';
import type { MetadataKey } from '../module/decorators.ts';

/**
 * Per-request values that guards and interceptors share with handlers. Add fields by augmentation:
 * `declare module '@vibejs-org/server' { interface RequestState { user?: User } }`.
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type -- filled by declaration merging
export interface RequestState {}

/** What guards, interceptors and filters see of a request. */
export interface RequestContext {
  readonly req: Request;
  readonly url: URL;
  readonly route: Route;
  readonly requestId: string;
  readonly ip: string | undefined;
  readonly signal: AbortSignal;
  readonly responseHeaders: Headers;
  readonly state: RequestState;
  readonly params: Readonly<Record<string, unknown>>;
  /** The value of `key` on the handler, else on its controller. */
  getMetadata<T>(key: MetadataKey<T>): T | undefined;
}

// A property that exists only when the route declares the matching schema.
type IfDeclared<K extends string, V> = [V] extends [never] ? {} : { readonly [P in K]: V };

/** The context of a handler for route `R`, with its validated params, query, headers and body. */
export type Ctx<R extends Route> = RequestContext & {
  readonly params: RouteParams<R>;
  /** Ends the request with a declared error code of the route. */
  fail(code: RouteErrorCode<R>, detail?: string): never;
} & IfDeclared<'query', RouteQuery<R>> &
  IfDeclared<'headers', RouteHeaders<R>> &
  IfDeclared<'body', RouteBody<R>>;

/** Decides whether a request may reach its handler. */
export interface CanActivate {
  canActivate(ctx: RequestContext): boolean | Promise<boolean>;
}

/** Wraps a handler: `next()` runs the rest of the chain and resolves to the handler's value. */
export interface Interceptor {
  intercept(ctx: RequestContext, next: () => Promise<unknown>): Promise<unknown>;
}

/** Turns an error into a response; `undefined` passes the error to the next filter. */
export interface ExceptionFilter {
  catch(error: unknown, ctx: RequestContext): Response | undefined | Promise<Response | undefined>;
}
