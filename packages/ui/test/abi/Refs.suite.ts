import { nextTick } from '@vibejs-org/ui';
import { expect, test } from 'vitest';
import { mountForTest } from './mount.ts';
import { defineAbiSuite, type AbiSuite } from './suite.ts';

export const RefsSuite: AbiSuite = defineAbiSuite('Refs', (load) => {
  test('fills element, component and v-for refs once rendered', async () => {
    const { el, exposed, unmount } = mountForTest(await load());
    expect(exposed.input).toBe(el.querySelector('input'));
    expect(exposed.counter).toEqual({ count: 0 });
    expect(Object.keys(exposed.counter as object)).toEqual(['count']);
    expect(exposed.rows).toEqual([...el.querySelectorAll('li')]);
    expect(exposed.seen).toEqual([el.querySelector('p')]);
    unmount();
  });

  test('resets refs whose element is removed', async () => {
    const { exposed, unmount } = mountForTest(await load());
    exposed.show = false;
    exposed.items = [1, 3];
    await nextTick();
    expect(exposed.input).toBeNull();
    expect((exposed.rows as Element[]).map((li) => li.textContent)).toEqual(['1', '3']);
    exposed.show = true;
    await nextTick();
    expect(exposed.input).toBeInstanceOf(HTMLInputElement);
    unmount();
  });

  test('calls a function ref with the element, then null on unmount', async () => {
    const { el, exposed, unmount } = mountForTest(await load());
    const p = el.querySelector('p');
    unmount();
    expect(exposed.seen).toEqual([p, null]);
  });
});
