// @vitest-environment jsdom
// Template features the ABI suites leave out, run on output of the built vibe().
import { mount } from '@vibejs-org/ui/testing';
import { describe, expect, it } from 'vitest';
import Chain from '../test/behavior/Chain.vibe';
import Directives from '../test/behavior/Directives.vibe';
import Keyed from '../test/behavior/Keyed.vibe';
import Modifiers from '../test/behavior/Modifiers.vibe';
import Namespaces from '../test/behavior/Namespaces.vibe';
import Table from '../test/behavior/Table.vibe';

it(':key outside v-for replaces the element on a new key and keeps it on an equal one', async () => {
  const w = mount(Keyed, { props: { user: { id: 1 } } });
  const first = w.element.querySelector('input')!;
  first.value = 'typed';
  await w.setProps({ user: { id: 1 } });
  expect(w.element.querySelector('input')).toBe(first);
  await w.setProps({ user: { id: 2 } });
  const second = w.element.querySelector('input')!;
  expect(second).not.toBe(first);
  expect(second.value).toBe('');
  expect(first.isConnected).toBe(false);
});

it('a v-if / v-else-if / v-else chain renders one branch at a time', async () => {
  const w = mount(Chain, { props: { n: 1 } });
  const one = w.element.firstElementChild!;
  expect(w.element.innerHTML).toContain('<p>one</p>');
  await w.setProps({ n: 2 });
  const two = w.element.firstElementChild!;
  expect(w.element.textContent).toBe('two');
  expect(one.isConnected).toBe(false);
  await w.setProps({ n: 3 });
  expect(w.element.querySelector('span')!.textContent).toBe('other');
  expect(w.element.querySelectorAll('p')).toHaveLength(0);
  expect(two.isConnected).toBe(false);
  await w.setProps({ n: 1 });
  expect(w.element.textContent).toBe('one');
});

/** Mounts Modifiers; `hits()` returns the names emitted since its last call. */
const setup = () => {
  const w = mount(Modifiers);
  const el = (selector: string) => w.element.querySelector(selector)!;
  let seen = 0;
  const hits = () => {
    const all = (w.emitted('hit') ?? []).map(([name]) => name);
    const fresh = all.slice(seen);
    seen = all.length;
    return fresh;
  };
  return { el, hits };
};
const click = (target: Element, init: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));

describe('event modifiers', () => {
  it('.stop keeps the event from the parent', () => {
    const { el, hits } = setup();
    click(el('.stop'));
    expect(hits()).toEqual(['stop']);
  });

  it('.self runs only for events on the element itself', () => {
    const { el, hits } = setup();
    click(el('.self span'));
    expect(hits()).toEqual(['outer']);
    click(el('.self'));
    expect(hits()).toEqual(['self', 'outer']);
  });

  it('.once runs the handler once', () => {
    const { el, hits } = setup();
    click(el('.once'));
    click(el('.once'));
    expect(hits()).toEqual(['once', 'outer', 'outer']);
  });

  it('.capture runs before the handlers of descendants', () => {
    const { el, hits } = setup();
    click(el('.inner'));
    expect(hits()).toEqual(['capture', 'inner', 'outer']);
  });

  it('a key modifier filters by key', () => {
    const { el, hits } = setup();
    const key = (k: string) =>
      el('input').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('a');
    expect(hits()).toEqual([]);
    key('Enter');
    expect(hits()).toEqual(['enter']);
  });

  it('.ctrl.exact runs only with exactly ctrl held', () => {
    const { el, hits } = setup();
    click(el('.exact'));
    click(el('.exact'), { ctrlKey: true, shiftKey: true });
    expect(hits()).toEqual(['outer', 'outer']);
    click(el('.exact'), { ctrlKey: true });
    expect(hits()).toEqual(['exact', 'outer']);
  });
});

it('v-for rows inside <table><tbody> update in place', async () => {
  const w = mount(Table, {
    props: {
      rows: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ],
    },
  });
  const rows = [...w.element.querySelectorAll('tbody > tr')];
  expect(rows.map((r) => r.textContent)).toEqual(['1a', '2b']);
  await w.setProps({
    rows: [
      { id: 1, name: 'x' },
      { id: 2, name: 'y' },
    ],
  });
  const now = [...w.element.querySelectorAll('tbody > tr')];
  expect(now[0]).toBe(rows[0]);
  expect(now.map((r) => r.textContent)).toEqual(['1x', '2y']);
});

it('elements under <svg> and <math> get their namespace and bound attributes update', async () => {
  const w = mount(Namespaces, { props: { size: 4 } });
  const circle = w.element.querySelector('circle')!;
  const space = w.element.querySelector('mspace')!;
  expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
  expect(space.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
  expect(circle.getAttribute('r')).toBe('4');
  await w.setProps({ size: 8 });
  expect(circle.getAttribute('r')).toBe('8');
  expect(space.getAttribute('width')).toBe('8px');
});

it('v-html, v-text and v-show update reactively', async () => {
  const w = mount(Directives, { props: { html: '<b>a</b>', text: '<i>', shown: true } });
  const el = (s: string) => w.element.querySelector<HTMLElement>(s)!;
  expect(el('.html').innerHTML).toBe('<b>a</b>');
  expect(el('.text').textContent).toBe('<i>');
  expect(el('.show').style.display).toBe('');
  await w.setProps({ html: '<em>b</em>', text: 'c', shown: false });
  expect(el('.html').innerHTML).toBe('<em>b</em>');
  expect(el('.text').textContent).toBe('c');
  expect(el('.show').style.display).toBe('none');
});
