// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';
import { computed } from './computed.ts';
import { endBatch, ReactiveEffect, startBatch } from './core.ts';
import { ref } from './ref.ts';
import { ReactiveFlags } from './system.ts';

describe('ReactiveEffect', () => {
  test('with a scheduler, a change calls the scheduler, which decides when to run', () => {
    const a = ref(0);
    const runs = vi.fn<() => number>(() => a.value);
    const effect = new ReactiveEffect(runs);
    const scheduler = vi.fn<(value?: unknown) => void>();
    effect.scheduler = scheduler;
    effect.run();

    a.value = 1;
    expect(scheduler).toHaveBeenCalledTimes(1);
    expect(runs).toHaveBeenCalledTimes(1);
    expect(effect.dirty).toBe(true);
    effect.run();
    expect(runs).toHaveBeenCalledTimes(2);
    expect(effect.dirty).toBe(false);
  });

  test('dirty re-checks computed deps: an equal recompute leaves the effect clean', () => {
    const a = ref(1);
    const parity = computed(() => a.value % 2);
    const effect = new ReactiveEffect(() => parity.value);
    const scheduler = vi.fn<(value?: unknown) => void>();
    effect.scheduler = scheduler;
    effect.run();

    a.value = 3;
    expect(scheduler).toHaveBeenCalledTimes(1);
    expect(effect.dirty).toBe(false);
    // Clean again, so the next change notifies again.
    a.value = 4;
    expect(scheduler).toHaveBeenCalledTimes(2);
    expect(effect.dirty).toBe(true);
  });

  test('a stopped effect runs its function untracked and is never notified', () => {
    const a = ref(0);
    const runs = vi.fn<() => number>(() => a.value);
    const effect = new ReactiveEffect(runs);
    effect.run();
    effect.stop();
    expect(effect.flags).toBe(ReactiveFlags.None);

    expect(effect.run()).toBe(0);
    a.value = 1;
    expect(runs).toHaveBeenCalledTimes(2);
    expect(effect.deps).toBeUndefined();
  });

  test('pause() keeps a stopped effect stopped', () => {
    const effect = new ReactiveEffect(() => {});
    effect.stop();
    effect.pause();
    effect.resume();
    expect(effect.flags).toBe(ReactiveFlags.None);
  });

  test('an effect that throws during a flush does not block the effects queued after it', () => {
    const a = ref(0);
    const second = vi.fn<() => number>(() => a.value);
    new ReactiveEffect(() => {
      if (a.value === 1) throw new Error('boom');
    }).run();
    new ReactiveEffect(second).run();

    expect(() => (a.value = 1)).toThrow('boom');
    expect(second).toHaveBeenCalledTimes(1);
    // The skipped effect is still subscribed and runs on the next change.
    a.value = 2;
    expect(second).toHaveBeenCalledTimes(2);
  });

  test('nested batches flush once, when the outermost ends', () => {
    const a = ref(0);
    const runs = vi.fn<() => number>(() => a.value);
    new ReactiveEffect(runs).run();
    startBatch();
    startBatch();
    a.value = 1;
    endBatch();
    expect(runs).toHaveBeenCalledTimes(1);
    endBatch();
    expect(runs).toHaveBeenCalledTimes(2);
  });
});
