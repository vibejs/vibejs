import { defineContract, del, get, post, raw } from '@vibejs-org/contract';
import { toStandardJsonSchema } from '@valibot/to-json-schema';
import * as v from 'valibot';

const User = v.object({ id: v.string(), email: v.pipe(v.string(), v.email()), name: v.string() });
const json = toStandardJsonSchema;

/** The fixture API with valibot schemas; `User` is named through `libraryOptions.definitions`. */
export const contracts: object = {
  users: defineContract('/users', {
    list: get('/', {
      query: json(v.object({ q: v.optional(v.string()), limit: v.optional(v.string()) })),
      response: json(v.array(User)),
    }),
    findOne: get('/:id', {
      params: json(v.object({ id: v.pipe(v.string(), v.uuid()) })),
      headers: json(v.object({ 'x-tenant': v.string() })),
      response: json(User),
      errors: { USER_NOT_FOUND: 404 },
    }),
    create: post('/', {
      body: json(v.object({ email: v.pipe(v.string(), v.email()), name: v.string() })),
      response: json(User),
      status: 201,
      errors: { EMAIL_TAKEN: 409, INVALID_EMAIL: 400 },
      summary: 'Create a user',
      description: 'Creates a user and returns it.',
    }),
    remove: del('/:id', { errors: { USER_NOT_FOUND: 404 } }),
    avatar: get('/:id/avatar', { response: raw('image/png') }),
  }),
  health: defineContract('/health', {
    check: get('/', { response: json(v.object({ ok: v.boolean() })) }),
  }),
};

export const libraryOptions: Record<string, unknown> | undefined = { definitions: { User } };
