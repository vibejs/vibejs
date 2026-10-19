// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/reactivity/src/watch.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/apiWatch.ts (MIT)
// oxlint-disable typescript/no-explicit-any -- the public types follow the upstream declarations
import { vibeError } from '../errors.gen.ts';
import type { ComputedRef } from '../reactivity/computed.ts';
import { ReactiveEffect, setActiveSub } from '../reactivity/core.ts';
import { isReactive, isRef, isShallow } from '../reactivity/dep.ts';
import { activeEffectScope } from '../reactivity/effectScope.ts';
import type { ReactiveMarker } from '../reactivity/reactive.ts';
import type { Ref } from '../reactivity/ref.ts';
import { hasChanged, isFunction, isObject } from '../shared.ts';
import { warn } from '../warn.ts';
import { callWithAsyncErrorHandling, callWithErrorHandling } from './errorHandling.ts';
import { currentInstance } from './instance.ts';
import { queueJob, queuePostFlushCb, SchedulerJobFlags, type SchedulerJob } from './scheduler.ts';

export type WatchSource<T = any> = Ref<T, any> | ComputedRef<T> | (() => T);
export type OnCleanup = (cleanupFn: () => void) => void;
export type WatchCallback<V = any, OV = any> = (
  value: V,
  oldValue: OV,
  onCleanup: OnCleanup,
) => any;
export interface WatchOptions<Immediate = boolean> {
  /** Runs the callback once at creation, with `undefined` as the old value. */
  immediate?: Immediate;
  /** Tracks nested values: `true` at every depth, a number down to that depth. */
  deep?: boolean | number;
  /** Stops the watcher after the first callback. */
  once?: boolean;
  /** `'pre'` (default) runs before the post queue, `'post'` after it, `'sync'` inside the write. */
  flush?: 'pre' | 'post' | 'sync';
}
export type WatchStopHandle = () => void;
export interface WatchHandle extends WatchStopHandle {
  stop: () => void;
  /** Holds the watcher: changes are recorded instead of running it. */
  pause: () => void;
  /** Releases the watcher; it runs once if a change was recorded while paused. */
  resume: () => void;
}

type WatchEffect = (onCleanup: OnCleanup) => void;
type MultiWatchSources = (WatchSource<unknown> | object)[];
type MaybeUndefined<T, I> = I extends true ? T | undefined : T;
type MapSources<T, Immediate> = {
  [K in keyof T]: T[K] extends WatchSource<infer V>
    ? MaybeUndefined<V, Immediate>
    : T[K] extends object
      ? MaybeUndefined<T[K], Immediate>
      : never;
};

/** The old value before the first callback, so that an initial `undefined` counts as a change. */
const INITIAL_WATCHER_VALUE = {};

/** The cleanups of the running watcher callback or effect, for `onWatcherCleanup()`. */
let activeCleanups: (() => void)[] | undefined;

/**
 * Registers `cleanupFn` on the running watcher: it runs before the watcher runs again and when it
 * stops. With no running watcher, warns VIBE5006 unless `failSilently`.
 */
export function onWatcherCleanup(cleanupFn: () => void, failSilently = false): void {
  if (activeCleanups) activeCleanups.push(cleanupFn);
  else if (!failSilently) warn(vibeError('VIBE5006', { api: 'onWatcherCleanup' }));
}

export function watch<T, I extends Readonly<boolean> = false>(
  source: WatchSource<T>,
  cb: WatchCallback<T, MaybeUndefined<T, I>>,
  options?: WatchOptions<I>,
): WatchHandle;
export function watch<T extends Readonly<MultiWatchSources>, I extends Readonly<boolean> = false>(
  sources: readonly [...T] | T,
  cb: [T] extends [ReactiveMarker]
    ? WatchCallback<T, MaybeUndefined<T, I>>
    : WatchCallback<MapSources<T, false>, MapSources<T, I>>,
  options?: WatchOptions<I>,
): WatchHandle;
export function watch<T extends MultiWatchSources, I extends Readonly<boolean> = false>(
  sources: [...T],
  cb: WatchCallback<MapSources<T, false>, MapSources<T, I>>,
  options?: WatchOptions<I>,
): WatchHandle;
export function watch<T extends object, I extends Readonly<boolean> = false>(
  source: T,
  cb: WatchCallback<T, MaybeUndefined<T, I>>,
  options?: WatchOptions<I>,
): WatchHandle;
/**
 * Calls `cb` with the new and the old value when `source` changes: a ref, a computed ref, a
 * getter, a reactive object (watched deeply) or an array of these.
 */
export function watch(source: unknown, cb: WatchCallback, options?: WatchOptions): WatchHandle {
  return doWatch(source, cb, options);
}

/** Runs `effect` now and again when what it read changes, before the post queue. */
export function watchEffect(
  effect: WatchEffect,
  options?: { flush?: 'pre' | 'post' | 'sync' },
): WatchHandle {
  return doWatch(effect, undefined, options);
}

/** Like `watchEffect`, but its runs, the first one included, wait for the post queue. */
export function watchPostEffect(effect: WatchEffect): WatchHandle {
  return doWatch(effect, undefined, { flush: 'post' });
}

/** Like `watchEffect`, but it runs inside the write that changes what it read. */
export function watchSyncEffect(effect: WatchEffect): WatchHandle {
  return doWatch(effect, undefined, { flush: 'sync' });
}

function invalidSource(value: unknown): undefined {
  warn(vibeError('VIBE5007', { type: Object.prototype.toString.call(value).slice(8, -1) }));
  return undefined;
}

