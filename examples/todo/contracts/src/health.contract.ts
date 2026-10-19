import { defineContract, get } from '@vibejs-org/contract';
import * as v from 'valibot';

export const health = defineContract('/health', {
  check: get('/', { response: v.object({ status: v.literal('ok') }) }),
});
