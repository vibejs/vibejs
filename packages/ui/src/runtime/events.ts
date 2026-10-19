// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/src/directives/vOn.ts (MIT)
import { hyphenate } from '../shared.ts';
import { callWithAsyncErrorHandling } from './errorHandling.ts';

/**
 * Adds a listener to `el`, directly (no delegation) and for the element's lifetime. A throw or a
 * rejected promise of `fn` goes to the error handler as `'native event handler'`. Codegen passes
 * the `once`, `passive` and `capture` modifiers as `o`, and an inline expression as a function
 * that evaluates it when the event fires, so the listener never needs rebinding.
 */
export function on(
  el: EventTarget,
  ev: string,
  fn: (e: Event) => unknown,
  o?: AddEventListenerOptions,
): void {
  el.addEventListener(ev, (e) => callWithAsyncErrorHandling(fn, 'native event handler', [e]), o);
}

const systemModifiers = ['ctrl', 'shift', 'alt', 'meta'];

/** A guard returns true to skip the handler. */
const guards: Partial<Record<string, (e: Event, mods: string[]) => unknown>> = {
  stop: (e) => e.stopPropagation(),
  prevent: (e) => e.preventDefault(),
  self: (e) => e.target !== e.currentTarget,
  ctrl: (e) => !Reflect.get(e, 'ctrlKey'),
  shift: (e) => !Reflect.get(e, 'shiftKey'),
  alt: (e) => !Reflect.get(e, 'altKey'),
  meta: (e) => !Reflect.get(e, 'metaKey'),
  left: (e) => 'button' in e && e.button !== 0,
  middle: (e) => 'button' in e && e.button !== 1,
  right: (e) => 'button' in e && e.button !== 2,
  exact: (e, mods) => systemModifiers.some((m) => Reflect.get(e, `${m}Key`) && !mods.includes(m)),
};

/**
 * Wraps a handler with the `v-on` modifiers `stop`, `prevent`, `self`, `ctrl`, `shift`, `alt`,
 * `meta`, `left`, `middle`, `right` and `exact`, checked in the order given. Unknown modifiers
 * are ignored.
 */
export function withModifiers<F extends (e: Event, ...a: never[]) => unknown>(
  fn: F,
  mods: string[],
): F {
  const wrapped = (e: Event, ...args: never[]): unknown => {
    for (const mod of mods) if (guards[mod]?.(e, mods)) return undefined;
    return fn(e, ...args);
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the wrapper takes F's arguments
  return wrapped as F;
}

/** Key aliases of `v-on` key modifiers. */
const keyNames: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  up: 'arrow-up',
  left: 'arrow-left',
  right: 'arrow-right',
  down: 'arrow-down',
  delete: 'backspace',
};

/**
 * Wraps a keyboard handler so that it runs only for the given keys: hyphenated `event.key`
 * names (`'enter'`, `'page-down'`) or the aliases `esc`, `space`, `up`, `down`, `left`, `right`
 * and `delete`.
 */
export function withKeys<F extends (e: KeyboardEvent) => unknown>(fn: F, keys: string[]): F {
  const wrapped = (e: KeyboardEvent): unknown => {
    if (!('key' in e)) return undefined;
    const key = hyphenate(e.key);
    return keys.some((k) => k === key || keyNames[k] === key) ? fn(e) : undefined;
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the wrapper takes F's arguments
  return wrapped as F;
}
