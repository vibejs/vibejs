import * as errors from '@usevibejs/errors';
import { describe, expect, it, vi } from 'vitest';
import * as ui from './index.ts';
import { isVibeError, VibeError } from './index.ts';

describe('@usevibejs/ui', () => {
  it('re-exports VibeError and isVibeError from @usevibejs/errors', () => {
    expect(VibeError).toBe(errors.VibeError);
    expect(isVibeError).toBe(errors.isVibeError);
  });

  it('exports exactly the public runtime API', () => {
    expect(new Set(Object.keys(ui))).toEqual(
      new Set([
        'VibeError',
        'isVibeError',
        'computed',
        'effectScope',
        'getCurrentScope',
        'onScopeDispose',
        'isReactive',
        'isReadonly',
        'isRef',
        'isShallow',
        'toRaw',
        'isProxy',
        'markRaw',
        'reactive',
        'readonly',
        'shallowReactive',
        'shallowReadonly',
        'ref',
        'shallowRef',
        'toRef',
        'toRefs',
        'toValue',
        'triggerRef',
        'unref',
        'createApp',
        'useId',
        'useAsync',
        'hasInjectionContext',
        'inject',
        'provide',
        'onBeforeMount',
        'onBeforeUnmount',
        'onBeforeUpdate',
        'onErrorCaptured',
        'onMounted',
        'onUnmounted',
        'onUpdated',
        'useAttrs',
        'nextTick',
        'useSlots',
        'useTemplateRef',
        'onWatcherCleanup',
        'watch',
        'watchEffect',
        'watchPostEffect',
        'watchSyncEffect',
      ]),
    );
  });

  it('stubs __DEV__ to false for one test', () => {
    expect(__DEV__).toBe(true);
    vi.stubGlobal('__DEV__', false);
    expect(__DEV__).toBe(false);
  });

  it('resets __DEV__ to true after a stub', () => {
    expect(__DEV__).toBe(true);
  });
});
