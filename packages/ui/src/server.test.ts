import { isVibeError } from '@usevibejs/errors';
import { describe, expect, test } from 'vitest';
import { thrownCode } from '../test/codes.ts';
import type { ComponentDef } from './internal.ts';
import { ref } from './reactivity/ref.ts';
import { createApp } from './runtime/app.ts';
import { createHead, useHead } from './runtime/head.ts';
import { setText, template, txt } from './runtime/dom.ts';
import { readServerState } from './runtime/serverState.ts';
import { watchEffect } from './runtime/watch.ts';
import { RouterView } from './router/components.ts';
import { createMemoryHistory } from './router/history.ts';
import { createRouter } from './router/router.ts';
import { renderToString, renderToStringAsync } from './server.ts';

/** A root that renders `<p>a&lt;b</p>` and contributes a title and a description. */
const page = (): ComponentDef => ({
  setup: () => {
    useHead({ title: 'Hello', meta: [{ name: 'description', content: 'Hi & you' }] });
  },
  render: () => {
    const el = template('<p> </p>')();
    setText(txt(el), 'a<b');
    return el;
  },
});

describe('renderToString', () => {
  test('returns one document and writes useHead records into the head', () => {
    const marker = document.createElement('i');
    document.body.append(marker);
    const html = renderToString(createApp(page()).use(createHead()));
    expect(html).toBe(
      '<!DOCTYPE html><html><head><title data-vibe-head="">Hello</title><meta content="Hi &amp; you" data-vibe-head="" name="description"></head><body><p>a&lt;b</p></body></html>',
    );
    expect(document.body.contains(marker)).toBe(true);
    expect(document.head.querySelector('[data-vibe-head]')).toBeNull();
    expect(document.createElement('span') instanceof Node).toBe(true);
    marker.remove();
  });

  test('stops effects when the render unmounts', () => {
    const count = ref(0);
    let runs = 0;
    const def: ComponentDef = {
      setup: () => {
        watchEffect(() => {
          runs += 1;
          return count.value;
        });
      },
      render: () => document.createTextNode(''),
    };
    renderToString(createApp(def));
    const seen = runs;
    count.value += 1;
    expect(runs).toBe(seen);
  });

  test('throws VIBE5306 when the app is already mounted', () => {
    const def: ComponentDef = { render: () => document.createTextNode('x') };
    const app = createApp(def);
    app.mount(document.createElement('div'));
    expect(thrownCode(() => renderToString(app))).toBe('VIBE5306');
  });

  test('restores the caller document when setup throws', () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an async setup from untyped code
    const asyncSetup = (async () => {}) as unknown as ComponentDef['setup'];
    const def: ComponentDef = {
      setup: asyncSetup,
      render: () => document.createTextNode(''),
    };
    const marker = document.createElement('b');
    document.body.append(marker);
    document.head.innerHTML = '<meta name="keep" content="yes">';
    expect(thrownCode(() => renderToString(createApp(def)))).toBe('VIBE5204');
    expect(document.body.contains(marker)).toBe(true);
    expect(document.head.innerHTML).toBe('<meta name="keep" content="yes">');
    expect(document.createElement('span') instanceof Node).toBe(true);
    marker.remove();
    document.head.textContent = '';
  });
});

/** A route component whose text is `home`. */
function home(): ComponentDef {
  return {
    render: () => {
      const el = template('<p> </p>')();
      setText(txt(el), 'home');
      return el;
    },
  };
}

/** The code of the rejection from `fn`, when it rejects with a VIBE error. */
async function rejectedCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
  } catch (error) {
    if (isVibeError(error)) return error.code;
  }
  return undefined;
}

describe('renderToStringAsync', () => {
  test('writes the route after the first navigation, including a redirect', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', redirect: '/home' },
        { path: '/home', component: home() },
      ],
    });
    const html = await renderToStringAsync(createApp(RouterView).use(router));
    expect(html).toContain('<body><p>home</p><!----></body>');
    expect(router.currentRoute.value.path).toBe('/home');
  });

  test('waits for a lazy page', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: () => Promise.resolve(home()) }],
    });
    const html = await renderToStringAsync(createApp(RouterView).use(router));
    expect(html).toContain('<p>home</p>');
  });

  test('does not wait when renderToString is used', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: home() }],
    });
    const html = renderToString(createApp(RouterView).use(router));
    expect(html).not.toContain('home');
    await router.isReady();
  });

  test('renders a route that was already committed', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: home() }],
    });
    const app = createApp(RouterView).use(router);
    await router.isReady();
    const html = await renderToStringAsync(app);
    expect(html).toContain('<p>home</p>');
  });

  test('renders the start location when the first navigation is cancelled', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: home() }],
    });
    router.beforeEach(() => false);
    const html = await renderToStringAsync(createApp(RouterView).use(router));
    expect(html).not.toContain('home');
  });

  test('rejects with the navigation error', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: home() }],
    });
    router.beforeEach(() => {
      throw new Error('stop');
    });
    router.onError(() => {});
    await expect(renderToStringAsync(createApp(RouterView).use(router))).rejects.toThrow('stop');
  });

  test('embeds state and escapes a tag', async () => {
    const html = await renderToStringAsync(createApp(home()), {
      state: { query: { user: 'a<b' } },
    });
    expect(html).toContain(
      '<script type="application/json" id="vibe-state">{"query":{"user":"a\\u003cb"}}</script>',
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(readServerState(doc)).toEqual({ query: { user: 'a<b' } });
  });

  test('throws VIBE5309 when state is a cycle or not JSON', async () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(await rejectedCode(() => renderToStringAsync(createApp(home()), { state: cycle }))).toBe(
      'VIBE5309',
    );
    expect(
      await rejectedCode(() => renderToStringAsync(createApp(home()), { state: () => undefined })),
    ).toBe('VIBE5309');
  });

  test('throws VIBE5306 before a navigation that never settles', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: home() }],
    });
    let release: (() => void) | undefined;
    router.beforeEach(
      () =>
        new Promise<void>((done) => {
          release = done;
        }),
    );
    const app = createApp(RouterView).use(router);
    app.mount(document.createElement('div'));
    expect(await rejectedCode(() => renderToStringAsync(app))).toBe('VIBE5306');
    release?.();
    app.unmount();
  });
});
