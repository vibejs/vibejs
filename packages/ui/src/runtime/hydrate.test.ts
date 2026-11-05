import { describe, expect, test } from 'vitest';
import { thrownCode } from '../../test/codes.ts';
import type { ComponentDef } from '../internal.ts';
import { ref } from '../reactivity/ref.ts';
import { createApp } from './app.ts';
import { setText, template, txt } from './dom.ts';
import { hydrate } from './hydrate.ts';
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

  test('claimHydrationNode misses when hydration has not started', () => {
    expect(claimHydrationNode('P')).toBeUndefined();
    expect(hydrationFailed()).toBe(true);
    stopHydration();
    expect(hydrationFailed()).toBe(false);
  });
});
