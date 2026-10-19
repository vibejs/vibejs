// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/src/directives/vModel.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/src/directives/vShow.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/shared/src/looseEqual.ts (MIT)
//
// The model kind is chosen at compile time from the element and its static `type`.
import { toRaw } from '../reactivity/dep.ts';
import { isObject, looseToNumber, toText } from '../shared.ts';
import { getValue, shown } from './dom.ts';
import { on } from './events.ts';
import { renderEffect } from './renderEffect.ts';
import { queuePostFlushCb } from './scheduler.ts';

/** Equality of model values: dates by time, arrays and plain objects by content, others as text. */
function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (typeof a === 'symbol' || typeof b === 'symbol') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => looseEqual(item, b[i]))
    );
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && looseEqual(a[key], b[key]))
    );
  }
  return String(a) === String(b);
}

const looseIndexOf = (array: unknown[], value: unknown): number =>
  array.findIndex((item) => looseEqual(item, value));

/** Inputs in an IME composition: their value is not assigned until it ends. */
const composing = new WeakSet<EventTarget>();

/**
 * Hides `el` with `display: none` while `get()` is falsy and restores its own display (or the
 * display of its `:style` binding) when shown. Codegen emits it for `v-show` on an element.
 */
export function applyVShow(el: HTMLElement, get: () => unknown): void {
  const state = { display: el.style.display === 'none' ? '' : el.style.display, hidden: false };
  shown.set(el, state);
  renderEffect(() => {
    state.hidden = !get();
    el.style.display = state.hidden ? 'none' : state.display;
  });
}

/**
 * `v-model` on a text-like `<input>` or a `<textarea>`: assigns the value on `input` (`change`
 * with `lazy`), cast by `trim` and `number` (also for `type="number"`), and not while an IME
 * composition is open. Writes the model to the element only when the element does not already
 * show it.
 */
export function applyTextModel(
  el: HTMLInputElement | HTMLTextAreaElement,
  get: () => unknown,
  set: (v: unknown) => void,
  mods: { lazy?: boolean; number?: boolean; trim?: boolean } = {},
): void {
  const { lazy, trim } = mods;
  const number = mods.number || el.type === 'number';
  const cast = (value: string): unknown => {
    const text = trim ? value.trim() : value;
    return number ? looseToNumber(text) : text;
  };
  on(el, lazy ? 'change' : 'input', () => {
    if (!composing.has(el)) set(cast(el.value));
  });
  if (trim || number) {
    on(el, 'change', () => {
      el.value = toText(cast(el.value));
    });
  }
  if (!lazy) {
    const end = () => {
      if (composing.delete(el)) el.dispatchEvent(new Event('input'));
    };
    on(el, 'compositionstart', () => composing.add(el));
    on(el, 'compositionend', end);
    // Some browsers fire `change` instead of `compositionend` when the focus moves.
    on(el, 'change', end);
  }
  renderEffect(() => {
    const value = get();
    // Unresolved text of a composition stays.
    if (composing.has(el)) return;
    const shownValue = number && !/^0\d/.test(el.value) ? looseToNumber(el.value) : el.value;
    const next = value == null ? '' : value;
    if (shownValue === next) return;
    const root = el.getRootNode();
    const focused =
      (root instanceof Document || root instanceof ShadowRoot) && root.activeElement === el;
    // A focused, trimmed input keeps the spaces being typed.
    if (focused && trim && el.value.trim() === next) return;
    el.value = toText(next);
  });
}

/**
 * `v-model` on a checkbox. A boolean model takes `values.true()` / `values.false()` (the
 * `true-value` and `false-value` bindings, default `true` and `false`); an array or `Set` model
 * holds the values (`getValue`) of the checked boxes. Codegen emits it after the element's
 * `value` binding.
 */
export function applyCheckboxModel(
  el: HTMLInputElement,
  get: () => unknown,
  set: (v: unknown) => void,
  values: { true?: () => unknown; false?: () => unknown } = {},
): void {
  let model: unknown;
  const valueOf = (checked: boolean): unknown => {
    const fn = checked ? values.true : values.false;
    return fn ? fn() : checked;
  };
  on(el, 'change', () => {
    const value = getValue(el);
    const checked = el.checked;
    if (Array.isArray(model)) {
      const index = looseIndexOf(model, value);
      if (checked && index < 0) set([...model, value]);
      else if (!checked && index >= 0) set(model.filter((_, i) => i !== index));
    } else if (model instanceof Set) {
      const copy = new Set(model);
      if (checked) copy.add(value);
      else copy.delete(value);
      set(copy);
    } else {
      set(valueOf(checked));
    }
  });
  renderEffect(() => {
    model = get();
    const checked = Array.isArray(model)
      ? looseIndexOf(model, getValue(el)) >= 0
      : model instanceof Set
        ? model.has(getValue(el))
        : looseEqual(model, valueOf(true));
    if (el.checked !== checked) el.checked = checked;
  });
}

/** `v-model` on a radio button: checked while the model equals its value (`getValue`). */
export function applyRadioModel(
  el: HTMLInputElement,
  get: () => unknown,
  set: (v: unknown) => void,
): void {
  on(el, 'change', () => set(getValue(el)));
  renderEffect(() => {
    el.checked = looseEqual(get(), getValue(el));
  });
}

/** Selects the options whose values match `value` (an array or a `Set` for `multiple`). */
function setSelected(el: HTMLSelectElement, value: unknown): void {
  const multiple = el.multiple;
  if (multiple && !Array.isArray(value) && !(value instanceof Set)) return;
  for (let i = 0; i < el.options.length; i++) {
    const option = el.options[i];
    const optionValue = getValue(option);
    if (Array.isArray(value)) option.selected = looseIndexOf(value, optionValue) >= 0;
    else if (value instanceof Set) option.selected = value.has(optionValue);
    else if (looseEqual(optionValue, value)) {
      el.selectedIndex = i;
      return;
    }
  }
  if (!multiple) el.selectedIndex = -1;
}

/**
 * `v-model` on a `<select>`: the value (`getValue`, cast by `number`) of the selected option, or
 * for `multiple` an array (a `Set` while the model is a `Set`) of the selected values. Options
 * render after the select, so the selection is synced in the post-flush queue, after mount and
 * after each model change; a value just assigned from the element is not synced back.
 */
export function applySelectModel(
  el: HTMLSelectElement,
  get: () => unknown,
  set: (v: unknown) => void,
  mods: { number?: boolean } = {},
): void {
  let model: unknown;
  let pending = false;
  let assigned: unknown;
  on(el, 'change', () => {
    const selected = [...el.options]
      .filter((option) => option.selected)
      .map((option) => {
        const value = getValue(option);
        return mods.number ? looseToNumber(toText(value)) : value;
      });
    pending = true;
    assigned = el.multiple ? (model instanceof Set ? new Set(selected) : selected) : selected[0];
    set(assigned);
  });
  const sync = () => {
    const value = toRaw(model);
    if (!pending || value !== assigned) setSelected(el, value);
    pending = false;
  };
  renderEffect(() => {
    model = get();
    // Track the items of an array or Set model.
    if (Array.isArray(model) || model instanceof Set) model.forEach(() => {});
    queuePostFlushCb(sync);
  });
}
