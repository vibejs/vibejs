import { inject, nextTick } from '@vibejs-org/ui';
import { expect, test } from 'vitest';
import { mountForTest } from './mount.ts';
import { defineAbiSuite, type AbiSuite } from './suite.ts';

export const ProvideSuite: AbiSuite = defineAbiSuite('Provide', (load) => {
  test('injects from the parent and from the app, with defaults and factories', async () => {
    const { el, unmount } = mountForTest(await load(), {}, { provide: { user: 'ada' } });
    const texts = () => [...el.querySelectorAll('p')].map((p) => p.textContent);
    expect(texts()).toEqual(['dark ada en', 'dark ada en']);
    el.querySelector('button')!.click();
    await nextTick();
    expect(texts()).toEqual(['light ada en', 'light ada en']);
    unmount();
  });

  test('falls back to the default without an app value', async () => {
    const { el, unmount } = mountForTest(await load());
    expect(el.querySelector('p')!.textContent).toBe('dark guest en');
    unmount();
  });

  test('gives each instance its own stable id, unique in the app', async () => {
    const { el, unmount } = mountForTest(await load());
    const ids = () => [...el.querySelectorAll('p')].map((p) => p.id);
    const [first, second] = ids();
    expect(first).toMatch(/^v\d+-\d+$/);
    expect(second).not.toBe(first);
    el.querySelector('button')!.click();
    await nextTick();
    expect(ids()).toEqual([first, second]);
    unmount();
  });

  test('injects the app values in runWithContext', async () => {
    const { app, unmount } = mountForTest(await load(), {}, { provide: { user: 'ada' } });
    expect(app.runWithContext(() => inject('user'))).toBe('ada');
    unmount();
  });
});
