import { createClient, type Client, type ClientOptions } from '@usevibejs/contract';
import type { InjectionKey } from '@usevibejs/ui';
import { health } from '../../contracts/src/health.contract.ts';

/** Every contract of the app. */
const contracts = { health };

export type Api = Client<typeof contracts>;

/** The API client, provided by the app and injected by components. */
export const API: InjectionKey<Api> = Symbol('api');

/** The client of the app's contracts at `/api`; tests pass their own `fetch`. */
export const createApi = (fetch?: ClientOptions['fetch']): Api =>
  createClient(contracts, { baseUrl: '/api', fetch });
