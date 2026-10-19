// DOM behavior that only a real browser shows, checked in Chromium through the public API and the
// compiler ABI.
import { afterEach, expect, it, vi } from 'vitest';
import { nextTick, ref, shallowRef } from '../index.ts';
import {
  applySelectModel,
  applyTextModel,
  applyVShow,
  child,
  createFor,
  insert,
  next,
  nthChild,
  on,
  setStyle,
  template,
  txt,
} from '../internal.ts';

afterEach(() => {
  document.body.innerHTML = '';
  for (const style of document.head.querySelectorAll('style')) style.remove();
});

/** Adds a stylesheet to the document. */
function sheet(css: string): void {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
}

it('keeps the node paths of table templates', () => {
  const table = template('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>')();
  const cell = next(child(child(child(table))));
  expect(cell.nodeName).toBe('TD');
  expect(txt(cell).data).toBe('b');

  const row = template('<tr><td>x</td><td><b>y</b></td></tr>')();
  expect(row.nodeName).toBe('TR');
  expect(nthChild(nthChild(row, 1), 0).nodeName).toBe('B');
  document.body.append(template('<table><tbody></tbody></table>')());
  document.querySelector('tbody')!.append(row);
  expect(document.querySelector('td b')?.textContent).toBe('y');
});

it('creates SVG and MathML roots in their namespaces', () => {
  const g = template('<g><circle r="2"></circle><text>t</text></g>', 'svg')();
  expect(g).toBeInstanceOf(SVGGElement);
  expect(nthChild(g, 1)).toBeInstanceOf(SVGTextElement);
  expect(txt(nthChild(g, 1)).data).toBe('t');

  const row = template('<mrow><mi>x</mi><mo>+</mo></mrow>', 'math')();
  expect(row).toBeInstanceOf(MathMLElement);
  expect(row.nodeName).toBe('mrow');
  expect(next(child(row))).toBeInstanceOf(MathMLElement);
  expect(txt(next(child(row))).data).toBe('+');
});

it('sets !important styles with their priority', () => {
  sheet('#styled { color: rgb(0, 0, 255) !important; }');
  const el = document.createElement('div');
  el.id = 'styled';
  document.body.append(el);
  setStyle(el, { color: 'rgb(255, 0, 0) !important', marginTop: '4px' });
  expect(el.style.getPropertyValue('color')).toBe('rgb(255, 0, 0)');
  expect(el.style.getPropertyPriority('color')).toBe('important');
  expect(getComputedStyle(el).color).toBe('rgb(255, 0, 0)');
  setStyle(el, 'color: rgb(0, 128, 0) !important');
  expect(getComputedStyle(el).color).toBe('rgb(0, 128, 0)');
  expect(el.style.marginTop).toBe('');
});

it('v-show hides an element and restores the display of its stylesheet', async () => {
  sheet('.row { display: flex; }');
  const el = document.createElement('div');
  el.className = 'row';
  document.body.append(el);
  const visible = ref(false);
  applyVShow(el, () => visible.value);
  expect(getComputedStyle(el).display).toBe('none');
  visible.value = true;
  await nextTick();
  expect(getComputedStyle(el).display).toBe('flex');
  expect(el.getAttribute('style')).toBe('');
});

it('v-model on a text input holds updates during an IME composition', async () => {
  const text = ref('a');
  const el = document.createElement('input');
  document.body.append(el);
  applyTextModel(
    el,
    () => text.value,
    (v) => (text.value = String(v)),
  );
  expect(el.value).toBe('a');

  el.dispatchEvent(new CompositionEvent('compositionstart'));
  el.value = 'かな';
  el.dispatchEvent(new InputEvent('input'));
  expect(text.value).toBe('a');
  // A model change during the composition keeps the unresolved text.
  text.value = 'b';
  await nextTick();
  expect(el.value).toBe('かな');

  el.dispatchEvent(new CompositionEvent('compositionend'));
  expect(text.value).toBe('かな');
});

it('v-model on <select multiple> reads and writes every selected option', async () => {
  const el = document.createElement('select');
  el.multiple = true;
  for (const value of ['a', 'b', 'c']) el.add(new Option(value, value));
  document.body.append(el);
  const selected = shallowRef<string[]>(['b']);
  applySelectModel(
    el,
    () => selected.value,
    (v) => (selected.value = Array.isArray(v) ? v.map(String) : []),
  );
  await nextTick();
  expect([...el.selectedOptions].map((o) => o.value)).toEqual(['b']);

  el.options[0].selected = true;
  el.options[1].selected = false;
  el.options[2].selected = true;
  el.dispatchEvent(new Event('change'));
  expect(selected.value).toEqual(['a', 'c']);

  selected.value = ['c'];
  await nextTick();
  expect([...el.selectedOptions].map((o) => o.value)).toEqual(['c']);
});

it('on() passes once and passive to the browser', () => {
  const el = document.createElement('button');
  document.body.append(el);
  const click = vi.fn<(e: Event) => void>();
  on(el, 'click', click, { once: true });
  el.click();
  el.click();
  expect(click).toHaveBeenCalledOnce();

  on(el, 'wheel', (e) => e.preventDefault(), { passive: true });
  const wheel = new WheelEvent('wheel', { cancelable: true });
  el.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
});

it('keeps the focus on an item that a keyed createFor does not move', async () => {
  const ids = ref([1, 2, 3, 4]);
  const list = document.createElement('div');
  document.body.append(list);
  insert(
    createFor<number>(
      () => ids.value,
      (id) => {
        const input = document.createElement('input');
        input.dataset.id = String(id.value);
        return input;
      },
      (id) => id,
    ),
    list,
  );
  const focused = list.querySelector<HTMLInputElement>('[data-id="2"]')!;
  focused.focus();
  expect(document.activeElement).toBe(focused);

  ids.value = [2, 3, 4, 1];
  await nextTick();
  expect([...list.querySelectorAll('input')].map((el) => el.dataset.id)).toEqual([
    '2',
    '3',
    '4',
    '1',
  ]);
  expect(document.activeElement).toBe(focused);
});
