import { createClient, defineContract, get } from '@usevibejs/contract';
import * as v from 'valibot';

const users = defineContract('/users', {
  findOne: get('/:id', { response: v.object({ email: v.string() }) }),
});

const api = createClient({ users }, { baseUrl: '/api' });
const result = await api.users.findOne({ params: { id: 1 } });
export const text = result.ok ? result.data.email : result.error.code;
