import { describe, expect, test } from 'vitest';
import { thrownCode } from '../test/codes.ts';
import type { ComponentDef } from './internal.ts';
import { ref } from './reactivity/ref.ts';
import { createApp } from './runtime/app.ts';
import { createHead, useHead } from './runtime/head.ts';
import { setText, template, txt } from './runtime/dom.ts';
import { watchEffect } from './runtime/watch.ts';
import { renderToString } from './server.ts';

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
    const def: ComponentDef = {
      setup: () => Promise.resolve({}),
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
