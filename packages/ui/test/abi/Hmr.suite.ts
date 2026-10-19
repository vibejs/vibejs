import { nextTick } from '@vibejs-org/ui';
import { hmr, type ComponentDef } from '@vibejs-org/ui/internal';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { mountForTest } from './mount.ts';
import { defineAbiSuite, type AbiSuite } from './suite.ts';

/** A render that calls the render of `source` and adds `className` to the root element. */
const withClass =
  (source: ComponentDef, className: string, seen: unknown[] = []): ComponentDef['render'] =>
  ($setup, $props, $ctx) => {
    seen.push($setup);
    const block = source.render($setup, $props, $ctx);
    if (block instanceof Element) block.classList.add(className);
    return block;
  };

export const HmrSuite: AbiSuite = defineAbiSuite('Hmr', (load) => {
  let def: ComponentDef;
  let saved: ComponentDef;
  let id: string;

  beforeEach(async () => {
    def = await load();
    saved = { ...def };
    id = def.__hmrId!;
    hmr.createRecord(id, def);
  });

  afterEach(() => {
    hmr.reload(id, saved);
  });

  test('rerender replaces the markup in place and keeps the count', async () => {
    const { el, unmount } = mountForTest(def);
    const after = document.createComment('after');
    el.append(after);
    const old = el.firstElementChild!;
    el.querySelector('button')!.click();
    el.querySelector('button')!.click();
    await nextTick();
    const seen: unknown[] = [];
    hmr.rerender(id, withClass(saved, 'edited', seen));
    const root = el.firstElementChild!;
    expect(old.isConnected).toBe(false);
    expect(root.parentNode).toBe(el);
    expect(root.nextSibling).toBe(after);
    expect(root.classList.contains('edited')).toBe(true);
    expect(root.hasAttribute(def.__scopeId!)).toBe(true);
    expect(root.querySelector('button')!.textContent).toBe('2');
    expect(root.querySelector('.badge')).not.toBeNull();
    root.querySelector('button')!.click();
    await nextTick();
    expect(root.querySelector('button')!.textContent).toBe('3');
    hmr.rerender(id, withClass(saved, 'again', seen));
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
    unmount();
  });

  test('reload keeps the def object, recreates the component and drops removed keys', async () => {
    const { el, unmount } = mountForTest(def);
    el.querySelector('button')!.click();
    await nextTick();
    expect(el.querySelector('button')!.textContent).toBe('1');
    const { __file: _file, ...edited } = saved;
    hmr.reload(id, { ...edited, render: withClass(saved, 'reloaded', []) });
    expect(await load()).toBe(def);
    expect(Object.hasOwn(def, '__file')).toBe(false);
    expect(el.querySelector('.reloaded button')!.textContent).toBe('0');
    expect(el.querySelector('.badge')).not.toBeNull();
    unmount();
  });
});
