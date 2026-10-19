import { createClient, type Client, type ClientOptions } from '@vibejs-org/contract';
import type { InjectionKey } from '@vibejs-org/ui';
import { health } from '../../contracts/src/health.contract.ts';

export type Api = Client<{ health: typeof health }>;

/** The API client, provided by the app and injected by components. */
export const API: InjectionKey<Api> = Symbol('api');

/** The client of the app's contracts at `/api`; tests pass their own `fetch`. */
export const createApi = (fetch?: ClientOptions['fetch']): Api =>
  createClient({ health }, { baseUrl: '/api', fetch });
