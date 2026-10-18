import { afterEach, expect, test, vi } from 'vitest';
import { vibeError } from './errors.gen.ts';
import { logError, warn } from './warn.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

test('warn() prints the message in dev', () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vibeError('VIBE5006', { api: 'onScopeDispose' });
  warn(error);
  expect(spy).toHaveBeenCalledWith(error.message);
  expect(error.message).toBe(
    [
      '[VIBE5006] onScopeDispose() was called with no active effect scope or watcher, so its cleanup will never run.',
      "  Fix: Call onScopeDispose() synchronously inside `effectScope().run()`, a component's setup or a watcher.",
      '  Fix: Pass `true` as the second argument of onScopeDispose() when running without an owner is expected.',
      '  Docs: https://vibejs.org/v0/errors/VIBE5006',
    ].join('\n'),
  );
});

test('warn() prints nothing in prod, where a message is the code and the docs URL', () => {
  vi.stubGlobal('__DEV__', false);
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vibeError('VIBE5005');
  warn(error);
  expect(spy).not.toHaveBeenCalled();
  expect(error.message).toBe('[VIBE5005] https://vibejs.org/v0/errors/VIBE5005');
});

test('logError() prints the error in dev and in prod', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new Error('navigation failed');
  logError(error);
  vi.stubGlobal('__DEV__', false);
  logError(error);
  expect(spy.mock.calls).toEqual([[error], [error]]);
});
