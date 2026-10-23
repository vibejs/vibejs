import { nextTick, ref } from '@usevibejs/ui';
import { renderEffect, setText, type RawSlots, type Slot } from '@usevibejs/ui/internal';
import { expect, test } from 'vitest';
import { mountForTest } from './mount.ts';
import { defineAbiSuite, type AbiSuite } from './suite.ts';

const text = (value: string) => () => document.createTextNode(value);

export const CardSuite: AbiSuite = defineAbiSuite('Card', (load) => {
  test('renders the fallback of an absent slot and nothing for an absent slot without one', async () => {
    const { el, unmount } = mountForTest(await load());
    expect(el.querySelector('header')!.textContent).toBe('Untitled');
    expect(el.querySelector('footer')!.textContent).toBe('');
    unmount();
  });

  test('renders named slots instead of the fallback', async () => {
    const { el, unmount } = mountForTest(
      await load(),
      {},
      {
        slots: { header: text('Title'), footer: text('End') },
      },
    );
    expect(el.querySelector('header')!.textContent).toBe('Title');
    expect(el.querySelector('footer')!.textContent).toBe('End');
    unmount();
  });

  test('passes reactive slot props to a scoped slot', async () => {
    const seen: unknown[] = [];
    const scoped: Slot<{ count: number }> = (props) => {
      seen.push(props);
      const node = document.createTextNode('');
      renderEffect(() => setText(node, `count ${props.count}`));
      return node;
    };
    const { el, unmount } = mountForTest(await load(), {}, { slots: { default: scoped } });
    expect(el.querySelector('article')!.textContent).toContain('count 0');
    el.querySelector('button')!.click();
    await nextTick();
    expect(el.querySelector('article')!.textContent).toContain('count 1');
    expect(seen).toHaveLength(1);
    expect(Object.keys(seen[0] as object)).toEqual(['count']);
    unmount();
  });

  test('swaps a v-if slot and its fallback', async () => {
    const show = ref(false);
    const { el, unmount } = mountForTest(
      await load(),
      {},
      {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `$` holds entries, not slots
        slots: {
          $: [() => (show.value ? { name: 'header', fn: text('Shown') } : null)],
        } as RawSlots,
      },
    );
    const header = el.querySelector('header')!;
    expect(header.textContent).toBe('Untitled');
    show.value = true;
    await nextTick();
    expect(header.textContent).toBe('Shown');
    show.value = false;
    await nextTick();
    expect(header.textContent).toBe('Untitled');
    unmount();
  });
});
