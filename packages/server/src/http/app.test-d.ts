// oxlint-disable typescript/no-extraneous-class -- type fixtures
import { defineContract, get } from '@vibejs-org/contract';
import * as v from 'valibot';
import { expectTypeOf } from 'vitest';
import type { RequestState } from '../index.ts';
import { UseFilters, UseGuards, UseInterceptors } from '../module/decorators.ts';
import type { Class } from '../di/token.ts';
import type { DynamicModule } from '../module/graph.ts';
import { inspect, type App, type AppInspection, type AppOptions } from './app.ts';
import type { CanActivate, Ctx, ExceptionFilter, Interceptor, RequestContext } from './context.ts';
import { HttpError } from './errors.ts';

declare module '../index.ts' {
  interface RequestState {
    user?: { readonly id: string };
  }
}

class Guard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
class NeedsArgs implements CanActivate {
  readonly allowed: boolean;
  constructor(allowed: boolean) {
    this.allowed = allowed;
  }
  canActivate(): boolean {
    return this.allowed;
  }
}

export const options: AppOptions = { guards: [Guard] };
// @ts-expect-error -- global guards are built without constructor arguments
export const rejected: AppOptions = { guards: [NeedsArgs] };

export class ToHttp implements ExceptionFilter {
  catch(error: unknown): HttpError | undefined {
    return error instanceof Error ? new HttpError(400, 'BAD_REQUEST', error.message) : undefined;
  }
}

declare const ctx: RequestContext;
expectTypeOf(ctx.state).toEqualTypeOf<RequestState>();
expectTypeOf(ctx.state.user).toEqualTypeOf<{ readonly id: string } | undefined>();

declare const app: App;
expectTypeOf(app.fetch).toExtend<(req: Request) => Promise<Response>>();
export const handler: { fetch: (req: Request) => Promise<Response> } = { fetch: app.fetch };

expectTypeOf<AppOptions['validateResponses']>().toEqualTypeOf<boolean | undefined>();
export const unchecked: AppOptions = { validateResponses: false };

const search = defineContract('/search', {
  list: get('/', { query: v.object({ tags: v.array(v.string()), page: v.optional(v.string()) }) }),
  all: get('/all'),
});
declare const listCtx: Ctx<typeof search.list>;
expectTypeOf(listCtx.query).toEqualTypeOf<{ tags: string[]; page?: string | undefined }>();
declare const allCtx: Ctx<typeof search.all>;
expectTypeOf(allCtx).not.toHaveProperty('query');

class NeedsArgsInterceptor implements Interceptor {
  readonly prefix: string;
  constructor(prefix: string) {
    this.prefix = prefix;
  }
  intercept(_ctx: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }
}
class NeedsArgsFilter implements ExceptionFilter {
  readonly status: number;
  constructor(status: number) {
    this.status = status;
  }
  catch(): HttpError {
    return new HttpError(this.status, 'X');
  }
}

// @ts-expect-error -- guards are built without constructor arguments
UseGuards(NeedsArgs);
// @ts-expect-error -- interceptors are built without constructor arguments
UseInterceptors(NeedsArgsInterceptor);
// @ts-expect-error -- filters are built without constructor arguments
UseFilters(NeedsArgsFilter);
// @ts-expect-error -- global interceptors are built without constructor arguments
export const rejectedInterceptor: AppOptions = { interceptors: [NeedsArgsInterceptor] };
// @ts-expect-error -- global filters are built without constructor arguments
export const rejectedFilter: AppOptions = { filters: [NeedsArgsFilter] };

class Root {}
expectTypeOf(inspect).parameter(0).toEqualTypeOf<Class | DynamicModule>();
expectTypeOf(inspect).parameter(1).toEqualTypeOf<AppOptions | undefined>();
expectTypeOf(inspect(Root)).toEqualTypeOf<AppInspection>();
expectTypeOf(inspect({ module: Root }, { basePath: '/api' })).toEqualTypeOf<AppInspection>();
// @ts-expect-error -- the root is a module class or a dynamic module
inspect('AppModule');
