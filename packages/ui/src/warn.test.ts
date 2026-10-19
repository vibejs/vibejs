import { afterEach, describe, expect, test, vi } from 'vitest';
import { vibeError } from './errors.gen.ts';
import type { ComponentDef } from './internal.ts';
import { createApp } from './runtime/app.ts';
import { createComponent } from './runtime/component.ts';
import { inject } from './runtime/inject.ts';
import { formatTrace, logError, warn } from './warn.ts';

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

test('logError() prints the error in dev and in prod, followed by the details', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new Error('navigation failed');
  logError(error);
  logError(error, 'at <App>');
  vi.stubGlobal('__DEV__', false);
  logError(error);
  expect(spy.mock.calls).toEqual([[error], [error, 'at <App>'], [error]]);
});

describe('the component trace', () => {
  const Child: ComponentDef = {
    name: 'Child',
    __file: 'src/Child.vibe',
    setup: () => void inject('missing'),
    render: () => [],
  };
  const Root: ComponentDef = { __file: 'src/App.vibe', render: () => createComponent(Child) };
  const trace = 'at <Child> (src/Child.vibe)\nat <Anonymous> (src/App.vibe)';

  test('warnHandler receives the trace from the component to the root, with files', () => {
    const handler = vi.fn<(...args: unknown[]) => void>();
    const app = createApp(Root);
    app.config.warnHandler = handler;
    app.mount(document.createElement('div'));
    const [[msg, instance, received]] = handler.mock.calls;
    expect(msg).toMatch(/^\[VIBE5206\]/);
    expect(received).toBe(trace);
    expect(instance).toMatchObject({ name: 'Child', file: 'src/Child.vibe' });
  });

  test('without a handler, the printed warning ends with the trace', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createApp(Root).mount(document.createElement('div'));
    const [[printed]] = spy.mock.calls;
    expect(printed).toBe(`${vibeError('VIBE5206', { key: 'missing' }).message}\n${trace}`);
  });

  test('formatTrace() of no instance is empty', () => {
    expect(formatTrace(null)).toBe('');
  });
});
