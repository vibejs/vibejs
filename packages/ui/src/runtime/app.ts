// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/apiCreateApp.ts (MIT)
// oxlint-disable typescript/no-explicit-any -- a plugin's options default to any, as upstream declares them
import type { Component } from '../component.ts';
import { vibeError } from '../errors.gen.ts';
import { EffectScopeImpl } from '../reactivity/effectScope.ts';
import { proxyRefs } from '../reactivity/ref.ts';
import { isFunction } from '../shared.ts';
import { warn } from '../warn.ts';
import { insert, removeNodes } from './block.ts';
import { createRootComponent } from './component.ts';
import type { InjectionKey } from './inject.ts';
import {
  type AppContext,
  setCurrentApp,
  setupInstance,
  type ComponentInstance,
} from './instance.ts';
import type { RawProps } from './props.ts';
import { flushPostFlushCbs } from './scheduler.ts';

/** The public view of a component instance, passed to error and warning handlers. */
export interface ComponentHandle {
  readonly uid: number;
  readonly name?: string;
  /** Dev only: the source file of the component, such as `src/App.vibe`. */
  readonly file?: string;
  readonly parent: ComponentHandle | null;
}

export interface AppConfig {
  /** Receives the errors that no `onErrorCaptured` hook stopped, instead of the console. */
  errorHandler?: (err: unknown, instance: ComponentHandle | null, info: string) => void;
  /** Receives the dev warnings instead of the console, with the trace of component names. */
  warnHandler?: (msg: string, instance: ComponentHandle | null, trace: string) => void;
}

/** A function, or an object with `install`, that `app.use()` calls with the app and the options. */
export type Plugin<O extends unknown[] = any[]> =
  | ((app: App, ...options: O) => void)
  | { install(app: App, ...options: O): void };

export interface App {
  readonly config: AppConfig;
  /** Installs `plugin` once, with `options`. */
  use<O extends unknown[]>(plugin: Plugin<O>, ...options: NoInfer<O>): this;
  /** Provides `value` to every component of the app, and to `inject()` in `runWithContext()`. */
  provide<T, K = InjectionKey<T> | string | number>(
    key: K,
    value: K extends InjectionKey<infer V> ? V : T,
  ): this;
  /**
   * Renders the root component into `container` (an element or a selector), replacing its
   * content, and returns the root's exposed values once the `mounted` hooks ran. Other pending
   * post-flush work, such as `flush: 'post'` watchers, runs then too, before pending updates.
   * A dev reload of the root mounts a new instance: a later `mount()` returns its exposed values,
   * while an object returned before still reads the old instance.
   */
  mount(container: Element | string): Record<string, unknown>;
  /** Unmounts the root component and removes its nodes, then runs the `onUnmount` callbacks. */
  unmount(): void;
  /** Registers `cb` to run when the app unmounts, such as a plugin's cleanup. */
  onUnmount(cb: () => void): void;
  /** Runs `fn` with the app as the injection context, so `inject()` reads the app's provides. */
  runWithContext<T>(fn: () => T): T;
  /** @deprecated Global components are not supported: import components where they are used (VIBE5301). */
  component(...a: never[]): never;
  /** @deprecated Custom directives are not supported: use a template ref and `onMounted()` (VIBE5301). */
  directive(...a: never[]): never;
  /** @deprecated Mixins are not supported: use a composable (VIBE5301). */
  mixin(...a: never[]): never;
}

const unsupported = (api: string) => (): never => {
  throw vibeError('VIBE5301', { api });
};

/** The element that `selector` matches; VIBE5303 when none does. */
function query(selector: string): Element {
  const el = document.querySelector(selector);
  if (!el) throw vibeError('VIBE5303', { target: selector });
  return el;
}

/** The number of apps created; the components outside an app use id 0. */
let appUid = 0;

/** Creates an app that renders `root` with `rootProps`. */
export function createApp(root: Component, rootProps: Record<string, unknown> | null = null): App {
  const context: AppContext = {
    uid: ++appUid,
    config: {},
    provides: Object.create(null),
    ids: 0,
  };
  const plugins = new Set<unknown>();
  const scope = new EffectScopeImpl(true);
  const unmountCbs: (() => void)[] = [];
  let instance: ComponentInstance | undefined;
  let unmounted = false;
  let exposed: Record<string, unknown> = {};

  const app: App = {
    config: context.config,
    use(plugin, ...options) {
      // A function plugin, or any value with an `install` function (a class with a static one too).
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- untyped callers may pass anything
      const { install } = (plugin as { install?: unknown } | undefined) ?? {};
      const fn = isFunction(install) ? install : plugin;
      if (plugins.has(plugin) || !isFunction(fn)) {
        const problem = plugins.has(plugin) ? 'a plugin that is already installed' : 'no plugin';
        warn(vibeError('VIBE5304', { problem }), null, context.config);
      } else {
        plugins.add(plugin);
        Reflect.apply(fn, plugin, [app, ...options]);
      }
      return app;
    },
    provide(key, value) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keys are symbols, strings or numbers
      context.provides[key as PropertyKey] = value;
      return app;
    },
    mount(container) {
      if (instance) {
        warn(vibeError('VIBE5302'), null, context.config);
        return exposed;
      }
      const el = typeof container === 'string' ? query(container) : container;
      el.textContent = '';
      const props: RawProps = {};
      for (const key in rootProps) props[key] = () => rootProps[key];
      let rootScope: EffectScopeImpl;
      const render = (): ComponentInstance => {
        rootScope = scope.run(() => new EffectScopeImpl())!;
        const created = rootScope.run(() => createRootComponent(root, props, context))!;
        insert(created, el);
        flushPostFlushCbs();
        return created;
      };
      instance = render();
      const remount = (): void => {
        rootScope.stop();
        removeNodes(instance!);
        instance = render();
        exposed = proxyRefs(instance.exposed ?? {});
      };
      context.remount = __DEV__ ? remount : undefined;
      exposed = proxyRefs(instance.exposed ?? {});
      return exposed;
    },
    unmount() {
      if (!instance || unmounted) {
        warn(vibeError('VIBE5305'), null, context.config);
        return;
      }
      unmounted = true;
      scope.stop();
      removeNodes(instance);
      flushPostFlushCbs();
      for (const cb of unmountCbs) cb();
    },
    onUnmount(cb) {
      unmountCbs.push(cb);
    },
    runWithContext(fn) {
      const prev = setCurrentApp(context);
      try {
        return fn();
      } finally {
        setCurrentApp(prev);
      }
    },
    component: unsupported('component'),
    directive: unsupported('directive'),
    mixin: unsupported('mixin'),
  };
  return app;
}

/**
 * An id unique in the app, `v<app>-<n>`, for `id` and `for` attributes. Call it in setup, where it
 * stays the instance's; VIBE5205 elsewhere.
 */
export function useId(): string {
  const instance = setupInstance('useId');
  if (!instance) return '';
  const context = instance.appContext;
  return `v${context.uid}-${context.ids++}`;
}
