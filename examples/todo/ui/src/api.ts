import { createClient, type Client, type ClientOptions } from '@vibejs-org/contract';
import type { InjectionKey } from '@vibejs-org/ui';
import { todos } from '../../contracts/src/todos.contract.ts';

export type Api = Client<{ todos: typeof todos }>;

/** The API client, provided by the app and injected by components. */
export const API: InjectionKey<Api> = Symbol('api');

/** The client of the app's contracts at `/api`; tests pass `app.fetch`. */
export const createApi = (fetch?: ClientOptions['fetch']): Api =>
  createClient({ todos }, { baseUrl: '/api', fetch });
