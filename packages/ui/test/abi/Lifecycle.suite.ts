import { nextTick } from '@usevibejs/ui';
import { expect, test } from 'vitest';
import { mountForTest } from './mount.ts';
import { defineAbiSuite, type AbiSuite } from './suite.ts';

export const LifecycleSuite: AbiSuite = defineAbiSuite('Lifecycle', (load) => {
  test('mounts children first and returns from mount after the mounted hooks ran', async () => {
    const log: string[] = [];
    const { unmount } = mountForTest(await load(), { log });
    expect(log).toEqual(['leaf beforeMount', 'root beforeMount', 'leaf mounted', 'root mounted']);
    unmount();
  });

  test('runs the update hooks once per flush and instance', async () => {
    const log: string[] = [];
    const { el, unmount } = mountForTest(await load(), { log });
    log.length = 0;
    const button = el.querySelector('button')!;
    button.click();
    button.click();
    await nextTick();
    expect(el.querySelector('span')!.textContent).toBe('2');
    expect(log).toHaveLength(4);
    expect(log).toEqual(
      expect.arrayContaining([
        'root beforeUpdate',
        'root updated',
        'leaf beforeUpdate',
        'leaf updated',
      ]),
    );
    expect(log.indexOf('root beforeUpdate')).toBeLessThan(log.indexOf('leaf beforeUpdate'));
    unmount();
  });

  test('unmounts the parent first and finishes with its unmounted hook', async () => {
    const log: string[] = [];
    const { unmount } = mountForTest(await load(), { log });
    log.length = 0;
    unmount();
    expect(log).toEqual([
      'root beforeUnmount',
      'leaf beforeUnmount',
      'leaf unmounted',
      'root unmounted',
    ]);
  });

  test('passes a child error to the onErrorCaptured hook of its parent', async () => {
    const log: string[] = [];
    const { el, unmount } = mountForTest(await load(), { log });
    log.length = 0;
    el.querySelector('span')!.click();
    expect(log).toEqual(['captured leaf failed from Leaf in native event handler']);
    unmount();
  });
});
