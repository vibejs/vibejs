import { afterEach, describe, expect, it } from 'vitest';
import { effectScope } from '../reactivity/effectScope.ts';
import { ref } from '../reactivity/ref.ts';
import { createApp } from './app.ts';
import { createHead, useHead } from './head.ts';

afterEach(() => {
  document.head.querySelectorAll('[data-vibe-head]').forEach((node) => node.remove());
  document.body.textContent = '';
});

const titles = (): string[] =>
  [...document.head.querySelectorAll('title')].map((node) => node.textContent);

const host = (): HTMLElement => {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
};

describe('useHead', () => {
  it('creates a head when none exists, then follows the latest createHead()', () => {
    useHead({ title: 'First' });
    expect(titles()).toEqual(['First']);
    const head = createHead();
    useHead({ title: 'Second', link: [{ href: '/x' }] });
    expect(head.tags()).toEqual([
      { tag: 'title', props: {}, text: 'Second' },
      { tag: 'link', props: { href: '/x' } },
    ]);
    expect(titles()).toEqual(['Second']);
  });

  it('uses an installed head instead of the one created later', () => {
    const installed = createHead();
    const later = createHead();
    const el = host();
    const app = createApp({
      setup() {
        useHead({ title: 'Injected' });
      },
      render: () => document.createTextNode(''),
    });
    app.use(installed).mount(el);
    expect(installed.tags()).toEqual([{ tag: 'title', props: {}, text: 'Injected' }]);
    expect(later.tags()).toEqual([]);
    app.unmount();
    expect(installed.tags()).toEqual([]);
    expect(document.head.querySelector('[data-vibe-head]')).toBeNull();
  });

  it('falls back to the active head when the app did not install one', () => {
    const head = createHead();
    const el = host();
    const app = createApp({
      setup() {
        useHead({ meta: [{ name: 'robots', content: 'none', skip: undefined }] });
      },
      render: () => document.createTextNode(''),
    });
    app.mount(el);
    expect(head.tags()).toEqual([{ tag: 'meta', props: { name: 'robots', content: 'none' } }]);
    app.unmount();
    expect(head.tags()).toEqual([]);
  });
});

describe('createHead', () => {
  it('writes title, meta, and link tags and lets a later entry win', () => {
    const head = createHead();
    const title = ref('Hello');
    head.use(() => ({
      title: title.value,
      meta: [
        { name: 'description', content: 'A page', ignored: null },
        { property: 'og:title', content: 1 },
        { 'http-equiv': 'refresh', content: '0' },
        { id: 'theme', content: 'dark' },
        { content: 'loose' },
      ],
      link: [
        { rel: 'icon', href: '/a.png' },
        { rel: 'stylesheet', href: '/app.css' },
      ],
    }));
    expect(head.tags()).toEqual([
      { tag: 'title', props: {}, text: 'Hello' },
      { tag: 'meta', props: { name: 'description', content: 'A page' } },
      { tag: 'meta', props: { property: 'og:title', content: '1' } },
      { tag: 'meta', props: { 'http-equiv': 'refresh', content: '0' } },
      { tag: 'meta', props: { id: 'theme', content: 'dark' } },
      { tag: 'meta', props: { content: 'loose' } },
      { tag: 'link', props: { rel: 'icon', href: '/a.png' } },
      { tag: 'link', props: { rel: 'stylesheet', href: '/app.css' } },
    ]);
    expect(titles()).toEqual(['Hello']);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'A page',
    );

    title.value = 'Next';
    expect(titles()).toEqual(['Next']);
    head.use({
      title: 'Last',
      meta: [{ name: 'description', content: 'Later' }],
      link: [{ rel: 'icon' }],
    });
    expect(head.tags()[0]).toEqual({ tag: 'title', props: {}, text: 'Last' });
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Later',
    );
    expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(2);
  });

  it('drops a contribution when its scope stops', () => {
    const head = createHead();
    const scope = effectScope();
    scope.run(() => head.use({ title: 'Scoped', meta: [], link: [] }));
    expect(titles()).toEqual(['Scoped']);
    scope.stop();
    expect(head.tags()).toEqual([]);
    expect(titles()).toEqual([]);
  });
});
