import { defineContract, get, raw } from '@usevibejs/contract';

export const health = defineContract('/health', {
  get: get('/', { response: raw('text/plain') }),
});