function doWatch(
  source: unknown,
  cb: WatchCallback | undefined,
  { immediate, deep, once, flush }: WatchOptions = {},
): WatchHandle {
  // The owner: its error handlers see the errors, and its updates run after its watchers.
  const instance = currentInstance;
  // A reactive source is deep, unless `deep` says otherwise or the source is shallow.
  const reactiveGetter = (value: unknown): unknown =>
    deep ? value : traverse(value, isShallow(value) || deep === false || deep === 0 ? 1 : Infinity);
  const cleanups: (() => void)[] = [];
  const onCleanup: OnCleanup = (fn) => {
    cleanups.push(fn);
  };
  const runCleanups = (): void => {
    const prevSub = setActiveSub(undefined);
    for (const fn of cleanups.splice(0)) callWithErrorHandling(fn, instance, 'watcher cleanup');
    setActiveSub(prevSub);
  };

  let getter: () => unknown;
  let forceTrigger = false;
  let isMultiSource = false;
  let oldValue: any = INITIAL_WATCHER_VALUE;
  if (isRef(source)) {
    getter = () => source.value;
    forceTrigger = isShallow(source);
  } else if (isReactive(source)) {
    getter = () => reactiveGetter(source);
    forceTrigger = true;
  } else if (Array.isArray(source)) {
    isMultiSource = true;
    forceTrigger = source.some((s) => isReactive(s) || isShallow(s));
    oldValue = source.map(() => INITIAL_WATCHER_VALUE);
    getter = () =>
      source.map((s: unknown) => {
        if (isRef(s)) return s.value;
        if (isReactive(s)) return reactiveGetter(s);
        if (isFunction(s)) return callWithErrorHandling(s, instance, 'watcher getter');
        return invalidSource(s);
      });
  } else if (isFunction(source)) {
    getter = cb
      ? () => callWithErrorHandling(source, instance, 'watcher getter')
      : () => {
          runCleanups();
          const prevCleanups = activeCleanups;
          activeCleanups = cleanups;
          callWithAsyncErrorHandling<[OnCleanup], unknown>(source, instance, 'watcher callback', [
            onCleanup,
          ]);
          activeCleanups = prevCleanups;
        };
  } else {
    getter = () => undefined;
    invalidSource(source);
  }

  if (cb && deep) {
    const baseGetter = getter;
    const depth = deep === true ? Infinity : deep;
    getter = () => traverse(baseGetter(), depth);
  }

  const effect = new ReactiveEffect(getter);
  const job: SchedulerJob & ((immediateFirstRun?: boolean) => void) = (
    immediateFirstRun?: boolean,
  ): void => {
    // Stopped, or a scheduled run that finds nothing changed.
    if (!effect.flags || (!immediateFirstRun && !effect.dirty)) return;
    if (!cb) {
      effect.run();
      return;
    }
    const newValue: any = effect.run();
    if (
      !immediateFirstRun &&
      !deep &&
      !forceTrigger &&
      !(isMultiSource
        ? newValue.some((v: unknown, i: number) => hasChanged(v, oldValue[i]))
        : hasChanged(newValue, oldValue))
    ) {
      return;
    }
    runCleanups();
    const prevSub = setActiveSub(undefined);
    const prevCleanups = activeCleanups;
    activeCleanups = cleanups;
    const args: Parameters<WatchCallback> = [
      newValue,
      oldValue === INITIAL_WATCHER_VALUE
        ? undefined
        : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE
          ? []
          : oldValue,
      onCleanup,
    ];
    oldValue = newValue;
    callWithAsyncErrorHandling(cb, instance, 'watcher callback', args);
    activeCleanups = prevCleanups;
    setActiveSub(prevSub);
    if (once) stop();
  };
  // A callback may write what its source reads; it then runs again in the same flush.
  if (cb) job.flags = SchedulerJobFlags.ALLOW_RECURSE;
  if (flush === 'sync') {
    effect.scheduler = job;
  } else if (flush === 'post') {
    effect.scheduler = () => queuePostFlushCb(job);
  } else {
    job.id = instance ? instance.uid * 2 : -1;
    effect.scheduler = () => queueJob(job);
  }

  const scope = activeEffectScope;
  const stop = (): void => {
    effect.stop();
    if (scope?.active) {
      const index = scope.effects.indexOf(effect);
      if (index >= 0) scope.effects.splice(index, 1);
    }
  };
  effect.onStop = () => {
    job.flags = (job.flags ?? 0) | SchedulerJobFlags.DISPOSED;
    runCleanups();
  };

  if (cb) {
    if (immediate) job(true);
    else oldValue = effect.run();
  } else if (flush === 'post') {
    queuePostFlushCb(() => job(true));
  } else {
    effect.run();
  }

  return Object.assign(stop, {
    stop,
    pause: () => effect.pause(),
    resume: () => effect.resume(),
  });
}

/**
 * Reads `value` through its proxies down to `depth`, so that a watcher tracks every nested value:
 * arrays and collections by iteration, plain objects by their enumerable keys. It survives cycles
 * and skips `markRaw()` values.
 */
function traverse(value: unknown, depth = Infinity, seen = new Map<unknown, number>()): unknown {
  if (depth <= 0 || !isObject(value) || value.__v_skip) return value;
  if ((seen.get(value) ?? 0) >= depth) return value;
  seen.set(value, depth--);
  if (isRef(value)) {
    traverse(value.value, depth, seen);
  } else if (Array.isArray(value) || value instanceof Map || value instanceof Set) {
    value.forEach((item: unknown) => traverse(item, depth, seen));
  } else if (Object.prototype.toString.call(value) === '[object Object]') {
    for (const key in value) traverse(value[key], depth, seen);
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) traverse(value[key], depth, seen);
    }
  }
  return value;
}
