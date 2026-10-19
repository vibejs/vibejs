import { isVibeError } from '@vibejs-org/errors';
import { nextTick, onMounted, onUnmounted } from '@vibejs-org/ui';
import { renderEffect, type ComponentDef } from '@vibejs-org/ui/internal';
import { expect, test } from 'vitest';
import { mountForTest } from './mount.ts';
import { defineAbiSuite, type AbiSuite } from './suite.ts';

/** A component that renders `<tag>label</tag>` and logs its mount and unmount. */
const logged = (tag: string, log: string[]): ComponentDef => ({
  name: tag,
  __propKeys: ['label'],
  setup() {
    onMounted(() => log.push(`${tag} mounted`));
    onUnmounted(() => log.push(`${tag} unmounted`));
  },
  render(_$setup, $props) {
    const el = document.createElement(tag);
    renderEffect(() => {
      el.textContent = String($props.label);
    });
    return el;
  },
});

export const DynamicSuite: AbiSuite = defineAbiSuite('Dynamic', (load) => {
  test('remounts when the component changes and passes props and attributes', async () => {
    const log: string[] = [];
    const a = logged('b', log);
    const b = logged('i', log);
    const { el, props, unmount } = mountForTest(await load(), { is: a, label: 'x', class: 'c' });
    expect(el.innerHTML).toBe('<b class="c">x</b><!---->');
    props.label = 'y';
    await nextTick();
    expect(el.innerHTML).toBe('<b class="c">y</b><!---->');
    props.is = b;
    await nextTick();
    expect(el.innerHTML).toBe('<i class="c">y</i><!---->');
    expect(log).toEqual(['b mounted', 'b unmounted', 'i mounted']);
    unmount();
    expect(log.at(-1)).toBe('i unmounted');
  });

  test('renders nothing for null and undefined', async () => {
    const { el, props, unmount } = mountForTest(await load(), { is: null, label: 'x' });
    expect(el.innerHTML).toBe('<!---->');
    props.is = logged('b', []);
    await nextTick();
    expect(el.textContent).toBe('x');
    props.is = undefined;
    await nextTick();
    expect(el.innerHTML).toBe('<!---->');
    unmount();
  });

  test('reports a value that is not a component as VIBE5207', async () => {
    const errors: unknown[] = [];
    const { app, el, props, unmount } = mountForTest(await load(), { is: null, label: 'x' });
    app.config.errorHandler = (err) => errors.push(err);
    props.is = 'div';
    await nextTick();
    expect(errors).toHaveLength(1);
    expect(isVibeError(errors[0], 'VIBE5207')).toBe(true);
    expect(el.innerHTML).toBe('<!---->');
    unmount();
  });
});
