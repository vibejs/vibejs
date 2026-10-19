// The wrapper tests, run in jsdom by wrapper.test.ts and in Chromium by wrapper.browser.test.ts.
import { isVibeError } from '@vibejs-org/ui';
import { flushPromises, mount, type DOMWrapper } from '@vibejs-org/ui/testing';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { thrownCode } from '../codes.ts';
import { Controls, Fragment, Greeting, Nested } from './components.ts';

/** Whether `promise` rejects with the VIBE error `code`. */
const rejectsWith = (promise: Promise<unknown>, code: `VIBE${number}`): Promise<void> =>
  expect(promise).rejects.toSatisfy((error) => isVibeError(error, code));

/** The state that Controls renders as JSON. */
const state = (wrapper: ReturnType<typeof mount<typeof Controls>>): Record<string, unknown> =>
  JSON.parse(wrapper.get('p').text());

export function wrapperSuite(): void {
  describe('queries', () => {
    it('finds the root and its descendants by CSS selector, in document order', () => {
      const wrapper = mount(Greeting, { props: { name: 'Ada' } });
      expect(wrapper.find('div').classes()).toEqual(['greeting']);
      expect(wrapper.findAll('div, h1, button').map((w) => w.element.tagName)).toEqual([
        'DIV',
        'H1',
        'BUTTON',
      ]);
      expect(wrapper.get('h1').find('button').exists()).toBe(false);
      expect(wrapper.find('h1').exists()).toBe(true);
    });

    it('types tag-name queries by element', () => {
      const wrapper = mount(Controls);
      const input = wrapper.get('input');
      expectTypeOf(input.element).toEqualTypeOf<HTMLInputElement>();
      expectTypeOf(wrapper.findAll('select')[0].element).toEqualTypeOf<HTMLSelectElement>();
      expectTypeOf(wrapper.find('.x')).toEqualTypeOf<DOMWrapper>();
      expect(input.element).toBeInstanceOf(HTMLInputElement);
    });

    it('queries every root of a fragment and skips its text and comments', () => {
      const wrapper = mount(Fragment);
      expect(wrapper.findAll('p, li').map((w) => w.text())).toEqual(['One', 'A']);
    });

    it('queries only the descendants of an element wrapper', () => {
      const wrapper = mount(Nested);
      expect(
        wrapper
          .get('ul.o')
          .findAll('ul')
          .map((w) => w.classes()),
      ).toEqual([['i']]);
      expect(wrapper.get('li').find('li').text()).toBe('b');
      expect(wrapper.get('ul.i').find('ul').exists()).toBe(false);
    });

    it('throws VIBE7201 from get() with the selector and the HTML', () => {
      const wrapper = mount(Greeting, { props: { name: 'Ada' } });
      expect(thrownCode(() => wrapper.get('.missing'))).toBe('VIBE7201');
      expect(() => wrapper.get('.missing')).toThrowErrorMatchingInlineSnapshot(`
        [VibeError: [VIBE7201] get(.missing) found no element in the rendered HTML: <div class="greeting"><h1>Hello Ada</h1><button type="button">Pick</button><footer></footer></div>
          Fix: Compare the selector with the rendered HTML above.
          Fix: Await the action that renders the element, such as \`trigger()\`, \`setProps()\` or \`flushPromises()\`, before the query.
          Fix: Use \`find()\` and \`exists()\` when the element is expected to be absent.
          Docs: https://vibejs.org/v0/errors/VIBE7201]
      `);
    });

    it('returns an empty wrapper from find() that throws VIBE7202 on use', async () => {
      const empty = mount(Greeting, { props: { name: 'Ada' } }).find('.missing');
      expect(empty.exists()).toBe(false);
      expect(() => empty.element).toThrow(/find\(\.missing\) found no element, so element\(\)/);
      for (const use of [
        () => empty.find('a'),
        () => empty.findAll('a'),
        () => empty.get('a'),
        () => empty.text(),
        () => empty.html(),
        () => empty.attributes(),
        () => empty.classes(),
        () => empty.isVisible(),
      ]) {
        expect(thrownCode(use)).toBe('VIBE7202');
      }
      await rejectsWith(empty.trigger('click'), 'VIBE7202');
      await rejectsWith(empty.setValue('x'), 'VIBE7202');
    });
  });

  describe('output', () => {
    it('reads text, HTML without comment anchors, attributes and classes', () => {
      const wrapper = mount(Fragment);
      expect(wrapper.text()).toBe('OnetextABC');
      expect(wrapper.html()).toBe(
        [
          '<p id="one" title="first">One</p>',
          'text',
          '<ul hidden=""><li class="a b">A</li></ul>',
          '<span style="display: none">B</span>',
          '<i style="visibility: hidden">C</i>',
        ].join('\n'),
      );
      const p = wrapper.get('p');
      expect(p.attributes()).toEqual({ id: 'one', title: 'first' });
      expect(p.attributes('title')).toBe('first');
      expect(p.attributes('lang')).toBeUndefined();
      const li = wrapper.get('li');
      expect(li.classes()).toEqual(['a', 'b']);
      expect(li.classes('b')).toBe(true);
      expect(li.classes('c')).toBe(false);
      expect(mount(Greeting, { props: { name: 'Ada' } }).html()).not.toContain('<!--');
    });

    it('reads the element of a single-root component, and throws VIBE7207 for several roots', () => {
      expect(mount(Greeting, { props: { name: 'Ada' } }).element.tagName).toBe('DIV');
      const wrapper = mount(Fragment);
      expect(() => wrapper.element).toThrow(
        'The component renders 4 root elements, so its wrapper has no single element.',
      );
      expect(thrownCode(() => wrapper.attributes())).toBe('VIBE7207');
    });

    it('reports visibility through hidden, display, visibility and detachment', async () => {
      const wrapper = mount(Fragment);
      expect(wrapper.get('p').isVisible()).toBe(true);
      expect(wrapper.get('ul').isVisible()).toBe(false);
      expect(wrapper.get('li').isVisible()).toBe(false);
      expect(wrapper.get('span').isVisible()).toBe(false);
      expect(wrapper.get('i').isVisible()).toBe(false);
      const controls = mount(Controls);
      expect(controls.get('b').isVisible()).toBe(false);
      await controls.get('input[type=checkbox]').setValue(true);
      expect(controls.get('b').isVisible()).toBe(true);
      const p = wrapper.get('p');
      p.element.remove();
      expect(p.isVisible()).toBe(false);
    });
  });

  describe('trigger', () => {
    it('dispatches native events of the class of their name and awaits the update', async () => {
      const wrapper = mount(Controls);
      const p = wrapper.get('p');
      const seen: string[] = [];
      for (const type of ['click', 'keydown', 'focus', 'input', 'submit']) {
        p.element.addEventListener(type, (e) => seen.push(`${e.type}:${e.constructor.name}`));
      }
      await p.trigger('keydown', { key: 'Enter' });
      expect(state(wrapper).text).toBe('Enter');
      await p.trigger('click');
      expect(state(wrapper).text).toBe('out');
      await p.trigger('focus');
      await p.trigger('input');
      await p.trigger('submit');
      expect(seen).toEqual([
        'keydown:KeyboardEvent',
        'click:MouseEvent',
        'focus:FocusEvent',
        'input:InputEvent',
        'submit:Event',
      ]);
    });

    it('bubbles, can be canceled, and does nothing on a disabled element', async () => {
      const wrapper = mount(Controls);
      let event: Event | undefined;
      wrapper.element.addEventListener('click', (e) => (event = e));
      await wrapper.get('p').trigger('click', { button: 2 });
      expect(event).toMatchObject({ bubbles: true, cancelable: true, button: 2 });
      await wrapper.get('button').trigger('click');
      expect(state(wrapper).text).toBe('out');
      await wrapper.trigger('dblclick');
    });

    it('throws VIBE7203 for an event name with a modifier', async () => {
      const wrapper = mount(Controls);
      await rejectsWith(wrapper.get('p').trigger('click.ctrl'), 'VIBE7203');
      await expect(wrapper.get('p').trigger('keydown.enter')).rejects.toThrow(
        "trigger() received the event name keydown.enter, which has a modifier: pass the key in the event init instead, as in trigger('keydown', { key: 'Enter' }).",
      );
    });
  });

  describe('setValue', () => {
    it('sets text inputs and textareas, dispatching input and change', async () => {
      const wrapper = mount(Controls);
      await wrapper.get('input').setValue('hi');
      await wrapper.get('textarea').setValue(42);
      expect(state(wrapper)).toMatchObject({ text: 'hi', note: '42' });
    });

    it('checks checkboxes and radios', async () => {
      const wrapper = mount(Controls);
      await wrapper.get('input[type=checkbox]').setValue(true);
      await wrapper.get('input[value=m]').setValue(true);
      expect(state(wrapper)).toMatchObject({ agree: true, size: 'm' });
      await wrapper.get('input[type=checkbox]').setValue(false);
      expect(state(wrapper)).toMatchObject({ agree: false });
    });

    it('selects options of single and multiple selects', async () => {
      const wrapper = mount(Controls);
      await wrapper.get('select[multiple]').setValue(['x', 'y']);
      await wrapper.get('select:not([multiple])').setValue('blue');
      expect(state(wrapper)).toMatchObject({ tags: ['x', 'y'], color: 'blue' });
      await wrapper.get('select[multiple]').setValue('y');
      expect(state(wrapper)).toMatchObject({ tags: ['y'] });
    });

    it('throws VIBE7204 on an element without a value', async () => {
      const wrapper = mount(Controls);
      await rejectsWith(wrapper.get('button').setValue('x'), 'VIBE7204');
      await expect(wrapper.get('p').setValue('x')).rejects.toThrow(
        'setValue() cannot set a value on a <p> element.',
      );
    });
  });

  describe('after unmount', () => {
    it('throws VIBE7205 on any use of the component wrapper or its queries', async () => {
      const wrapper = mount(Greeting, { props: { name: 'Ada' } });
      const h1 = wrapper.get('h1');
      wrapper.unmount();
      expect(() => wrapper.text()).toThrow(
        'The wrapper of Greeting was used after the component unmounted.',
      );
      expect(thrownCode(() => h1.exists())).toBe('VIBE7205');
      expect(thrownCode(() => wrapper.emitted())).toBe('VIBE7205');
      await rejectsWith(wrapper.setProps({ name: 'Bob' }), 'VIBE7205');
      await rejectsWith(h1.trigger('click'), 'VIBE7205');
    });
  });

  it('flushPromises resolves after pending promise callbacks', async () => {
    let done = false;
    void Promise.resolve().then(() => (done = true));
    await flushPromises();
    expect(done).toBe(true);
  });
}
