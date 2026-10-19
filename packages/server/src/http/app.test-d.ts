import { expectTypeOf } from 'vitest';
import type { RequestState } from '../index.ts';
import type { App, AppOptions } from './app.ts';
import type { CanActivate, ExceptionFilter, RequestContext } from './context.ts';
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
