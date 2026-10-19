import { describe, expect, it, vi } from 'vitest';
import { thrownCode } from '../../test/codes.ts';
import { Anonymous, Greeting, Themed } from '../../test/testing/components.ts';
import { inject, onUnmounted, ref, type App, type Plugin } from '../index.ts';
import * as testing from '../testing.ts';
import { appendRenderedHtml, flushPromises, mount, mountComposable } from './mount.ts';

describe('@vibejs-org/ui/testing', () => {
  it('exports exactly mount, mountComposable and flushPromises', () => {
    expect(new Set(Object.keys(testing))).toEqual(
      new Set(['flushPromises', 'mount', 'mountComposable']),
    );
  });
});

describe('mount', () => {
  it('renders through an app, with reactive props that setProps updates', async () => {
    const wrapper = mount(Greeting, { props: { name: 'Ada' } });
    expect(wrapper.get('h1').text()).toBe('Hello Ada');
    expect(wrapper.classes()).toEqual(['greeting']);
    const done = wrapper.setProps({ name: 'Bob', count: 2 });
    expect(wrapper.get('h1').text()).toBe('Hello Ada');
    await done;
    expect(wrapper.get('h1').text()).toBe('Hello Bob');
    expect(wrapper.classes()).toEqual(['greeting', 'active']);
  });

  it('applies provide, and installs plugins in order', () => {
    const order: string[] = [];
    const first: Plugin = (app: App) => {
      order.push('first');
      app.provide('plugin', 'one');
    };
    const second: Plugin = {
      install: (app: App) => {
        order.push('second');
        app.provide('plugin', 'two');
      },
    };
    const key = Symbol('theme');
    const wrapper = mount(Themed, {
      provide: { theme: 'dark', [key]: 'x' },
      plugins: [first, second],
    });
    expect(order).toEqual(['first', 'second']);
    expect(wrapper.text()).toBe('dark two');
  });

  it('records every declared event in order, and still calls the on* listeners', async () => {
    const onPick = vi.fn<(id: string) => void>();
    const onPickItem = vi.fn<(id: string, index: number) => void>();
    const wrapper = mount(Greeting, { props: { name: 'Ada', onPick, 'onPick-item': onPickItem } });
    expect(wrapper.emitted()).toEqual({});
    expect(wrapper.emitted('pick')).toBeUndefined();
    await wrapper.get('button').trigger('click');
    const later = vi.fn<(id: string) => void>();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a non-function listener from untyped code
    await wrapper.setProps({ onPick: later, 'onPick-item': 'not a function' as never });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted()).toEqual({
      pick: [['a'], ['a']],
      'pick-item': [
        ['b', 1],
        ['b', 1],
      ],
    });
    expect(wrapper.emitted('pick-item')).toEqual([
      ['b', 1],
      ['b', 1],
    ]);
    expect(onPick).toHaveBeenCalledExactlyOnceWith('a');
    expect(onPickItem).toHaveBeenCalledExactlyOnceWith('b', 1);
    expect(later).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('renders string, component and function slots', () => {
    const strong = document.createElement('strong');
    strong.textContent = 'node';
    const wrapper = mount(Greeting, {
      props: { name: 'Ada', count: 3 },
      slots: { default: ({ count }) => `count ${count}`, footer: Anonymous },
    });
    expect(wrapper.html()).toContain(
      '<h1>Hello Ada</h1><button type="button">Pick</button>count 3<footer><p>0</p></footer>',
    );
    expect(
      mount(Greeting, {
        props: { name: 'Ada' },
        slots: { default: 'text', footer: () => strong },
      }).html(),
    ).toContain('text<footer><strong>node</strong></footer>');
    const nodes = [document.createElement('hr'), document.createTextNode('end')];
    expect(
      mount(Greeting, { props: { name: 'Ada' }, slots: { footer: () => nodes } }).html(),
    ).toContain('<footer><hr>end</footer>');
  });

  it('appends a new host element to attachTo, an element or a selector', () => {
    const target = document.createElement('section');
    target.id = 'target';
    target.innerHTML = '<p>kept</p>';
    document.body.append(target);
    const first = mount(Anonymous, { attachTo: target });
    const second = mount(Anonymous, { attachTo: '#target' });
    expect(target.innerHTML).toBe('<p>kept</p><div><p>0</p></div><div><p>0</p></div>');
    first.unmount();
    second.unmount();
    expect(target.innerHTML).toBe('<p>kept</p>');
    target.remove();
    expect(thrownCode(() => mount(Anonymous, { attachTo: '#target' }))).toBe('VIBE7208');
  });

  it('throws VIBE7206 with the fix for each rejected option', () => {
    const messages = ['global', 'stubs', 'shallow', 'data', 'attrs'].map((option) => {
      try {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-assertion -- options from untyped code
        mount(Anonymous, { [option]: {} } as never);
      } catch (error) {
        return String(error).split('\n')[0];
      }
      return '';
    });
    expect(messages).toMatchInlineSnapshot(`
      [
        "VibeError: [VIBE7206] mount() does not take the option global: pass \`plugins\` and \`provide\` as top-level options.",
        "VibeError: [VIBE7206] mount() does not take the option stubs: mock the child's module instead, as in \`vi.mock('./Child.vibe')\`.",
        "VibeError: [VIBE7206] mount() does not take the option shallow: mock each child's module instead, as in \`vi.mock('./Child.vibe')\`.",
        "VibeError: [VIBE7206] mount() does not take the option data: pass the starting state in \`props\`.",
        "VibeError: [VIBE7206] mount() does not take the option attrs: pass attributes in \`props\`.",
      ]
    `);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- options from untyped code
    expect(thrownCode(() => mount(Anonymous, { global: {} } as never))).toBe('VIBE7206');
  });

  it('names a component without a name Anonymous', () => {
    const wrapper = mount(Anonymous);
    wrapper.unmount();
    expect(() => wrapper.html()).toThrow('The wrapper of Anonymous');
  });
});

describe('mountComposable', () => {
  it('runs the function as a setup with provide and plugins, and unmounts', () => {
    const unmounted = vi.fn<() => void>();
    const composable = mountComposable(
      () => {
        onUnmounted(unmounted);
        return { theme: inject('theme'), plugin: inject('plugin'), count: ref(1) };
      },
      { provide: { theme: 'dark' }, plugins: [(app: App) => app.provide('plugin', 'on')] },
    );
    expect(composable.result.theme).toBe('dark');
    expect(composable.result.plugin).toBe('on');
    expect(composable.result.count.value).toBe(1);
    composable.unmount();
    composable.unmount();
    expect(unmounted).toHaveBeenCalledOnce();
  });
});

describe('flushPromises', () => {
  it('resolves under fake timers', async () => {
    vi.useFakeTimers();
    try {
      let done = false;
      void Promise.resolve().then(() => (done = true));
      await flushPromises();
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fake test context
const ctx = (result: object | undefined) => ({ task: { result } }) as never;

describe('appendRenderedHtml', () => {
  it('appends the HTML to the first error of a failed test', () => {
    const errors = [{ message: 'expected 1 to be 2' }, { message: 'second' }];
    appendRenderedHtml(ctx({ state: 'fail', errors }), 'Card', '<p>x</p>');
    expect(errors).toEqual([
      { message: 'expected 1 to be 2\n\nRendered HTML of Card:\n<p>x</p>' },
      { message: 'second' },
    ]);
  });

  it('leaves passed tests and failures without errors untouched', () => {
    const errors = [{ message: 'kept' }];
    appendRenderedHtml(ctx({ state: 'pass', errors }), 'Card', '<p>x</p>');
    appendRenderedHtml(ctx({ state: 'fail' }), 'Card', '<p>x</p>');
    appendRenderedHtml(ctx(undefined), 'Card', '<p>x</p>');
    expect(errors).toEqual([{ message: 'kept' }]);
  });
});
