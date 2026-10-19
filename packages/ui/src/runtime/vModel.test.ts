// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/__tests__/directives/vModel.spec.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/__tests__/directives/vShow.spec.ts (MIT)
//
// Each case binds the model helper that codegen emits to a ref instead of rendering a vnode with
// a directive. Dropped: cases about listener merging, dynamic `type`, Transition, hydration, range
// inputs, shadow roots, select assigner errors and duplicate option values; equality of Map and
// Set values is by text. A select model change syncs in the post-flush queue, so cases await it.
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { reactive } from '../reactivity/reactive.ts';
import { ref, shallowRef, type Ref } from '../reactivity/ref.ts';
import { setProp, setStyle } from './dom.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';
import {
  applyCheckboxModel,
  applyRadioModel,
  applySelectModel,
  applyTextModel,
  applyVShow,
} from './vModel.ts';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const triggerEvent = (type: string, el: Element) => {
  el.dispatchEvent(new Event(type));
};

/** A model ref with the `get` and `set` that codegen passes. */
function model<T>(initial: T): [Ref<T>, () => T, (v: unknown) => void] {
  const data = shallowRef(initial);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- each case assigns its model type
  return [data, () => data.value, (v) => (data.value = v as T)];
}

function input(type = 'text', value?: string): HTMLInputElement {
  const el = document.createElement('input');
  el.type = type;
  if (value !== undefined) el.setAttribute('value', value);
  return el;
}

function select(values: string[], multiple = false): HTMLSelectElement {
  const el = document.createElement('select');
  el.multiple = multiple;
  for (const value of values) el.add(new Option(value, value));
  return el;
}

