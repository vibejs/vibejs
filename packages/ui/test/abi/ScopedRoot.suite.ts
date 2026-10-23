import { nextTick } from '@usevibejs/ui';
import { expect, test } from 'vitest';
import { mountForTest } from './mount.ts';
import { defineAbiSuite, type AbiSuite } from './suite.ts';

/** The scope id attributes of `el`. */
const scopeIds = (el: Element): string[] =>
  el.getAttributeNames().filter((name) => /^data-vb-[0-9a-f]{8}$/.test(name));

export const ScopedRootSuite: AbiSuite = defineAbiSuite('ScopedRoot', (load) => {
  test('inherits scope ids through single roots, also a v-if root, and not past other content', async () => {
    const def = await load();
    const { el, props, unmount } = mountForTest(def, { open: true });
    const div = el.querySelector('div')!;
    const li = el.querySelector('li')!;
    const own = scopeIds(div).filter((id) => id !== def.__scopeId);
    expect(scopeIds(div)).toHaveLength(2);
    expect(scopeIds(div)).toContain(def.__scopeId);
    expect(own).toHaveLength(1);
    expect(scopeIds(li)).toEqual(own);

    props.open = false;
    await nextTick();
    const p = el.querySelector('p')!;
    expect(el.querySelector('div')).toBeNull();
    expect(scopeIds(p)).toHaveLength(2);
    expect(scopeIds(p)).toContain(def.__scopeId);
    expect(scopeIds(p)).toContain(own[0]);
    unmount();
  });
});
