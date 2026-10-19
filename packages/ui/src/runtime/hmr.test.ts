// oxlint-disable typescript/unbound-method -- the tests compare, wrap and replace render functions
import { afterEach, expect, test, vi } from 'vitest';
import { warnedCodes } from '../../test/codes.ts';
import type { ComponentDef } from '../internal.ts';
import { effectScope } from '../reactivity/effectScope.ts';
import { ref } from '../reactivity/ref.ts';
import { createApp } from './app.ts';
import type { Block } from './block.ts';
import { createComponent } from './component.ts';
import { hmr } from './hmr.ts';
import { inject } from './inject.ts';
import { currentInstance } from './instance.ts';
import { onMounted, onUnmounted } from './lifecycle.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

let ids = 0;

const emptyRender = (): Block => [];

/** A recorded component with a `count` ref that renders `<p>{label}:{count}</p>` and `children`. */
function recorded(label: string, children: () => ComponentDef[] = () => []) {
  const def: ComponentDef = {
    __hmrId: `hmr-${ids++}`,
    setup: () => ({ count: ref(0) }),
    render: renderLabel(label, children),
  };
  hmr.createRecord(def.__hmrId!, def);
  return { def, id: def.__hmrId! };
}

function renderLabel(label: string, children: () => ComponentDef[] = () => []) {
  return ($setup: Record<string, unknown>): Block => {
    const p = document.createElement('p');
    renderEffect(() => {
      p.textContent = `${label}:${String($setup.count)}`;
    });
    return [p, ...children().map((child) => createComponent(child))];
  };
}

/** Mounts `def` through an app into a new element. */
function mount(def: ComponentDef) {
  const host = document.createElement('div');
  const app = createApp(def);
  app.mount(host);
  return { host, app };
}

test('createRecord returns true once and keeps the first def of an id', () => {
  const { def, id } = recorded('a');
  const other: ComponentDef = { render: () => [] };
  const otherRender = other.render;
  expect(hmr.createRecord(id, other)).toBe(false);
  hmr.rerender(id, emptyRender);
  expect(def.render).toBe(emptyRender);
  expect(other.render).toBe(otherRender);
});

test('rerender keeps the setup state, the instance and the position of the block', async () => {
  const { def, id } = recorded('old');
  let setups = 0;
  const setup = def.setup!;
  def.setup = (props, ctx) => (setups++, setup(props, ctx));
  const states: unknown[] = [];
  let state: Record<string, unknown> = {};
  const parent: ComponentDef = {
    render: () => {
      const child = createComponent(def);
      return [document.createTextNode('<'), child, document.createTextNode('>')];
    },
  };
  const { host } = mount(parent);
  const old = host.querySelector('p')!;
  hmr.rerender(id, ($setup, $props, $ctx) => {
    states.push($setup, $ctx, currentInstance);
    state = $setup;
    return renderLabel('new')($setup);
  });
  expect(host.innerHTML).toBe('&lt;<p>new:0</p>&gt;');
  expect(old.isConnected).toBe(false);
  state.count = Number(state.count) + 1;
  await nextTick();
  expect(host.innerHTML).toBe('&lt;<p>new:1</p>&gt;');
  hmr.rerender(id, ($setup, $props, $ctx) => {
    states.push($setup, $ctx, currentInstance);
    return renderLabel('newer')($setup);
  });
  expect(host.innerHTML).toBe('&lt;<p>newer:1</p>&gt;');
  expect(states.slice(0, 3)).toEqual(states.slice(3));
  expect(states.slice(0, 3).every((value, i) => value === states[i + 3])).toBe(true);
  expect(setups).toBe(1);
});

test('rerender recreates child components and stops the old render effects', async () => {
  const log: string[] = [];
  const count = ref(0);
  const child = (name: string): ComponentDef => ({
    setup: () => {
      onMounted(() => log.push(`${name} mounted`));
      onUnmounted(() => log.push(`${name} unmounted`));
    },
    render: () => document.createTextNode(name),
  });
  const { def, id } = recorded('p');
  def.render = () => {
    renderEffect(() => log.push(`old effect ${count.value}`));
    return createComponent(child('old'));
  };
  const { host } = mount(def);
  hmr.rerender(id, () => createComponent(child('new')));
  expect(host.textContent).toBe('new');
  await nextTick();
  count.value++;
  await nextTick();
  expect(log).toEqual(['old effect 0', 'old mounted', 'old unmounted', 'new mounted']);
});

test('rerender of a block with no node recreates the instance through its parent or the app', () => {
  const { def, id } = recorded('child');
  def.render = emptyRender;
  const parent = recorded('parent', () => [def]);
  const { host } = mount(parent.def);
  hmr.rerender(id, renderLabel('child'));
  expect(host.innerHTML).toBe('<p>parent:0</p><p>child:0</p>');
  hmr.rerender(parent.id, emptyRender);
  expect(host.innerHTML).toBe('');
  hmr.rerender(parent.id, renderLabel('root'));
  expect(host.innerHTML).toBe('<p>root:0</p>');
});

test('rerender of a parentless block with no node outside an app reloads the page', () => {
  const reload = vi.fn<() => void>();
  vi.stubGlobal('location', { reload });
  const { def, id } = recorded('detached');
  def.render = emptyRender;
  const scope = effectScope();
  scope.run(() => createComponent(def));
  hmr.rerender(id, renderLabel('new'));
  expect(reload).toHaveBeenCalledTimes(1);
  scope.stop();
});

