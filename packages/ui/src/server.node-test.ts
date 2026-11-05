import { describe, expect, test, vi } from 'vitest';
import { thrownCode } from '../test/codes.ts';
import type { ComponentDef } from './internal.ts';
import { createApp } from './runtime/app.ts';
import { setText, template, txt } from './runtime/dom.ts';
import { createHead, useHead } from './runtime/head.ts';
import { renderToString } from './server.ts';

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
    const def: ComponentDef = {
      setup: () => Promise.resolve({}),
      render: () => document.createTextNode(''),
    };
    expect(thrownCode(() => renderToString(createApp(def)))).toBe('VIBE5204');
    expect(typeof document).toBe('undefined');
    expect('Element' in globalThis).toBe(false);
  });
});
