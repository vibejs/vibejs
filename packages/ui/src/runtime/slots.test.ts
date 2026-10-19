import { afterEach, expect, test, vi } from 'vitest';
import type { Slots } from '../component.ts';
import type { ComponentDef } from '../internal.ts';
import { ref } from '../reactivity/ref.ts';
import { createApp } from './app.ts';
import type { Block } from './block.ts';
import { createComponent } from './component.ts';
import { currentInstance, type ComponentInstance } from './instance.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';
import { createSlot, useSlots, type RawSlots } from './slots.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const text = (value: string) => (): Block => document.createTextNode(value);

/** Mounts a parent whose render creates `child` with `slots`, and returns the host element. */
function mount(child: ComponentDef, slots: RawSlots) {
  const host = document.createElement('div');
  createApp({ name: 'Parent', render: () => createComponent(child, null, slots) }).mount(host);
  return host;
}

/** `raw` with `$` entries, typed as raw slots. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `$` holds entries, not slots
const withEntries = (raw: object): RawSlots => raw as RawSlots;

test('useSlots() lists the static and v-if slots and binds them to the owner', () => {
  const show = ref(true);
  let slots!: Slots;
  let owner: ComponentInstance | null = null;
  const host = mount(
    {
      setup: () => {
        slots = useSlots();
      },
      render: () => slots.default!({}),
    },
    withEntries({
      default: () => {
        owner = currentInstance;
        return document.createTextNode('content');
      },
      $: [() => (show.value ? { name: 'extra', fn: text('x') } : null), () => undefined],
    }),
  );
  expect(host.textContent).toBe('content');
  expect(owner!.name).toBe('Parent');
  expect(Object.keys(slots)).toEqual(['default', 'extra']);
  expect('extra' in slots).toBe(true);
  expect(Object.getOwnPropertyDescriptor(slots, 'default')?.enumerable).toBe(true);
  expect(Object.getOwnPropertyDescriptor(slots, 'missing')).toBeUndefined();
  expect(Reflect.get(slots, Symbol.iterator)).toBeUndefined();
  show.value = false;
  expect(Object.keys(slots)).toEqual(['default']);
  expect(slots.extra).toBeUndefined();
});

test('useSlots() returns an empty object with VIBE5205 outside setup', () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(useSlots()).toEqual({});
  expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^\[VIBE5205\] useSlots\(\)/));
});

test('createSlot passes reactive slot props and renders the last v-if slot', async () => {
  const count = ref(0);
  const which = ref<'a' | 'b' | null>('a');
  const child: ComponentDef = { render: () => createSlot('default', { count: () => count.value }) };
  const host = mount(
    child,
    withEntries({
      default: (props: { count: number }) => {
        const node = document.createTextNode('');
        renderEffect(() => {
          node.data = `static ${props.count}`;
        });
        return node;
      },
      $: [
        () => (which.value === 'a' ? { name: 'default', fn: text('a') } : null),
        () => (which.value === 'b' ? { name: 'default', fn: text('b') } : null),
      ],
    }),
  );
  expect(host.textContent).toBe('a');
  which.value = 'b';
  await nextTick();
  expect(host.textContent).toBe('b');
  which.value = null;
  await nextTick();
  expect(host.textContent).toBe('static 0');
  count.value++;
  await nextTick();
  expect(host.textContent).toBe('static 1');
});

test('createSlot renders the fallback only while the slot is absent, and nothing without one', () => {
  const child: ComponentDef = {
    render: () => [createSlot('header', null, text('fallback')), createSlot('footer')],
  };
  expect(mount(child, {}).textContent).toBe('fallback');
  expect(mount(child, { header: text('given') }).textContent).toBe('given');
});

test('createSlot without props passes an empty props object', () => {
  let keys: string[] = [];
  const child: ComponentDef = { render: () => createSlot('default') };
  mount(child, {
    default: (props: object) => {
      keys = Object.keys(props);
      return [];
    },
  });
  expect(keys).toEqual([]);
});
