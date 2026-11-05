import { isVibeError } from '@usevibejs/errors';
import { describe, expect, test } from 'vitest';
import { thrownCode } from '../../test/codes.ts';
import type { ComponentDef } from '../internal.ts';
import { ref } from '../reactivity/ref.ts';
import { createApp } from './app.ts';
import { setText, template, txt } from './dom.ts';
import { renderToStringAsync } from '../server.ts';
import { hydrate, hydrateAsync } from './hydrate.ts';
import { RouterView } from '../router/components.ts';
import { createMemoryHistory } from '../router/history.ts';
import { createRouter } from '../router/router.ts';
import { claimHydrationNode, hydrationFailed, stopHydration } from './hydrateState.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';

/** A root whose text is `read()`. The compiler emits this shape: one template, then `setText`. */
function paragraph(read: () => string): ComponentDef {
  const view = template('<p> </p>');
  return {
    render: () => {
      const el = view();
      renderEffect(() => setText(txt(el), read()));
      return el;
    },
  };
}

/** An app whose router shows the `home` paragraph. */
function homeApp(): ReturnType<typeof createApp> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: paragraph(() => 'home') }],
  });
  return createApp(RouterView).use(router);
}

/** The VIBE code of a rejected `hydrateAsync`, if it rejects with one. */
async function rejectedHydrate(
  app: ReturnType<typeof createApp>,
  host: Element,
): Promise<string | undefined> {
  try {
    await hydrateAsync(app, host);
  } catch (error) {
    if (isVibeError(error)) return error.code;
  }
  return undefined;
}

describe('hydrate', () => {
  test('reuses the server node when the text matches', async () => {
    const text = ref('Hi');
    const host = document.createElement('div');
    host.innerHTML = '<p>Hi</p>';
    const node = host.firstChild;
    hydrate(createApp(paragraph(() => text.value)), host);
    expect(host.firstChild).toBe(node);
    expect(host.innerHTML).toBe('<p>Hi</p>');
    text.value = 'Yo';
    await nextTick();
    expect(host.textContent).toBe('Yo');
  });

  test('throws VIBE5307 and keeps the server text when the text differs', () => {
    const host = document.createElement('div');
    host.innerHTML = '<p>Hi</p>';
    expect(thrownCode(() => hydrate(createApp(paragraph(() => 'Bye')), host))).toBe('VIBE5307');
    expect(host.innerHTML).toBe('<p>Hi</p>');
  });

  test('throws VIBE5307 when the server tag is different', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div>Hi</div>';
    expect(thrownCode(() => hydrate(createApp(paragraph(() => 'Hi')), host))).toBe('VIBE5307');
    expect(host.innerHTML).toBe('<div>Hi</div>');
  });

  test('throws VIBE5307 when the container is empty', () => {
    const host = document.createElement('div');
    expect(thrownCode(() => hydrate(createApp(paragraph(() => 'Hi')), host))).toBe('VIBE5307');
    expect(host.innerHTML).toBe('');
  });

  test('throws VIBE5308 when the app is already mounted', () => {
    const host = document.createElement('div');
    host.innerHTML = '<p>Hi</p>';
    const app = createApp(paragraph(() => 'Hi'));
    app.mount(document.createElement('div'));
    expect(thrownCode(() => hydrate(app, host))).toBe('VIBE5308');
    expect(host.innerHTML).toBe('<p>Hi</p>');
  });

  test('mount still replaces the container', () => {
    const host = document.createElement('div');
    host.innerHTML = '<p>Hi</p>';
    createApp(paragraph(() => 'Hi')).mount(host);
    expect(host.innerHTML).toBe('<p>Hi</p>');
    expect(host.firstChild).toBeInstanceOf(HTMLParagraphElement);
  });

  test('hydrateAsync reuses the route the server rendered', async () => {
    const html = await renderToStringAsync(homeApp());
    const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
    const host = document.createElement('div');
    host.innerHTML = body;
    const node = host.querySelector('p');
    await hydrateAsync(homeApp(), host);
    expect(host.querySelector('p')).toBe(node);
    expect(host.textContent).toBe('home');
  });

  test('hydrateAsync throws VIBE5307 and keeps the server text', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: paragraph(() => 'home') }],
    });
    const host = document.createElement('div');
    host.innerHTML = '<p>other</p>';
    expect(await rejectedHydrate(createApp(RouterView).use(router), host)).toBe('VIBE5307');
    expect(host.innerHTML).toBe('<p>other</p>');
  });

  test('hydrateAsync throws VIBE5308 before a navigation that never settles', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: paragraph(() => 'home') }],
    });
    let release: (() => void) | undefined;
    router.beforeEach(
      () =>
        new Promise<void>((done) => {
          release = done;
        }),
    );
    const host = document.createElement('div');
    host.innerHTML = '<p>home</p>';
    const app = createApp(RouterView).use(router);
    app.mount(document.createElement('div'));
    expect(await rejectedHydrate(app, host)).toBe('VIBE5308');
    expect(host.innerHTML).toBe('<p>home</p>');
    release?.();
    app.unmount();
  });

  test('claimHydrationNode misses when hydration has not started', () => {
    expect(claimHydrationNode('P')).toBeUndefined();
    expect(hydrationFailed()).toBe(true);
    stopHydration();
    expect(hydrationFailed()).toBe(false);
  });
});
