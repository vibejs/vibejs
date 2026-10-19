// Mounts unmount when their test finishes; the tests run in order and share the document.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Anonymous, Greeting } from '../../test/testing/components.ts';
import { mount } from './mount.ts';
import type { ComponentWrapper } from './wrapper.ts';

describe('auto-unmount', () => {
  let kept: ComponentWrapper<typeof Anonymous>;
  let each: ComponentWrapper<typeof Greeting>;

  beforeAll(() => {
    kept = mount(Anonymous);
  });

  beforeEach(() => {
    each = mount(Greeting, { props: { name: 'each' } });
  });

  it('A: mounts in beforeEach and in the test body', () => {
    mount(Greeting, { props: { name: 'body' } });
    expect(document.body.textContent).toContain('Hello each');
    expect(document.body.textContent).toContain('Hello body');
  });

  it('B: finds only the beforeAll mount and this test beforeEach mount', () => {
    expect(document.body.childElementCount).toBe(2);
    expect(document.body.textContent).not.toContain('Hello body');
    expect(kept.text()).toBe('0');
    expect(each.text()).toBe('Hello eachPick');
  });

  it('C: lets a test unmount by hand before it finishes, idempotently', () => {
    each.unmount();
    each.unmount();
    expect(document.body.childElementCount).toBe(1);
  });

  it('D: keeps the beforeAll mount until it is unmounted by hand', () => {
    expect(document.body.childElementCount).toBe(2);
    kept.unmount();
    kept.unmount();
    expect(document.body.childElementCount).toBe(1);
  });
});
