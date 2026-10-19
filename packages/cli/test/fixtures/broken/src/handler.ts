// A local stand-in for the contract types and the generic `@Handle` signature.
interface Route<T = unknown> {
  readonly path: string;
  readonly sample: T;
}
export type Ctx<R extends Route> = { readonly route: R };
type Reply<R extends Route> = R['sample'];

export function Handle<R extends Route>(route: R) {
  return <T extends (ctx: Ctx<R>) => Reply<R> | Promise<Reply<R>>>(
    _target: object,
    _key: string | symbol,
    _desc: TypedPropertyDescriptor<T>,
  ): void => {
    void route;
  };
}

export const users = { path: '/users/:id', sample: { id: '1', name: 'Ada' } };

export class UsersController {
  @Handle(users)
  get(ctx: Ctx<typeof users>): typeof users.sample {
    return ctx.route.sample;
  }
}

export class CountController {
  @Handle(users)
  count(ctx: Ctx<typeof users>): number {
    return ctx.route.path.length;
  }
}