describe('vModel', () => {
  it('should work with text input', async () => {
    const [data, get, set] = model<string | null | undefined>(null);
    const el = input();
    const manualListener = vi.fn<(v: unknown) => void>();
    applyTextModel(el, get, set);
    el.addEventListener('input', () => manualListener(data.value));
    expect(el.value).toEqual('');

    el.value = 'foo';
    triggerEvent('input', el);
    await nextTick();
    expect(data.value).toEqual('foo');
    expect(manualListener).toHaveBeenCalledWith('foo');

    data.value = 'bar';
    await nextTick();
    expect(el.value).toEqual('bar');

    data.value = undefined;
    await nextTick();
    expect(el.value).toEqual('');
  });

  it('should work with number input', async () => {
    const [data, get, set] = model<unknown>(null);
    const el = input('number');
    applyTextModel(el, get, set);
    expect(el.value).toEqual('');
    el.value = '1';
    triggerEvent('input', el);
    await nextTick();
    expect(data.value).toBe(1);
  });

  it('should work with number input and be able to update rendering correctly', async () => {
    const [data, get, set] = model<unknown>(1.002);
    const el = input('number');
    applyTextModel(el, get, set);
    expect(el.value).toBe('1.002');
    el.value = '1.00';
    triggerEvent('input', el);
    await nextTick();
    expect(data.value).toBe(1);
    expect(el.value).toBe('1.00');
  });

  it('should work with textarea', async () => {
    const [data, get, set] = model<string | null>(null);
    const el = document.createElement('textarea');
    applyTextModel(el, get, set);
    el.value = 'foo';
    triggerEvent('input', el);
    await nextTick();
    expect(data.value).toEqual('foo');
    data.value = 'bar';
    await nextTick();
    expect(el.value).toEqual('bar');
  });

  it('should support modifiers', async () => {
    const [num, getNum, setNum] = model<unknown>(null);
    const number = input();
    applyTextModel(number, getNum, setNum, { number: true });
    const [trimmed, getTrim, setTrim] = model<unknown>(null);
    const trim = input();
    applyTextModel(trim, getTrim, setTrim, { trim: true });
    const [trimNum, getTrimNum, setTrimNum] = model<unknown>(null);
    const trimNumber = input();
    applyTextModel(trimNumber, getTrimNum, setTrimNum, { trim: true, number: true });
    const [trimLazyData, getTrimLazy, setTrimLazy] = model<unknown>(null);
    const trimLazy = input();
    applyTextModel(trimLazy, getTrimLazy, setTrimLazy, { trim: true, lazy: true });
    const [lazyData, getLazy, setLazy] = model<unknown>(null);
    const lazy = input();
    applyTextModel(lazy, getLazy, setLazy, { lazy: true });

    number.value = '+01.2';
    triggerEvent('input', number);
    await nextTick();
    expect(num.value).toEqual(1.2);
    triggerEvent('change', number);
    await nextTick();
    expect(number.value).toEqual('1.2');

    trim.value = '    hello, world    ';
    triggerEvent('input', trim);
    await nextTick();
    expect(trimmed.value).toEqual('hello, world');

    trimNumber.value = '    1    ';
    triggerEvent('input', trimNumber);
    await nextTick();
    expect(trimNum.value).toEqual(1);

    trimNumber.value = '    +01.2    ';
    triggerEvent('input', trimNumber);
    await nextTick();
    expect(trimNum.value).toEqual(1.2);

    trimLazy.value = '   ddd    ';
    triggerEvent('input', trimLazy);
    await nextTick();
    expect(trimLazyData.value).toBeNull();
    triggerEvent('change', trimLazy);
    await nextTick();
    expect(trimLazyData.value).toEqual('ddd');

    lazy.value = 'foo';
    triggerEvent('change', lazy);
    await nextTick();
    expect(lazyData.value).toEqual('foo');

    number.value = 'abc';
    triggerEvent('input', number);
    await nextTick();
    expect(num.value).toEqual('abc');
  });

  it('keeps the spaces typed into a focused trimmed input', async () => {
    const [data, get, set] = model('');
    const el = input();
    document.body.append(el);
    applyTextModel(el, get, set, { trim: true });
    el.focus();
    el.value = 'a ';
    triggerEvent('input', el);
    await nextTick();
    expect(data.value).toBe('a');
    expect(el.value).toBe('a ');
    el.blur();
    data.value = 'b';
    await nextTick();
    expect(el.value).toBe('b');
  });

  it('should work with composition session', async () => {
    const [data, get, set] = model('');
    const el = input();
    applyTextModel(el, get, set);
    el.value = 'compose';
    triggerEvent('compositionstart', el);
    await nextTick();
    expect(data.value).toEqual('');

    // input event has no effect during composition session
    el.value = 'composed';
    triggerEvent('input', el);
    data.value = 'other';
    await nextTick();
    expect(el.value).toEqual('composed');

    // compositionend dispatches an input event
    triggerEvent('compositionend', el);
    await nextTick();
    expect(data.value).toEqual('composed');

    // a change without a composition dispatches nothing
    const inputs = vi.fn<() => void>();
    el.addEventListener('input', inputs);
    triggerEvent('change', el);
    expect(inputs).not.toHaveBeenCalled();
  });

  test('equal value with a leading 0 should trigger update.', async () => {
    const [data, get, set] = model<unknown>(0);
    const el = input('number');
    applyTextModel(el, get, set);
    expect(el.value).toBe('0');
    el.value = '01';
    triggerEvent('input', el);
    await nextTick();
    expect(data.value).toBe(1);
    expect(el.value).toBe('1');
  });

  it('should work with checkbox', async () => {
    const [data, get, set] = model<unknown>(null);
    const el = input('checkbox');
    applyCheckboxModel(el, get, set);

    el.checked = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual(true);

    data.value = false;
    await nextTick();
    expect(el.checked).toEqual(false);

    data.value = true;
    await nextTick();
    expect(el.checked).toEqual(true);

    el.checked = false;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual(false);
  });

  it('should work with checkbox and true-value/false-value', async () => {
    const [data, get, set] = model<unknown>('yes');
    const el = input('checkbox');
    applyCheckboxModel(el, get, set, { true: () => 'yes', false: () => 'no' });
    expect(el.checked).toEqual(true);

    el.checked = false;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual('no');

    data.value = 'yes';
    await nextTick();
    expect(el.checked).toEqual(true);

    data.value = 'no';
    await nextTick();
    expect(el.checked).toEqual(false);

    el.checked = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual('yes');
  });

  it('should work with checkbox and true-value/false-value with object values', async () => {
    const [data, get, set] = model<unknown>(null);
    const el = input('checkbox');
    applyCheckboxModel(el, get, set, { true: () => ({ yes: 'yes' }), false: () => ({ no: 'no' }) });

    el.checked = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual({ yes: 'yes' });

    data.value = { no: 'no' };
    await nextTick();
    expect(el.checked).toEqual(false);

    el.checked = false;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual({ no: 'no' });

    data.value = { yes: 'yes' };
    await nextTick();
    expect(el.checked).toEqual(true);
  });

  it('should support array as a checkbox model', async () => {
    const [data, get, set] = model<unknown[]>([]);
    const foo = input('checkbox', 'foo');
    const bar = input('checkbox', 'bar');
    applyCheckboxModel(foo, get, set);
    applyCheckboxModel(bar, get, set);

    foo.checked = true;
    triggerEvent('change', foo);
    await nextTick();
    expect(data.value).toEqual(['foo']);

    bar.checked = true;
    triggerEvent('change', bar);
    await nextTick();
    expect(data.value).toEqual(['foo', 'bar']);

    // A change that matches the model assigns nothing.
    triggerEvent('change', bar);
    await nextTick();
    expect(data.value).toEqual(['foo', 'bar']);

    bar.checked = false;
    triggerEvent('change', bar);
    await nextTick();
    expect(data.value).toEqual(['foo']);

    foo.checked = false;
    triggerEvent('change', foo);
    await nextTick();
    expect(data.value).toEqual([]);

    data.value = ['foo'];
    await nextTick();
    expect(bar.checked).toEqual(false);
    expect(foo.checked).toEqual(true);

    data.value = ['bar'];
    await nextTick();
    expect(foo.checked).toEqual(false);
    expect(bar.checked).toEqual(true);

    data.value = [];
    await nextTick();
    expect(foo.checked).toEqual(false);
    expect(bar.checked).toEqual(false);
  });

  it('should support Set as a checkbox model', async () => {
    const [data, get, set] = model(new Set<unknown>());
    const foo = input('checkbox', 'foo');
    const bar = input('checkbox', 'bar');
    applyCheckboxModel(foo, get, set);
    applyCheckboxModel(bar, get, set);

    foo.checked = true;
    triggerEvent('change', foo);
    await nextTick();
    expect(data.value).toEqual(new Set(['foo']));

    bar.checked = true;
    triggerEvent('change', bar);
    await nextTick();
    expect(data.value).toEqual(new Set(['foo', 'bar']));

    bar.checked = false;
    triggerEvent('change', bar);
    await nextTick();
    expect(data.value).toEqual(new Set(['foo']));

    data.value = new Set(['bar']);
    await nextTick();
    expect(foo.checked).toEqual(false);
    expect(bar.checked).toEqual(true);
  });

  it('should support mutating an array or set value for a checkbox', async () => {
    const list = reactive<string[]>([]);
    const el = input('checkbox', 'foo');
    applyCheckboxModel(
      el,
      () => list,
      () => {},
    );
    list.push('foo');
    await nextTick();
    expect(el.checked).toBe(true);
    const tags = reactive(new Set<string>());
    const other = input('checkbox', 'bar');
    applyCheckboxModel(
      other,
      () => tags,
      () => {},
    );
    tags.add('bar');
    await nextTick();
    expect(other.checked).toBe(true);
  });

  it('uses the raw value bound with setProp', async () => {
    const value = { id: 1 };
    const [data, get, set] = model<unknown[]>([]);
    const el = input('checkbox');
    setProp(el, 'value', value);
    applyCheckboxModel(el, get, set);
    el.checked = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value[0]).toBe(value);
    data.value = [{ id: 1 }];
    await nextTick();
    expect(el.checked).toBe(true);
    data.value = [{ id: 1, extra: true }];
    await nextTick();
    expect(el.checked).toBe(false);
  });

  it('should work with radio', async () => {
    const [data, get, set] = model<unknown>(null);
    const foo = input('radio', 'foo');
    const bar = input('radio', 'bar');
    applyRadioModel(foo, get, set);
    applyRadioModel(bar, get, set);

    foo.checked = true;
    triggerEvent('change', foo);
    await nextTick();
    expect(data.value).toEqual('foo');

    bar.checked = true;
    triggerEvent('change', bar);
    await nextTick();
    expect(data.value).toEqual('bar');

    data.value = null;
    await nextTick();
    expect(foo.checked).toEqual(false);
    expect(bar.checked).toEqual(false);

    data.value = 'foo';
    await nextTick();
    expect(foo.checked).toEqual(true);
    expect(bar.checked).toEqual(false);
  });

  it('should work with single select', async () => {
    const [data, get, set] = model<unknown>(null);
    const el = select(['foo', 'bar']);
    const [foo, bar] = el.options;
    applySelectModel(el, get, set);
    await nextTick();
    expect(el.selectedIndex).toBe(-1);

    foo.selected = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual('foo');

    bar.selected = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual('bar');

    data.value = 'foo';
    await nextTick();
    expect(el.value).toEqual('foo');
    expect(foo.selected).toEqual(true);
    expect(bar.selected).toEqual(false);

    data.value = 'baz';
    await nextTick();
    expect(el.selectedIndex).toBe(-1);
  });

  it('syncs options that render after the select', async () => {
    const [, get, set] = model('b');
    const el = document.createElement('select');
    applySelectModel(el, get, set);
    el.add(new Option('a', 'a'));
    el.add(new Option('b', 'b'));
    await nextTick();
    expect(el.value).toBe('b');
  });

  it('multiple select (model is Array)', async () => {
    const [data, get, set] = model<unknown>([]);
    const el = select(['foo', 'bar'], true);
    const [foo, bar] = el.options;
    applySelectModel(el, get, set);

    foo.selected = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual(['foo']);

    foo.selected = false;
    bar.selected = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual(['bar']);

    foo.selected = true;
    bar.selected = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual(['foo', 'bar']);

    foo.selected = false;
    bar.selected = false;
    data.value = ['foo'];
    await nextTick();
    expect(el.value).toEqual('foo');
    expect(foo.selected).toEqual(true);
    expect(bar.selected).toEqual(false);

    foo.selected = false;
    bar.selected = false;
    data.value = ['foo', 'bar'];
    await nextTick();
    expect(foo.selected).toEqual(true);
    expect(bar.selected).toEqual(true);
  });

  it('v-model.number should work with select tag', async () => {
    const [data, get, set] = model<unknown>(null);
    const el = select(['1', '2']);
    applySelectModel(el, get, set, { number: true });
    el.options[0].selected = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual(1);
  });

  it('v-model.number should work with multiple select', async () => {
    const [data, get, set] = model<unknown>([]);
    const el = select(['1', '2'], true);
    applySelectModel(el, get, set, { number: true });
    el.options[0].selected = true;
    el.options[1].selected = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual([1, 2]);
    data.value = [2];
    await nextTick();
    expect([el.options[0].selected, el.options[1].selected]).toEqual([false, true]);
  });

  it('multiple select (model is Array, option value is object)', async () => {
    const fooValue = { foo: 1 };
    const barValue = { bar: 1 };
    const [data, get, set] = model<unknown>([]);
    const el = select(['', ''], true);
    const [foo, bar] = el.options;
    setProp(foo, 'value', fooValue);
    setProp(bar, 'value', barValue);
    applySelectModel(el, get, set);

    foo.selected = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual([fooValue]);

    data.value = [{ bar: 1 }];
    await nextTick();
    expect(foo.selected).toEqual(false);
    expect(bar.selected).toEqual(true);
  });

  it('multiple select (model is Set)', async () => {
    const [data, get, set] = model<unknown>(new Set());
    const el = select(['foo', 'bar'], true);
    const [foo, bar] = el.options;
    applySelectModel(el, get, set);

    foo.selected = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual(new Set(['foo']));

    foo.selected = false;
    bar.selected = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toEqual(new Set(['bar']));

    foo.selected = false;
    bar.selected = false;
    data.value = new Set(['foo']);
    await nextTick();
    expect(foo.selected).toEqual(true);
    expect(bar.selected).toEqual(false);
  });

  it('should sync a multiple select when its model is mutated', async () => {
    const tags = reactive<string[]>([]);
    const el = select(['foo', 'bar'], true);
    applySelectModel(
      el,
      () => tags,
      () => {},
    );
    tags.push('bar');
    await nextTick();
    expect([el.options[0].selected, el.options[1].selected]).toEqual([false, true]);
  });

  it('multiple select ignores a model that is not an Array or Set', async () => {
    const el = select(['foo'], true);
    el.options[0].selected = true;
    applySelectModel(
      el,
      () => 'foo',
      () => {},
    );
    await nextTick();
    expect(el.options[0].selected).toBe(true);
  });

  it('multiple select (model is number, option value is string)', async () => {
    const el = select(['1', '2'], true);
    applySelectModel(
      el,
      () => [1, 2],
      () => {},
    );
    await nextTick();
    expect([el.options[0].selected, el.options[1].selected]).toEqual([true, true]);
  });

  it('should not write back a value just assigned from the select', async () => {
    const [data, get, set] = model<unknown>('foo');
    const el = select(['foo', 'bar']);
    applySelectModel(el, get, set);
    await nextTick();
    const write = vi.spyOn(el, 'selectedIndex', 'set');
    el.options[1].selected = true;
    triggerEvent('change', el);
    await nextTick();
    expect(data.value).toBe('bar');
    expect(write).not.toHaveBeenCalled();
  });

  test('loose equality of dates, arrays, objects and symbols', async () => {
    const date = new Date(0);
    const [data, get, set] = model<unknown>(new Date(0));
    const el = input('radio');
    setProp(el, 'value', date);
    applyRadioModel(el, get, set);
    expect(el.checked).toBe(true);
    for (const [value, checked] of [
      [new Date(1), false],
      ['x', false],
      [Symbol('x'), false],
    ] as const) {
      data.value = value;
      await nextTick();
      expect(el.checked).toBe(checked);
    }
    setProp(el, 'value', 'x');
    data.value = Symbol('x');
    await nextTick();
    expect(el.checked).toBe(false);
    setProp(el, 'value', [1, { a: [2] }]);
    data.value = [1, { a: [2] }];
    await nextTick();
    expect(el.checked).toBe(true);
    data.value = [1, { a: [3] }];
    await nextTick();
    expect(el.checked).toBe(false);
    data.value = [1];
    await nextTick();
    expect(el.checked).toBe(false);
    data.value = { 0: 1 };
    await nextTick();
    expect(el.checked).toBe(false);
  });
});

