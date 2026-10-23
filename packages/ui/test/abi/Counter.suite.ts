import { nextTick } from '@usevibejs/ui';
import { expect, test } from 'vitest';
import { mountForTest } from './mount.ts';
import { defineAbiSuite, type AbiSuite } from './suite.ts';

export const CounterSuite: AbiSuite = defineAbiSuite('Counter', (load) => {
  test('renders the interpolation and updates it on click', async () => {
    const { el, emitted, unmount } = mountForTest(await load());
    const button = el.querySelector('button')!;
    expect(el.innerHTML).toBe('<button type="button">Count: 0</button>');
    button.click();
    button.click();
    expect(button.textContent).toBe('Count: 0');
    await nextTick();
    expect(button.textContent).toBe('Count: 2');
    expect(emitted).toEqual({ change: [[1], [2]] });
    unmount();
  });

  test('reads props in setup and in handlers', async () => {
    const { el, props, unmount } = mountForTest(await load(), { start: 5, step: 2 });
    const button = el.querySelector('button')!;
    expect(button.textContent).toBe('Count: 5');
    props.step = 10;
    button.click();
    await nextTick();
    expect(button.textContent).toBe('Count: 15');
    unmount();
  });

  test('prevents the default action', async () => {
    const { el, unmount } = mountForTest(await load());
    const event = new MouseEvent('click', { cancelable: true });
    el.querySelector('button')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    unmount();
  });
});
