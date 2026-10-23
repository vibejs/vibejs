// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/__tests__/directives/vOn.spec.ts (MIT)
//
// The vOn cases attach with `on` instead of patchEvent. Wrappers are not cached per handler (each
// `on` call site wraps once), and a null handler is a type error rather than passed through.
import { isVibeError } from '@usevibejs/errors';
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { on, withKeys, withModifiers } from './events.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Dispatches an event with the given extra properties (`key`, `ctrlKey`, `button`, …). */
function triggerEvent(target: Element, event: string, props: Record<string, unknown> = {}) {
  const e = new Event(event, { bubbles: true, cancelable: true });
  Object.assign(e, event === 'click' ? { button: 0, ...props } : props);
  target.dispatchEvent(e);
  return e;
}

/** The [cause, info] pairs that reached the error handler. */
function spyErrors(): () => [unknown, unknown][] {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () =>
    spy.mock.calls.map(([logged]) =>
      isVibeError(logged, 'VIBE5102') ? [logged.cause, logged.args.info] : [logged, undefined],
    );
}

describe('on', () => {
  test('adds the listener directly with the given options', () => {
    const el = document.createElement('div');
    const add = vi.spyOn(el, 'addEventListener');
    const fn = vi.fn<(e: Event) => void>();
    const options = { once: true, passive: true, capture: true };
    on(el, 'click', fn, options);
    expect(add).toHaveBeenCalledWith('click', expect.any(Function), options);
    triggerEvent(el, 'click');
    triggerEvent(el, 'click');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBeInstanceOf(Event);
  });

  test('reports a throwing handler as a native event handler error', () => {
    const reported = spyErrors();
    const el = document.createElement('div');
    const err = new Error('boom');
    on(el, 'click', () => {
      throw err;
    });
    triggerEvent(el, 'click');
    expect(reported()).toEqual([[err, 'native event handler']]);
  });

  test('reports a rejected promise as a native event handler error', async () => {
    const reported = spyErrors();
    const el = document.createElement('div');
    const err = new Error('later');
    on(el, 'click', () => Promise.reject(err));
    triggerEvent(el, 'click');
    await new Promise((r) => setTimeout(r));
    expect(reported()).toEqual([[err, 'native event handler']]);
  });
});

