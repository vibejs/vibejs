// @vitest-environment node
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/__tests__/errorHandling.spec.ts (MIT)
//
// The watcher cases run without a component: the error reaches handleError, which logs it as
// VIBE5102 with the original error as its cause, instead of an onErrorCaptured hook. The cases
// built on components, onErrorCaptured and app.config.errorHandler move to RR-5.
import { isVibeError, type VibeError } from '@vibejs-org/errors';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { computed } from '../reactivity/computed.ts';
import { ref } from '../reactivity/ref.ts';
import { callWithAsyncErrorHandling, callWithErrorHandling, handleError } from './errorHandling.ts';
import { nextTick } from './scheduler.ts';
import { watch, watchEffect } from './watch.ts';

/** A logged VIBE5102. */
function unhandled(logged: unknown): VibeError {
  if (!isVibeError(logged, 'VIBE5102')) throw new TypeError('expected a VIBE5102');
  return logged;
}

/** The errors that reached `handleError`, as `[cause, info]` pairs. */
function spyErrors(): () => [unknown, unknown][] {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () =>
    spy.mock.calls.map(([logged]) => {
      const error = unhandled(logged);
      return [error.cause, error.args.info];
    });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('error handling', () => {
  test('in effect', () => {
    const reported = spyErrors();
    const err = new Error('foo');
    watchEffect(() => {
      throw err;
    });
    expect(reported()).toEqual([[err, 'watcher callback']]);
  });

  test('in watch getter', () => {
    const reported = spyErrors();
    const err = new Error('foo');
    watch(
      () => {
        throw err;
      },
      () => {},
    );
    expect(reported()).toEqual([[err, 'watcher getter']]);
  });

  test('in watch callback', async () => {
    const reported = spyErrors();
    const err = new Error('foo');
    const count = ref(0);
    watch(
      () => count.value,
      () => {
        throw err;
      },
    );

    count.value++;
    await nextTick();
    expect(reported()).toEqual([[err, 'watcher callback']]);
  });

  test('in effect cleanup', async () => {
    const reported = spyErrors();
    const err = new Error('foo');
    const count = ref(0);
    watchEffect((onCleanup) => {
      void count.value;
      onCleanup(() => {
        throw err;
      });
    });

    count.value++;
    await nextTick();
    expect(reported()).toEqual([[err, 'watcher cleanup']]);
  });

  //# 3127
  test('handle error in watch & watchEffect', async () => {
    const reported = spyErrors();
    const error1 = new Error('error1');
    const error2 = new Error('error2');
    const error3 = new Error('error3');
    const error4 = new Error('error4');

    const count = ref(1);
    watch(
      count,
      () => {
        throw error1;
      },
      { immediate: true },
    );
    watch(
      count,
      async () => {
        throw error2;
      },
      { immediate: true },
    );
    watchEffect(() => {
      throw error3;
    });
    // oxlint-disable-next-line typescript/no-misused-promises -- ported as upstream wrote it
    watchEffect(async () => {
      throw error4;
    });

    await nextTick();
    expect(reported()).toEqual([
      [error1, 'watcher callback'],
      [error3, 'watcher callback'],
      [error2, 'watcher callback'],
      [error4, 'watcher callback'],
    ]);
  });

  // #11624
  test('in computed that is used as key for watch', async () => {
    const reported = spyErrors();
    const err = new Error('foo');
    const trigger = ref(false);
    const foo = computed(() => {
      if (trigger.value) throw err;
      return 1;
    });
    watch(foo, () => {});

    trigger.value = true;
    await nextTick();
    expect(reported()).toEqual([[err, 'scheduler flush']]);
  });
});

describe('handleError', () => {
  test('logs the error once as VIBE5102 naming the info, with the error as its cause', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    handleError(err, null, 'watcher getter');
    expect(spy).toHaveBeenCalledTimes(1);
    const [[logged]] = spy.mock.calls;
    expect(logged).toMatchObject({ code: 'VIBE5102', cause: err });
    expect(unhandled(logged).message).toMatch(
      /^\[VIBE5102\] An error thrown in a watcher getter was not handled\.\n/,
    );
  });

  test('in prod, the message is the code and the docs URL with the info', () => {
    vi.stubGlobal('__DEV__', false);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    handleError(err, null, 'scheduler flush');
    const [[logged]] = spy.mock.calls;
    expect(logged).toMatchObject({
      code: 'VIBE5102',
      cause: err,
      message: '[VIBE5102] https://vibejs.org/v0/errors/VIBE5102?info=scheduler+flush',
    });
  });
});

describe('callWithErrorHandling', () => {
  test('returns the result, or undefined after reporting what fn throws', () => {
    const reported = spyErrors();
    expect(
      callWithErrorHandling((a: number, b: number) => a + b, null, 'watcher getter', [1, 2]),
    ).toBe(3);
    expect(callWithErrorHandling(() => 'no args', null, 'watcher getter')).toBe('no args');
    const err = new Error('thrown');
    expect(
      callWithErrorHandling(
        () => {
          throw err;
        },
        null,
        'watcher cleanup',
      ),
    ).toBeUndefined();
    expect(reported()).toEqual([[err, 'watcher cleanup']]);
  });

  test('callWithAsyncErrorHandling reports a rejected promise and returns it', async () => {
    const reported = spyErrors();
    const err = new Error('rejected');
    const promise = callWithAsyncErrorHandling(
      async () => {
        throw err;
      },
      null,
      'watcher callback',
    );
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toBe(err);
    expect(reported()).toEqual([[err, 'watcher callback']]);
    expect(callWithAsyncErrorHandling(() => 1, null, 'watcher callback')).toBe(1);
  });
});