describe('runtime-dom: v-show directive', () => {
  test('should check show value is truthy', () => {
    const el = document.createElement('div');
    applyVShow(el, () => true);
    expect(el.style.display).toEqual('');
  });

  test('should check show value is falsy', () => {
    const el = document.createElement('div');
    applyVShow(el, () => false);
    expect(el.style.display).toEqual('none');
  });

  it('should update show value changed', async () => {
    const value = ref<unknown>(true);
    const el = document.createElement('div');
    applyVShow(el, () => value.value);
    for (const [v, display] of [
      [false, 'none'],
      [true, ''],
      [0, 'none'],
      [1, ''],
      [null, 'none'],
      [{}, ''],
      [undefined, 'none'],
      ['', 'none'],
      ['x', ''],
    ] as const) {
      value.value = v;
      await nextTick();
      expect(el.style.display).toEqual(display);
    }
  });

  test('should respect display value in style attribute', async () => {
    const value = ref(true);
    const el = document.createElement('div');
    el.style.display = 'block';
    applyVShow(el, () => value.value);
    expect(el.style.display).toEqual('block');
    value.value = false;
    await nextTick();
    expect(el.style.display).toEqual('none');
    value.value = true;
    await nextTick();
    expect(el.style.display).toEqual('block');
  });

  test('a hidden initial display is not restored', async () => {
    const value = ref(false);
    const el = document.createElement('div');
    el.style.display = 'none';
    applyVShow(el, () => value.value);
    value.value = true;
    await nextTick();
    expect(el.style.display).toEqual('');
  });

  test('the value of `display` set by v-show should not be overwritten by the style attribute when updated', async () => {
    const style = ref('width: 100px');
    const display = ref(false);
    const el = document.createElement('div');
    renderEffect(() => setStyle(el, style.value));
    applyVShow(el, () => display.value);
    expect(el.style.display).toEqual('none');

    style.value = 'width: 50px';
    await nextTick();
    expect(el.style.display).toEqual('none');

    display.value = true;
    await nextTick();
    expect(el.style.display).toEqual('');
  });

  test('the value of `display` set by v-show should not be overwritten by the style attribute when updated (object value)', async () => {
    const style = ref<Record<string, string>>({ display: 'block', width: '100px' });
    const display = ref(false);
    const el = document.createElement('div');
    renderEffect(() => setStyle(el, style.value));
    applyVShow(el, () => display.value);
    expect(el.style.display).toEqual('none');

    style.value = { display: 'inline-flex', width: '50px' };
    await nextTick();
    expect(el.style.display).toEqual('none');

    display.value = true;
    await nextTick();
    expect(el.style.display).toEqual('inline-flex');

    style.value = { width: '10px' };
    await nextTick();
    expect(el.style.display).toEqual('');
  });

  test('a style update while hidden keeps the bound display to restore', async () => {
    const color = ref('red');
    const show = ref(true);
    const el = document.createElement('div');
    renderEffect(() => setStyle(el, { display: 'flex', color: color.value }));
    applyVShow(el, () => show.value);
    show.value = false;
    await nextTick();
    color.value = 'blue';
    await nextTick();
    show.value = true;
    await nextTick();
    expect(el.style.display).toBe('flex');
  });
});
