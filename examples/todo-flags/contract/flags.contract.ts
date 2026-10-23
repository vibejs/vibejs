import { defineContract, get } from '@usevibejs/contract';
import * as v from 'valibot';

export const flags = defineContract('/flags', {
  list: get('/', { response: v.record(v.string(), v.boolean()) }),
});
