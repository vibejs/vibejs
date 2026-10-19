// The component instance and the state of the code that runs on its behalf: the instance whose
// setup or render is running, and the app of `app.runWithContext()`.
import type { SetupContext, Slots } from '../component.ts';
import { vibeError } from '../errors.gen.ts';
import type { ComponentDef } from '../internal.ts';
import { EffectScopeImpl } from '../reactivity/effectScope.ts';
import type { ShallowRef } from '../reactivity/ref.ts';
import { warn } from '../warn.ts';
import type { AppConfig, ComponentHandle } from './app.ts';
import type { Block } from './block.ts';
import { callWithErrorHandling } from './errorHandling.ts';
import type { RawProps } from './props.ts';
import type { RawSlots } from './slots.ts';

export type LifecycleHook =
  | 'beforeMount'
  | 'mounted'
  | 'beforeUpdate'
  | 'updated'
  | 'beforeUnmount'
  | 'unmounted';

export type ErrorCapturedHook = (
  err: unknown,
  instance: ComponentHandle | null,
  info: string,
) => boolean | void;

/** What the components of one app share. */
export interface AppContext {
  readonly uid: number;
  readonly config: AppConfig;
  readonly provides: Record<PropertyKey, unknown>;
  /** The number of ids `useId()` gave out. */
  ids: number;
}

/** The context of components created outside an app. */
const detachedContext: AppContext = {
  uid: 0,
  config: {},
  provides: Object.create(null),
  ids: 0,
};

let uid = 0;

/** A rendered component. Its public view is `ComponentHandle`. */
export class ComponentInstance {
  readonly uid: number = uid++;
  readonly def: ComponentDef;
  readonly name: string | undefined;
  /** The component that renders this one: its provides, error hooks and app reach this one. */
  readonly parent: ComponentInstance | null;
  /**
   * The component whose template creates this one: the parent, or for slot content the
   * component that wrote the slot. It owns the slots, and its scope id goes on this one's root.
   */
  readonly owner: ComponentInstance | null;
  readonly rawProps: RawProps | null;
  readonly rawSlots: RawSlots | null;
  /** Whether the instance is the only root of its parent's template. */
  readonly isSingleRoot: boolean;
  readonly appContext: AppContext;
  /** Owns everything the setup and the render create; detached, it stops when the instance unmounts. */
  readonly scope: EffectScopeImpl = new EffectScopeImpl(true);
  /** What `provide()` adds to: the parent's provides until the first `provide()`. */
  provides: Record<PropertyKey, unknown>;
  hooks: Partial<Record<LifecycleHook, (() => void)[]>> = {};
  errorCaptured: ErrorCapturedHook[] = [];
  /** The registry of `useTemplateRef()`. */
  refs: Record<string, ShallowRef<unknown>> = {};
  block: Block = document.createComment('');
  props!: Record<string, unknown>;
  attrs!: Record<string, unknown>;
  slots!: Slots;
  ctx!: SetupContext;
  exposed: Record<string, unknown> | undefined;
  isMounted = false;
  isUnmounted = false;
  /** Set from the first render effect run of a flush until its `updated` hooks run. */
  updating = false;

  constructor(
    def: ComponentDef,
    parent: ComponentInstance | null,
    owner: ComponentInstance | null,
    rawProps: RawProps | null,
    rawSlots: RawSlots | null,
    isSingleRoot: boolean,
    appContext: AppContext = parent?.appContext ?? currentApp ?? detachedContext,
  ) {
    this.def = def;
    this.name = def.name;
    this.parent = parent;
    this.owner = owner;
    this.rawProps = rawProps;
    this.rawSlots = rawSlots;
    this.isSingleRoot = isSingleRoot;
    this.appContext = appContext;
    this.provides = parent ? parent.provides : appContext.provides;
  }
}

/** The instance whose setup, render or render effect is running: the owner of what it creates. */
export let currentInstance: ComponentInstance | null = null;
/** The parent of the components created now: the current instance, or the host of a running slot. */
export let currentParent: ComponentInstance | null = null;

/** Runs `fn` with `instance` as the current instance and `parent` as the parent of new components. */
export function withInstance<R>(
  instance: ComponentInstance | null,
  fn: () => R,
  parent: ComponentInstance | null = instance,
): R {
  const prev = currentInstance;
  const prevParent = currentParent;
  currentInstance = instance;
  currentParent = parent;
  try {
    return fn();
  } finally {
    currentInstance = prev;
    currentParent = prevParent;
  }
}

/** The app context of `app.runWithContext()`. */
export let currentApp: AppContext | null = null;

export function setCurrentApp(app: AppContext | null): AppContext | null {
  const prev = currentApp;
  currentApp = app;
  return prev;
}

/** The current instance for a setup-only API; outside setup, warns VIBE5205 and returns null. */
export function setupInstance(api: string): ComponentInstance | null {
  if (!currentInstance) warn(vibeError('VIBE5205', { api }));
  return currentInstance;
}

/**
 * Calls the `name` hooks of `instance` with it as the current instance; an error goes to the error
 * handler as `'<name> hook'`.
 */
export function callHooks(instance: ComponentInstance, name: LifecycleHook): void {
  for (const hook of instance.hooks[name] ?? []) {
    withInstance(instance, () => callWithErrorHandling(hook, instance, `${name} hook`));
  }
}
