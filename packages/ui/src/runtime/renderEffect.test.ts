import { isVibeError } from '@vibejs-org/errors';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { computed } from '../reactivity/computed.ts';
import { effectScope } from '../reactivity/effectScope.ts';
import { ref } from '../reactivity/ref.ts';
import type { ComponentDef } from '../internal.ts';
import { createApp } from './app.ts';
import { createComponent } from './component.ts';
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

describe('an unhandled error of a render effect with a loc', () => {
  const fail = ref(false);
  const A: ComponentDef = {
    name: 'A',
    __file: 'src/A.vibe',
    render: () => {
      renderEffect(() => {
        if (fail.value) throw new Error('boom');
      }, 'src/A.vibe:12:5');
      return [];
    },
  };

  /** Mounts App > A, makes the effect throw and returns what `console.error` received. */
  async function logged(): Promise<unknown[]> {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fail.value = false;
    const app = createApp({ name: 'App', render: () => createComponent(A) });
    app.mount(document.createElement('div'));
    fail.value = true;
    await nextTick();
    app.unmount();
    return spy.mock.calls[0];
  }

  test('in dev, is logged with the loc and the component trace', async () => {
    const [error, details] = await logged();
    expect(isVibeError(error, 'VIBE5102')).toBe(true);
    expect(details).toBe('at src/A.vibe:12:5\nat <A> (src/A.vibe)\nat <App>');
  });

  test('in prod, is logged as the error alone', async () => {
    vi.stubGlobal('__DEV__', false);
    const [error, ...rest] = await logged();
    expect(error).toMatchObject({
      message: '[VIBE5102] https://vibejs.org/v0/errors/VIBE5102?info=render+effect',
    });
    expect(rest).toEqual([]);
  });
});

test.each([
  ['Loop', '<Loop>'],
  [undefined, '<Anonymous>'],
])('in dev, VIBE5101 of a render effect of %s names %s and its loc', async (name, component) => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const a = ref(0);
  const b = ref(0);
  const Loop: ComponentDef = {
    name,
    render: () => {
      renderEffect(() => {
        b.value = a.value + 1;
      }, 'src/Loop.vibe:3:1');
      renderEffect(() => {
        a.value = b.value + 1;
      }, 'src/Loop.vibe:4:1');
      return [];
    },
  };
  const app = createApp({ render: () => createComponent(Loop) });
  app.mount(document.createElement('div'));
  a.value = 10;
  await nextTick();
  app.unmount();
  const [[logged, details]] = spy.mock.calls;
  expect(isVibeError(logged, 'VIBE5102') && logged.cause).toMatchObject({
    code: 'VIBE5101',
    args: { component },
  });
  expect(details).toBe('at src/Loop.vibe:3:1');
});
