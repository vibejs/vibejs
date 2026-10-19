import { isVibeError } from '@vibejs-org/errors';
import { afterEach, expect, test, vi } from 'vitest';
import { computed } from '../reactivity/computed.ts';
import { effectScope } from '../reactivity/effectScope.ts';
import { ref } from '../reactivity/ref.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

test('runs synchronously once, then once per flush', async () => {
  const count = ref(0);
  const runs: number[] = [];
  renderEffect(() => runs.push(count.value), 'src/A.vibe:1:1');
  expect(runs).toEqual([0]);
  count.value++;
  count.value++;
  expect(runs).toEqual([0]);
  await nextTick();
  expect(runs).toEqual([0, 2]);
});

test('skips the run when a computed dependency did not change', async () => {
  const count = ref(1);
  const parity = computed(() => count.value % 2);
  const runs: number[] = [];
  renderEffect(() => runs.push(parity.value));
  count.value = 3;
  await nextTick();
  expect(runs).toEqual([1]);
});

test('stops with its scope, and a queued run of a stopped effect never happens', async () => {
  const count = ref(0);
  const runs: number[] = [];
  const scope = effectScope();
  scope.run(() => renderEffect(() => runs.push(count.value)));
  count.value++;
  scope.stop();
  await nextTick();
  count.value++;
  await nextTick();
  expect(runs).toEqual([0]);
});

test('reports a throw as a render effect error and the flush goes on', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fail = ref(false);
  const err = new Error('boom');
  const runs: boolean[] = [];
  renderEffect(() => {
    if (fail.value) throw err;
  });
  renderEffect(() => runs.push(fail.value));
  fail.value = true;
  await nextTick();
  expect(runs).toEqual([false, true]);
  const [[logged]] = errors.mock.calls;
  expect(isVibeError(logged, 'VIBE5102') && [logged.cause, logged.args.info]).toEqual([
    err,
    'render effect',
  ]);
});
