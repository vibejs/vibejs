import { defineContract, del, get, post, raw } from '@vibejs-org/contract';
import { type } from 'arktype';

const User = type({ id: 'string', email: 'string.email', name: 'string' });

/** The fixture API with arktype schemas. */
export const contracts: object = {
  users: defineContract('/users', {
    list: get('/', {
      query: type({ 'q?': 'string', 'limit?': 'string' }),
      response: User.array(),
    }),
    findOne: get('/:id', {
      params: type({ id: 'string.uuid' }),
      headers: type({ 'x-tenant': 'string' }),
      response: User,
      errors: { USER_NOT_FOUND: 404 },
    }),
    create: post('/', {
      body: type({ email: 'string.email', name: 'string' }),
      response: User,
      status: 201,
      errors: { EMAIL_TAKEN: 409, INVALID_EMAIL: 400 },
      summary: 'Create a user',
      description: 'Creates a user and returns it.',
    }),
    remove: del('/:id', { errors: { USER_NOT_FOUND: 404 } }),
    avatar: get('/:id/avatar', { response: raw('image/png') }),
  }),
  health: defineContract('/health', { check: get('/', { response: type({ ok: 'boolean' }) }) }),
};

export const libraryOptions: Record<string, unknown> | undefined = undefined;
