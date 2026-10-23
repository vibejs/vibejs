import { defineContract, get } from '@usevibejs/contract';
import * as v from 'valibot';

export const health = defineContract('/health', {
  get: get('/', { response: v.object({ status: v.literal('ok') }) }),
});
