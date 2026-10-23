import { defineContract, get } from '@usevibejs/contract';
import * as v from 'valibot';

export const health = defineContract('/health', {
  get: get('/', { response: v.object({ status: v.literal('ok') }) }),
  service: get('/:service', {
    response: v.object({ service: v.string(), status: v.literal('ok') }),
    errors: { UNKNOWN_SERVICE: 404 },
  }),
});
