import { isVibeError } from '@vibejs-org/errors';
import { expect, it, vi } from 'vitest';

async function importTooling(): Promise<unknown> {
  vi.resetModules();
  return import('./tooling.ts').then(
    () => undefined,
    (error: unknown) => error,
  );
}

it('throws VIBE5900 when the module runs', async () => {
  const error = await importTooling();
  expect(isVibeError(error, 'VIBE5900')).toBe(true);
  expect(error).toHaveProperty(
    'message',
    expect.stringMatching(/^\[VIBE5900\] @vibejs-org\/ui\/tooling only declares types/),
  );
});

it('throws the short prod message without __DEV__', async () => {
  vi.stubGlobal('__DEV__', false);
  const error = await importTooling();
  expect(isVibeError(error, 'VIBE5900')).toBe(true);
  expect(error).toHaveProperty('message', '[VIBE5900] https://vibejs.org/v0/errors/VIBE5900');
});
