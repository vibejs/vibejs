import { defineContract, get } from '@usevibejs/contract';
import { expectTypeOf } from 'vitest';
import { z } from 'zod';
import { generateOpenApi, type OpenApiDocument } from './openapi.ts';

const users = defineContract('/users', { list: get('/', { response: z.array(z.string()) }) });
const info = { title: 'API', version: '1.0.0' };

expectTypeOf(generateOpenApi(users, { info })).toEqualTypeOf<OpenApiDocument>();
expectTypeOf(generateOpenApi({ users }, { info }).openapi).toEqualTypeOf<'3.1.1'>();
generateOpenApi({ admin: { users } }, { info, servers: [{ url: '/api' }] });

// @ts-expect-error -- info.title is required
generateOpenApi(users, { info: { version: '1.0.0' } });
// @ts-expect-error -- info.version is required
generateOpenApi(users, { info: { title: 'API' } });
// @ts-expect-error -- info is required
generateOpenApi(users, {});
