import { defineContract, del, get, post, raw } from '@vibejs-org/contract';
import { z } from 'zod';

const User = z.object({ id: z.string(), email: z.email(), name: z.string() }).meta({ id: 'User' });

/** The fixture API with zod schemas; `User` is a named schema shared by three responses. */
export const contracts: object = {
  users: defineContract('/users', {
    list: get('/', {
      query: z.object({ q: z.string().optional(), limit: z.string().optional() }),
      response: z.array(User),
    }),
    findOne: get('/:id', {
      params: z.object({ id: z.uuid() }),
      headers: z.object({ 'x-tenant': z.string() }),
      response: User,
      errors: { USER_NOT_FOUND: 404 },
    }),
    create: post('/', {
      body: z.object({ email: z.email(), name: z.string() }),
      response: User,
      status: 201,
      errors: { EMAIL_TAKEN: 409, INVALID_EMAIL: 400 },
      summary: 'Create a user',
      description: 'Creates a user and returns it.',
    }),
    remove: del('/:id', { errors: { USER_NOT_FOUND: 404 } }),
    avatar: get('/:id/avatar', { response: raw('image/png') }),
  }),
  health: defineContract('/health', {
    check: get('/', { response: z.object({ ok: z.boolean() }) }),
  }),
};

export const libraryOptions: Record<string, unknown> | undefined = undefined;
