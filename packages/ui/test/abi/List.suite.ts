import { nextTick, reactive } from '@usevibejs/ui';
import { expect, test } from 'vitest';
import { mountForTest } from './mount.ts';
import { defineAbiSuite, type AbiSuite } from './suite.ts';

const rows = (el: Element) =>
  [...el.querySelectorAll('li')].map((li) => `${li.className}|${li.textContent}`);

export const ListSuite: AbiSuite = defineAbiSuite('List', (load) => {
  test('renders the title, the rows and their classes', async () => {
    const items = reactive([
      { id: 1, label: 'apple', done: true },
      { id: 2, label: 'banana', done: false },
    ]);
    const { el, props, unmount } = mountForTest(await load(), { title: 'Fruit', items });
    expect(el.querySelector('h2')!.textContent).toBe('Fruit');
    expect(rows(el)).toEqual(['done|1. apple', '|2. banana']);
    expect(el.querySelector('p')).toBeNull();

    props.title = 'Basket';
    items[1].done = true;
    items.push({ id: 3, label: 'cherry', done: false });
    await nextTick();
    expect(el.querySelector('h2')!.textContent).toBe('Basket');
    expect(rows(el)).toEqual(['done|1. apple', 'done|2. banana', '|3. cherry']);
    unmount();
  });

  test('keeps the row elements of moved items', async () => {
    const items = reactive([
      { id: 1, label: 'a', done: false },
      { id: 2, label: 'b', done: false },
      { id: 3, label: 'c', done: false },
    ]);
    const { el, unmount } = mountForTest(await load(), { title: '', items });
    const [first, , last] = el.querySelectorAll('li');
    items.reverse();
    await nextTick();
    const after = el.querySelectorAll('li');
    expect(after[0]).toBe(last);
    expect(after[2]).toBe(first);
    expect(rows(el)).toEqual(['|1. c', '|2. b', '|3. a']);
    unmount();
  });

  test('filters through the trimmed text model and shows the empty branch', async () => {
    const items = [
      { id: 1, label: 'apple', done: false },
      { id: 2, label: 'banana', done: false },
    ];
    const { el, unmount } = mountForTest(await load(), { title: '', items });
    const input = el.querySelector('input')!;
    input.value = ' ban ';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    expect(rows(el)).toEqual(['|1. banana']);
    input.value = 'kiwi';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    expect(el.querySelector('ul')).toBeNull();
    expect(el.querySelector('p')!.textContent).toBe('Nothing');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    expect(rows(el)).toEqual(['|1. apple', '|2. banana']);
    unmount();
  });
});
