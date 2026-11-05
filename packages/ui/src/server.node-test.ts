import { describe, expect, test, vi } from 'vitest';
import { thrownCode } from '../test/codes.ts';
import type { ComponentDef } from './internal.ts';
import { createApp } from './runtime/app.ts';
import { setText, template, txt } from './runtime/dom.ts';
import { createHead, useHead } from './runtime/head.ts';
import { createMemoryHistory } from './router/history.ts';
import { createRouter } from './router/router.ts';
import { renderToString, renderToStringAsync } from './server.ts';

vi.hoisted(() => {
  globalThis.__DEV__ = true;
});

function PreviousNode() {}

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

describe('renderToString without a document', () => {
  test('installs a document for the call and removes it', () => {
    Object.assign(globalThis, { Node: PreviousNode });
    const html = renderToString(createApp(page()).use(createHead()));
    expect(html).toBe(
      '<!DOCTYPE html><html><head><title data-vibe-head="">Hello</title><meta content="Hi &amp; you" data-vibe-head="" name="description"></head><body><p>a&lt;b</p></body></html>',
    );
    expect(typeof document).toBe('undefined');
    expect(globalThis.Node).toBe(PreviousNode);
    Reflect.deleteProperty(globalThis, 'Node');
  });

  test('removes the document when setup throws', () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an async setup from untyped code
    const asyncSetup = (async () => {}) as unknown as ComponentDef['setup'];
    const def: ComponentDef = {
      setup: asyncSetup,
      render: () => document.createTextNode(''),
    };
    expect(thrownCode(() => renderToString(createApp(def)))).toBe('VIBE5204');
    expect(typeof document).toBe('undefined');
    expect('Element' in globalThis).toBe(false);
  });
});

describe('renderToStringAsync without a document', () => {
  test('installs a document, writes the state, and removes the document', async () => {
    const html = await renderToStringAsync(createApp(page()).use(createHead()), {
      state: { query: { ok: true } },
    });
    expect(html).toContain('<title data-vibe-head="">Hello</title>');
    expect(html).toContain(
      '<script type="application/json" id="vibe-state">{"query":{"ok":true}}</script>',
    );
    expect(typeof document).toBe('undefined');
  });

  test('removes the document when the first navigation throws', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/' }] });
    router.beforeEach(() => {
      throw new Error('stop');
    });
    router.onError(() => {});
    await expect(renderToStringAsync(createApp(page()).use(router))).rejects.toThrow('stop');
    expect(typeof document).toBe('undefined');
  });
});