test('rerender skips an instance that an earlier rerender unmounted', () => {
  let renders = 0;
  const def: ComponentDef = {
    __hmrId: `hmr-${ids++}`,
    __propKeys: ['inner'],
    render: (_s, $props) => {
      renders++;
      return $props.inner ? [] : createComponent(def, { inner: () => true });
    },
  };
  hmr.createRecord(def.__hmrId!, def);
  mount(def);
  expect(renders).toBe(2);
  hmr.rerender(def.__hmrId!, def.render);
  // The outer instance renders a new inner one; the old inner one is skipped.
  expect(renders).toBe(4);
});

test('reload updates the def in place and rerenders each parent once', () => {
  const { def, id } = recorded('old');
  def.name = 'Old';
  let parentRenders = 0;
  const parent: ComponentDef = {
    render: () => (parentRenders++, [createComponent(def), createComponent(def)]),
  };
  const { host } = mount(parent);
  expect(host.textContent).toBe('old:0old:0');
  const setup = vi.fn<() => Record<string, unknown>>(() => ({ count: ref(5) }));
  hmr.reload(id, { __hmrId: id, setup, render: renderLabel('new') });
  expect(host.textContent).toBe('new:5new:5');
  expect(parentRenders).toBe(2);
  expect(setup).toHaveBeenCalledTimes(2);
  expect(new Set(Object.keys(def))).toEqual(new Set(['__hmrId', 'render', 'setup']));
});

test('reload rerenders a parent once, skipping a parent that an earlier rerender unmounted', () => {
  const { def, id } = recorded('x');
  const setup = vi.fn<() => Record<string, unknown>>(() => ({ count: ref(0) }));
  const inner: ComponentDef = { render: () => createComponent(def) };
  const outer: ComponentDef = { render: () => [createComponent(def), createComponent(inner)] };
  mount(outer);
  hmr.reload(id, { __hmrId: id, setup, render: renderLabel('x') });
  // One new instance under the new outer render, one under its new inner component.
  expect(setup).toHaveBeenCalledTimes(2);
});

test('reload remounts a root in the same container with its props and provides', () => {
  const { def, id } = recorded('root');
  const app = createApp(def, { start: 3 });
  app.provide('key', 'provided');
  const host = document.createElement('div');
  app.mount(host);
  const seen: unknown[] = [];
  hmr.reload(id, {
    __hmrId: id,
    __propKeys: ['start'],
    setup: (props) => {
      seen.push(props.start, inject('key'));
      return { count: ref(props.start) };
    },
    render: renderLabel('new'),
  });
  expect(host.innerHTML).toBe('<p>new:3</p>');
  expect(seen).toEqual([3, 'provided']);
  app.unmount();
  expect(host.innerHTML).toBe('');
  // The unmounted root left the registry.
  hmr.rerender(id, () => {
    throw new Error('not called');
  });
});

test('reload of a parentless instance outside an app reloads the page', () => {
  const reload = vi.fn<() => void>();
  vi.stubGlobal('location', { reload });
  const { def, id } = recorded('detached');
  const scope = effectScope();
  scope.run(() => createComponent(def));
  hmr.reload(id, { ...def });
  expect(reload).toHaveBeenCalledTimes(1);
  scope.stop();
});

test('rerender and reload update instances of a later def object with the same id', () => {
  const { id } = recorded('a');
  // A re-executed module exports a new def under the known id; createRecord keeps the first.
  const later: ComponentDef = {
    __hmrId: id,
    setup: () => ({ count: ref(0) }),
    render: renderLabel('b'),
  };
  expect(hmr.createRecord(id, later)).toBe(false);
  const { host } = mount({ render: () => createComponent(later) });
  hmr.rerender(id, renderLabel('c'));
  expect(host.innerHTML).toBe('<p>c:0</p>');
  hmr.reload(id, { __hmrId: id, setup: () => ({ count: ref(7) }), render: renderLabel('d') });
  expect(host.innerHTML).toBe('<p>d:7</p>');
});

test('rerender and reload of an unknown id warn VIBE5501 and reload the page', () => {
  const reload = vi.fn<() => void>();
  vi.stubGlobal('location', { reload });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  hmr.rerender('unknown', () => []);
  hmr.reload('unknown', { render: () => [] });
  expect(warnedCodes(warn)).toEqual(['VIBE5501', 'VIBE5501']);
  expect(warn.mock.calls[0][0]).toMatch(/no record for the component unknown/);
  expect(reload).toHaveBeenCalledTimes(2);
});

test('an instance of an id without a record registers nothing', () => {
  const def: ComponentDef = { __hmrId: 'never-recorded', render: () => [] };
  const { app } = mount(def);
  app.unmount();
  expect(hmr.createRecord('never-recorded', def)).toBe(true);
});

test('in prod, createComponent registers nothing', () => {
  vi.stubGlobal('__DEV__', false);
  const { def, id } = recorded('prod');
  const render = vi.fn<() => Block>(() => []);
  const { app } = mount(def);
  hmr.rerender(id, render);
  expect(render).not.toHaveBeenCalled();
  app.unmount();
});
