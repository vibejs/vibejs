import { defineContract, get, raw } from '@vibejs-org/contract';

export const health = defineContract('/health', {
  get: get('/', { response: raw('text/plain') }),
});
