// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { createClient, defineContract, del, get, post, raw } from '@usevibejs/contract';
import * as v from 'valibot';
import { expect, it } from 'vitest';
import { captureLog } from '../test/log.ts';
import { inject } from './di/injector.ts';
import { token } from './di/token.ts';
import type { CanActivate, Ctx } from './http/context.ts';
import { Controller, Handle, Module, UseGuards } from './module/decorators.ts';
import { Test } from './testing.ts';

const User = v.object({
  id: v.string(),
  email: v.pipe(v.string(), v.email()),
  createdAt: v.string(),
});
type UserInput = v.InferInput<typeof User>;

const users = defineContract('/users', {
  findOne: get('/:id', { response: User, errors: { USER_NOT_FOUND: 404 } }),
  create: post('/', {
    body: v.object({ email: v.pipe(v.string(), v.email()) }),
    response: User,
    status: 201,
    errors: { EMAIL_TAKEN: 409 },
  }),
  export: get('/export', { response: raw('text/csv') }),
  clear: del('/'),
  admin: get('/admin'),
});

const USERS_DB = token<Map<string, UserInput>>('USERS_DB');

class UsersService {
  private readonly db = inject(USERS_DB);
  find(id: string): UserInput | undefined {
    return this.db.get(id);
  }
  create(email: string): UserInput | undefined {
    if ([...this.db.values()].some((u) => u.email === email)) return undefined;
    const user = { id: String(this.db.size + 1), email, createdAt: new Date().toISOString() };
    this.db.set(user.id, user);
    return user;
  }
}

class Deny implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

@Controller(users)
class UsersController {
  private readonly users = inject(UsersService);
  @Handle(users.findOne)
  findOne(ctx: Ctx<typeof users.findOne>): UserInput {
    return this.users.find(ctx.params.id) ?? ctx.fail('USER_NOT_FOUND', `No user ${ctx.params.id}`);
  }
  @Handle(users.create)
  create(ctx: Ctx<typeof users.create>): UserInput {
    return this.users.create(ctx.body.email) ?? ctx.fail('EMAIL_TAKEN');
  }
  @Handle(users.export)
  export(): string {
    return 'id,email\n1,ada@example.com\n';
  }
  @Handle(users.clear)
  clear(): void {}
  @Handle(users.admin)
  @UseGuards(Deny)
  admin(): void {}
}

@Module({
  providers: [UsersService, { provide: USERS_DB, useValue: new Map() }],
  controllers: [UsersController],
  exports: [UsersService],
})
class UsersModule {}

it('calls an in-process app through the same baseUrl as production', async () => {
  const seed: UserInput = {
    id: '1',
    email: 'ada@example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const app = await Test.createTestingModule({
    imports: [UsersModule],
    basePath: '/api',
    logger: captureLog().logger,
  })
    .overrideProvider(USERS_DB)
    .useValue(new Map([['1', seed]]))
    .compile();
  const api = createClient({ users }, { baseUrl: '/api', fetch: app.fetch });

  const found = await api.users.findOne({ params: { id: '1' } });
  expect(found.ok && found.data.email).toBe('ada@example.com');

  const missing = await api.users.findOne({ params: { id: 2 } });
  expect(missing).toMatchObject({
    ok: false,
    error: { code: 'USER_NOT_FOUND', status: 404, requestId: expect.any(String) },
  });

  const invalid = await api.users.create({ body: { email: 'nope' } });
  expect(invalid).toMatchObject({
    ok: false,
    error: { code: 'VALIDATION_FAILED', status: 400, errors: [{ in: 'body', pointer: '/email' }] },
  });

  const taken = await api.users.create({ body: { email: 'ada@example.com' } });
  expect(taken).toMatchObject({ ok: false, error: { code: 'EMAIL_TAKEN', status: 409 } });

  const created = await api.users.create({ body: { email: 'bob@example.com' } });
  expect(created.response?.status).toBe(201);
  expect(created.ok && created.data).toMatchObject({ id: '2', email: 'bob@example.com' });

  const csv = await api.users.export();
  expect(csv.ok && (await csv.data.text())).toBe('id,email\n1,ada@example.com\n');

  const cleared = await api.users.clear();
  expect(cleared).toMatchObject({ ok: true, data: undefined });
  expect(cleared.response?.status).toBe(204);

  const denied = await api.users.admin();
  expect(denied).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', status: 403 } });

  await app.close();
});
