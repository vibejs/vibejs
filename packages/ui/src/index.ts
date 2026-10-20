export { isVibeError, VibeError } from '@vibejs-org/errors';
export type {
  Component,
  ComponentEmits,
  ComponentExposed,
  ComponentProps,
  ComponentSlots,
  EmitFn,
  EmitsToProps,
  Handle,
  ModelRef,
  SetupContext,
  Slot,
  Slots,
  TemplateRef,
} from './component.ts';
export type {
  ClassValue,
  CSSProperties,
  HTMLAttributes,
  IntrinsicElementAttributes,
  ReservedProps,
  StyleValue,
} from './dom-types.ts';
export { computed } from './reactivity/computed.ts';
export type { ComputedRef, WritableComputedRef } from './reactivity/computed.ts';
export { effectScope, getCurrentScope, onScopeDispose } from './reactivity/effectScope.ts';
export type { EffectScope } from './reactivity/effectScope.ts';
export { isReactive, isReadonly, isRef, isShallow, toRaw } from './reactivity/dep.ts';
export {
  isProxy,
  markRaw,
  reactive,
  readonly,
  shallowReactive,
  shallowReadonly,
} from './reactivity/reactive.ts';
export type {
  DeepReadonly,
  Raw,
  Reactive,
  ShallowReactive,
  UnwrapNestedRefs,
} from './reactivity/reactive.ts';
export { ref, shallowRef, toRef, toRefs, toValue, triggerRef, unref } from './reactivity/ref.ts';
export type {
  MaybeRef,
  MaybeRefOrGetter,
  Ref,
  ShallowRef,
  ShallowUnwrapRef,
  ToRef,
  ToRefs,
  UnwrapRef,
} from './reactivity/ref.ts';
export { createApp, useId } from './runtime/app.ts';
export { useAsync } from './runtime/async.ts';
export type { App, AppConfig, ComponentHandle, Plugin } from './runtime/app.ts';
export { hasInjectionContext, inject, provide } from './runtime/inject.ts';
export type { InjectionKey } from './runtime/inject.ts';
export {
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onErrorCaptured,
  onMounted,
  onUnmounted,
  onUpdated,
} from './runtime/lifecycle.ts';
export { useAttrs } from './runtime/props.ts';
export { nextTick } from './runtime/scheduler.ts';
export { useSlots } from './runtime/slots.ts';
export { useTemplateRef } from './runtime/templateRef.ts';
export {
  onWatcherCleanup,
  watch,
  watchEffect,
  watchPostEffect,
  watchSyncEffect,
} from './runtime/watch.ts';
export type {
  OnCleanup,
  WatchCallback,
  WatchHandle,
  WatchOptions,
  WatchSource,
  WatchStopHandle,
} from './runtime/watch.ts';
