// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/apiInject.ts (MIT)
import { vibeError } from '../errors.gen.ts';
import { isFunction } from '../shared.ts';
import { warn } from '../warn.ts';
import { currentApp, currentInstance, setupInstance } from './instance.ts';

/** A typed key of `provide()` and `inject()`. */
// oxlint-disable-next-line typescript/no-empty-object-type, typescript/no-wrapper-object-types, eslint/no-unused-vars -- a symbol branded by `T`, the type of the provided value
export interface InjectionKey<T> extends Symbol {}

/** Makes `value` available to `inject(key)` in the descendants of the component whose setup is running. */
export function provide<T, K = InjectionKey<T> | string | number>(
  key: K,
  value: K extends InjectionKey<infer V> ? V : T,
): void {
  const instance = setupInstance('provide');
  if (!instance) return;
  const parentProvides = instance.parent ? instance.parent.provides : instance.appContext.provides;
  if (instance.provides === parentProvides) instance.provides = Object.create(parentProvides);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keys are symbols, strings or numbers
  instance.provides[key as PropertyKey] = value;
}

export function inject<T>(key: InjectionKey<T> | string): T | undefined;
export function inject<T>(key: InjectionKey<T> | string, def: T, treatDefaultAsFactory?: false): T;
export function inject<T>(
  key: InjectionKey<T> | string,
  def: T | (() => T),
  treatDefaultAsFactory: true,
): T;
/**
 * The value that the nearest ancestor (or the app) provides for `key`; in
 * `app.runWithContext()`, the app's. Without one, the default (`def()` with
 * `treatDefaultAsFactory`), else `undefined` and a VIBE5206 warning.
 */
export function inject(key: InjectionKey<unknown> | string, ...rest: unknown[]): unknown {
  const instance = currentInstance;
  // `app.runWithContext()` wins, even inside a component's setup.
  const provides =
    currentApp?.provides ?? instance?.parent?.provides ?? instance?.appContext.provides;
  if (!provides) {
    warn(vibeError('VIBE5205', { api: 'inject' }));
    return undefined;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a key is a symbol or a string
  const k = key as PropertyKey;
  if (k in provides) return provides[k];
  const [def, factory] = rest;
  if (rest.length) return factory && isFunction(def) ? def() : def;
  warn(vibeError('VIBE5206', { key: String(key) }), instance);
  return undefined;
}

/** Whether `inject()` can run here: in a component's setup or in `app.runWithContext()`. */
export function hasInjectionContext(): boolean {
  return !!(currentInstance ?? currentApp);
}
