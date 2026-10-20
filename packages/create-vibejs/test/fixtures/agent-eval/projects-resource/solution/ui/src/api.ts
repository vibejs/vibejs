import { createClient, type Client, type ClientOptions } from '@vibejs-org/contract';
import type { InjectionKey } from '@vibejs-org/ui';
import { health } from '../../contracts/src/health.contract.ts';
import { projects } from '../../contracts/src/projects.contract.ts';

/** Every contract of the app. */
const contracts = { health, projects };

export type Api = Client<typeof contracts>;

/** The API client, provided by the app and injected by components. */
export const API: InjectionKey<Api> = Symbol('api');

/** The client of the app's contracts at `/api`; tests pass their own `fetch`. */
export const createApi = (fetch?: ClientOptions['fetch']): Api =>
  createClient(contracts, { baseUrl: '/api', fetch });
