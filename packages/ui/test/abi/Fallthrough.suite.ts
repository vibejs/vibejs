import { nextTick } from '@usevibejs/ui';
import { expect, test, vi } from 'vitest';
import { mountForTest } from './mount.ts';
import { defineAbiSuite, type AbiSuite } from './suite.ts';

export const FallthroughSuite: AbiSuite = defineAbiSuite('Fallthrough', (load) => {
  test('passes attributes through a single-root child to the element of its v-if root, merging class and style', async () => {
    const onClick = vi.fn<() => void>();
    const { el, props, unmount } = mountForTest(await load(), {
      class: 'extra',
      style: { color: 'blue', fontWeight: 'bold' },
      id: 'b',
      onClick,
      wide: false,
    });
    const span = el.querySelector('span')!;
    expect(span.className).toBe('badge mid extra');
    expect(span.style.color).toBe('blue');
    expect(span.style.fontWeight).toBe('bold');
    expect(span.style.fontStyle).toBe('italic');
    expect(span.id).toBe('b');
    expect(span.hasAttribute('wide')).toBe(false);
    span.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    props.wide = true;
    await nextTick();
    const strong = el.querySelector('strong')!;
    expect(el.querySelector('span')).toBeNull();
    expect(strong.className).toBe('badge mid extra');
    expect(strong.style.color).toBe('blue');
    expect(strong.id).toBe('b');
    strong.click();
    expect(onClick).toHaveBeenCalledTimes(2);

    props.class = ['other', { on: true }];
    props.id = undefined;
    await nextTick();
    expect(strong.className).toBe('badge mid other on');
    expect(strong.hasAttribute('id')).toBe(false);
    unmount();
  });
});
