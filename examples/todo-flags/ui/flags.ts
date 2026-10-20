import { createClient, type ClientOptions } from '@vibejs-org/contract';
import {
  computed,
  inject,
  shallowRef,
  type InjectionKey,
  type Plugin,
  type Ref,
  type ShallowRef,
} from '@vibejs-org/ui';
import { flags } from '../contract/flags.contract.ts';

// #region plugin
export interface FlagsPluginOptions {
  /** Where the API is mounted; `/api` by default. */
  baseUrl?: string;
  fetch?: ClientOptions['fetch'];
}

const FLAGS: InjectionKey<ShallowRef<Record<string, boolean>>> = Symbol('flags');

/** Loads the flags from `GET <baseUrl>/flags` once; until then, and after an error, every flag is off. */
export const flagsPlugin =
  (options: FlagsPluginOptions = {}): Plugin =>
  (app) => {
    const state = shallowRef<Record<string, boolean>>({});
    app.provide(FLAGS, state);
    const api = createClient(
      { flags },
      { baseUrl: options.baseUrl ?? '/api', fetch: options.fetch },
    );
    void api.flags.list().then((r) => {
      if (r.ok) state.value = r.data;
    });
  };
// #endregion plugin

// #region composable
/** Whether the flag `name` is on; always `false` in an app without `flagsPlugin()`. */
export function useFlag(name: string): Readonly<Ref<boolean>> {
  const state = inject(FLAGS, null);
  return computed(() => state?.value[name] === true);
}
// #endregion composable
