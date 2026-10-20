// @vitest-environment jsdom
import { createApp, nextTick } from '@vibejs-org/ui';
import { flushPromises } from '@vibejs-org/ui/testing';
import { expect, it, vi } from 'vitest';
import { flagsPlugin, useFlag } from './flags.ts';

const Root = { render: () => document.createTextNode('') };

it('turns on the flags that the server reports', async () => {
  const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
    Response.json({ beta: true, old: false }),
  );
  const app = createApp(Root).use(flagsPlugin({ baseUrl: '/v1', fetch }));
  const [beta, old, other] = app.runWithContext(() => ['beta', 'old', 'other'].map(useFlag));
  expect(beta.value).toBe(false);
  await flushPromises();
  expect([beta.value, old.value, other.value]).toEqual([true, false, false]);
  expect(fetch.mock.calls[0]?.[0].url).toMatch(/\/v1\/flags$/);
});

it('keeps every flag off when the request fails', async () => {
  const app = createApp(Root).use(
    flagsPlugin({ fetch: async () => new Response('', { status: 500 }) }),
  );
  const beta = app.runWithContext(() => useFlag('beta'));
  await flushPromises();
  await nextTick();
  expect(beta.value).toBe(false);
});

it('is off without the plugin', () => {
  const beta = createApp(Root).runWithContext(() => useFlag('beta'));
  expect(beta.value).toBe(false);
});