describe('runtime-dom: v-on directive', () => {
  test('it should support "stop" and "prevent"', () => {
    const parent = document.createElement('div');
    const child = document.createElement('input');
    parent.appendChild(child);
    const childNextValue = withModifiers(vi.fn<(e: Event) => void>(), ['prevent', 'stop']);
    on(child, 'click', childNextValue);
    const parentNextValue = vi.fn<(e: Event) => void>();
    on(parent, 'click', parentNextValue);
    expect(triggerEvent(child, 'click').defaultPrevented).toBe(true);
    expect(parentNextValue).not.toBeCalled();
  });

  test('it should support "self"', () => {
    const parent = document.createElement('div');
    const child = document.createElement('input');
    parent.appendChild(child);
    const fn = vi.fn<(e: Event) => void>();
    const handler = withModifiers(fn, ['self']);
    on(parent, 'click', handler);
    triggerEvent(child, 'click');
    expect(fn).not.toBeCalled();
    triggerEvent(parent, 'click');
    expect(fn).toBeCalledTimes(1);
  });

  test('it should support key modifiers and system modifiers', () => {
    const keyNames = ['ctrl', 'shift', 'meta', 'alt'] as const;

    for (const keyName of keyNames) {
      const el = document.createElement('div');
      const fn = vi.fn<(e: Event) => void>();
      // <div @keyup[keyName].esc="test"/>
      const nextValue = withKeys(withModifiers(fn, [keyName]), ['esc', 'arrow-left']);
      on(el, 'keyup', nextValue);

      triggerEvent(el, 'keyup', { key: 'a' });
      expect(fn).not.toBeCalled();

      triggerEvent(el, 'keyup', { [`${keyName}Key`]: false, key: 'esc' });
      expect(fn).not.toBeCalled();

      triggerEvent(el, 'keyup', { [`${keyName}Key`]: true, key: 'Escape' });
      expect(fn).toBeCalledTimes(1);

      triggerEvent(el, 'keyup', { [`${keyName}Key`]: true, key: 'ArrowLeft' });
      expect(fn).toBeCalledTimes(2);
    }
  });

  test('it should support "exact" modifier', () => {
    const el = document.createElement('div');
    // Case 1: <div @keyup.exact="test"/>
    const fn1 = vi.fn<(e: Event) => void>();
    const next1 = withModifiers(fn1, ['exact']);
    on(el, 'keyup', next1);
    triggerEvent(el, 'keyup');
    expect(fn1.mock.calls.length).toBe(1);
    triggerEvent(el, 'keyup', { ctrlKey: true });
    expect(fn1.mock.calls.length).toBe(1);
    // Case 2: <div @keyup.ctrl.a.exact="test"/>
    const fn2 = vi.fn<(e: Event) => void>();
    const next2 = withKeys(withModifiers(fn2, ['ctrl', 'exact']), ['a']);
    on(el, 'keyup', next2);
    triggerEvent(el, 'keyup', { key: 'a' });
    expect(fn2).not.toBeCalled();
    triggerEvent(el, 'keyup', { key: 'a', ctrlKey: true });
    expect(fn2.mock.calls.length).toBe(1);
    // should not trigger if has other system modifiers
    triggerEvent(el, 'keyup', { key: 'a', ctrlKey: true, altKey: true });
    expect(fn2.mock.calls.length).toBe(1);
  });

  it('should support mouse modifiers', () => {
    const buttons = ['left', 'middle', 'right'] as const;
    const buttonCodes = { left: 0, middle: 1, right: 2 };
    for (const button of buttons) {
      const el = document.createElement('div');
      const fn = vi.fn<(e: Event) => void>();
      const handler = withModifiers(fn, [button]);
      on(el, 'mousedown', handler);
      for (const other of buttons.filter((b) => b !== button)) {
        triggerEvent(el, 'mousedown', { button: buttonCodes[other] });
      }
      expect(fn).not.toBeCalled();
      triggerEvent(el, 'mousedown', { button: buttonCodes[button] });
      expect(fn).toBeCalled();
      // A mouse modifier does not filter an event without a button.
      triggerEvent(el, 'mousedown');
      expect(fn).toBeCalledTimes(2);
    }
  });

  it('should handle multiple arguments when using modifiers', () => {
    const el = document.createElement('div');
    const fn = vi.fn<(e: Event, a: string, b: boolean) => void>();
    const handler = withModifiers(fn, ['ctrl']);
    const event = triggerEvent(el, 'click', { ctrlKey: true });
    handler(event, 'value', true);
    expect(fn).toBeCalledWith(event, 'value', true);
  });

  it('wraps a listener separately for different keys and modifiers', () => {
    const el1 = document.createElement('button');
    const el2 = document.createElement('button');
    const fn = vi.fn<(e: Event) => void>();
    const handler1 = withKeys(fn, ['a']);
    const handler2 = withKeys(fn, ['b']);
    expect(handler1 === handler2).toBe(false);
    on(el1, 'keyup', handler1);
    on(el2, 'keyup', handler2);
    triggerEvent(el1, 'keyup', { key: 'a' });
    triggerEvent(el2, 'keyup', { key: 'b' });
    expect(fn).toBeCalledTimes(2);
  });

  it('ignores an event without a key and an unknown modifier', () => {
    const el = document.createElement('div');
    const fn = vi.fn<(e: Event) => void>();
    on(el, 'keyup', withKeys(fn, ['a']));
    on(el, 'click', withModifiers(fn, ['unknown']));
    triggerEvent(el, 'keyup');
    expect(fn).not.toBeCalled();
    triggerEvent(el, 'click');
    expect(fn).toBeCalledTimes(1);
  });
});
