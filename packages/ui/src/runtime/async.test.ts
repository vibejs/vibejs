import { isVibeError } from '@vibejs-org/errors';
import { describe, expect, it } from 'vitest';
import { effectScope } from '../reactivity/effectScope.ts';
import { ref } from '../reactivity/ref.ts';
import { flushPromises, mountComposable } from '../testing/mount.ts';
import { useAsync } from './async.ts';
import { nextTick } from './scheduler.ts';

/** A `fn` for `useAsync()` whose runs are settled by the test, with the signal of each run. */
function deferredRuns<T>(read: () => unknown = () => undefined) {
  interface Run {
    signal: AbortSignal;
    input: unknown;
    resolve(value: T): void;
    reject(reason: unknown): void;
  }
  const runs: Run[] = [];
  const fn = (signal: AbortSignal): Promise<T> => {
    const input = read();
    return new Promise((resolve, reject) => runs.push({ signal, input, resolve, reject }));
  };
  return { runs, fn };
}

const abortError = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');

describe('useAsync', () => {
  it('lands only the latest result when a slow run is superseded by a fast one', async () => {
    const id = ref(1);
    const { runs, fn } = deferredRuns<string>(() => id.value);
    const { result } = mountComposable(() => useAsync(fn));
    id.value = 2;
    await nextTick();
    expect(runs.map((run) => run.input)).toEqual([1, 2]);
    expect(runs[0].signal.aborted).toBe(true);
    runs[1].resolve('fast');
    await flushPromises();
    expect(result.data.value).toBe('fast');
    expect(result.loading.value).toBe(false);
    runs[0].resolve('slow');
    await flushPromises();
    expect(result.data.value).toBe('fast');
    expect(result.loading.value).toBe(false);
  });

  it('reruns for a ref read before the first await, not for one read after it', async () => {
    const before = ref(0);
    const after = ref(0);
    let calls = 0;
    mountComposable(() =>
      useAsync(async () => {
        calls++;
        void before.value;
        await Promise.resolve();
        return after.value;
      }),
    );
    await flushPromises();
    expect(calls).toBe(1);
    after.value++;
    await flushPromises();
    expect(calls).toBe(1);
    before.value++;
    await flushPromises();
    expect(calls).toBe(2);
  });

  it('aborts the run in flight when the host unmounts, and ignores its settlement', async () => {
    const { runs, fn } = deferredRuns<string>();
    const host = mountComposable(() => useAsync(fn));
    host.unmount();
    expect(runs[0].signal.aborted).toBe(true);
    runs[0].resolve('late');
    await flushPromises();
    expect(host.result.data.value).toBeUndefined();
    expect(host.result.loading.value).toBe(true);
  });

  it('aborts the run in flight when its effect scope stops', async () => {
    const { runs, fn } = deferredRuns<string>();
    const scope = effectScope();
    const state = scope.run(() => useAsync(fn))!;
    scope.stop();
    expect(runs[0].signal.aborted).toBe(true);
    runs[0].reject(new Error('late'));
    await flushPromises();
    expect(state.data.value).toBeUndefined();
    expect(state.error.value).toBeUndefined();
    expect(state.loading.value).toBe(true);
  });

  it('leaves error undefined when an aborted run rejects with an AbortError', async () => {
    const id = ref(1);
    const { runs, fn } = deferredRuns<string>(() => id.value);
    const { result } = mountComposable(() => useAsync(fn));
    id.value = 2;
    await nextTick();
    runs[0].reject(abortError());
    await flushPromises();
    expect(result.error.value).toBeUndefined();
    expect(result.loading.value).toBe(true);
  });

  it('tracks loading, clears error on start and keeps data across runs and failures', async () => {
    const { runs, fn } = deferredRuns<string>();
    const { result } = mountComposable(() => useAsync(fn));
    expect(result.loading.value).toBe(true);
    expect(result.data.value).toBeUndefined();
    runs[0].resolve('first');
    await flushPromises();
    expect(result.loading.value).toBe(false);
    expect(result.data.value).toBe('first');

    const failure = new Error('boom');
    void result.refresh();
    await nextTick();
    expect(result.loading.value).toBe(true);
    expect(result.data.value).toBe('first');
    runs[1].reject(failure);
    await flushPromises();
    expect(result.error.value).toBe(failure);
    expect(result.data.value).toBe('first');
    expect(result.loading.value).toBe(false);

    void result.refresh();
    await nextTick();
    expect(result.error.value).toBeUndefined();
    expect(result.loading.value).toBe(true);
  });

  it('holds a synchronous throw of fn in error', async () => {
    const failure = new Error('sync');
    const { result } = mountComposable(() =>
      useAsync((): Promise<string> => {
        throw failure;
      }),
    );
    await flushPromises();
    expect(result.error.value).toBe(failure);
    expect(result.loading.value).toBe(false);
  });

  it('refresh() reruns fn and resolves once that run settles, even when it fails', async () => {
    const { runs, fn } = deferredRuns<string>();
    const { result } = mountComposable(() => useAsync(fn));
    runs[0].resolve('first');
    let refreshed = false;
    const done = result.refresh().then(() => (refreshed = true));
    await flushPromises();
    expect(runs).toHaveLength(2);
    expect(refreshed).toBe(false);
    runs[1].reject(new Error('boom'));
    await done;
    expect(refreshed).toBe(true);
  });

  it('refresh() resolves after a successful run has updated data', async () => {
    const { runs, fn } = deferredRuns<string>();
    const { result } = mountComposable(() => useAsync(fn));
    runs[0].resolve('first');
    const done = result.refresh();
    await nextTick();
    runs[1].resolve('second');
    await done;
    expect(result.data.value).toBe('second');
  });

  it('refresh() resolves when its run is superseded or the owner stops', async () => {
    const { runs, fn } = deferredRuns<string>();
    const host = mountComposable(() => useAsync(fn));
    const superseded = host.result.refresh();
    await nextTick();
    const next = host.result.refresh();
    await nextTick();
    await superseded;
    expect(runs[1].signal.aborted).toBe(true);
    const queued = host.result.refresh();
    host.unmount();
    await Promise.all([next, queued, host.result.refresh()]);
    expect(runs).toHaveLength(3);
  });

  it('throws VIBE7301 with no owner scope', () => {
    let error: unknown;
    try {
      useAsync(() => Promise.resolve(1));
    } catch (thrown) {
      error = thrown;
    }
    expect(isVibeError(error, 'VIBE7301')).toBe(true);
  });
});
