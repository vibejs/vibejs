// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/__tests__/apiLifecycle.spec.ts (MIT)
//
// Components are ComponentDefs whose render builds the DOM directly instead of returning vnodes.
// Differences: `beforeMount` runs when the component is first inserted, after its render, so a
// child's `beforeMount` runs before its parent's; `updated` hooks run in the order their instances
// first updated in the flush. Dropped: onRenderTracked and onRenderTriggered (not supported), the
// KeepAlive case, and 'immediately trigger unmount during rendering' (a render effect does not
// rerun for a write it makes to its own dependencies while it runs).
// oxlint-disable unicorn/consistent-function-scoping -- ported as upstream wrote it
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentDef } from '../internal.ts';
import { ref } from '../reactivity/ref.ts';
import { createApp } from './app.ts';
import { createIf, insert } from './block.ts';
import { createComponent } from './component.ts';
import {
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onErrorCaptured,
  onMounted,
  onUnmounted,
  onUpdated,
} from './lifecycle.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Mounts `def` into a new element and returns it with its app. */
function render(def: ComponentDef) {
  const root = document.createElement('div');
  const app = createApp(def);
  app.mount(root);
  return { root, app };
}

/** A component that renders `<div>{{ text() }}</div>`. */
const div = (setup: () => void, text: () => unknown = () => ''): ComponentDef => ({
  setup,
  render: () => {
    const el = document.createElement('div');
    renderEffect(() => {
      el.textContent = String(text());
    });
    return el;
  },
});

describe('api: lifecycle hooks', () => {
  it('onBeforeMount', () => {
    let root!: HTMLElement;
    const fn = vi.fn<() => void>(() => {
      // should be called before the div is inserted
      expect(root.innerHTML).toBe('');
    });
    root = document.createElement('div');
    createApp(div(() => onBeforeMount(fn))).mount(root);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith();
  });

  it('onMounted', () => {
    let root!: HTMLElement;
    const fn = vi.fn<() => void>(() => {
      // should be called after the div is inserted
      expect(root.innerHTML).toBe('<div></div>');
    });
    root = document.createElement('div');
    createApp(div(() => onMounted(fn))).mount(root);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onBeforeUpdate', async () => {
    const count = ref(0);
    const fn = vi.fn<() => void>(() => {
      // should be called before the div is updated
      expect(root.innerHTML).toBe('<div>0</div>');
    });
    const { root } = render(
      div(
        () => onBeforeUpdate(fn),
        () => count.value,
      ),
    );
    count.value++;
    await nextTick();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(root.innerHTML).toBe('<div>1</div>');
  });

  it('state mutation in onBeforeUpdate', async () => {
    const count = ref(0);
    const fn = vi.fn<() => void>(() => {
      // should be called before the div is updated
      expect(root.innerHTML).toBe('<div>0</div>');
      count.value++;
    });
    const renderSpy = vi.fn<() => number>(() => count.value);
    const { root } = render(div(() => onBeforeUpdate(fn), renderSpy));
    expect(renderSpy).toHaveBeenCalledTimes(1);
    count.value++;
    await nextTick();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(root.innerHTML).toBe('<div>2</div>');
  });

  it('onUpdated', async () => {
    const count = ref(0);
    const fn = vi.fn<() => void>(() => {
      // should be called after the div is updated
      expect(root.innerHTML).toBe('<div>1</div>');
    });
    const { root } = render(
      div(
        () => onUpdated(fn),
        () => count.value,
      ),
    );
    count.value++;
    await nextTick();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onBeforeUnmount', async () => {
    const toggle = ref(true);
    const fn = vi.fn<() => void>(() => {
      // should be called before the div is removed
      expect(root.innerHTML).toBe('<div></div><!---->');
    });
    const Child = div(() => onBeforeUnmount(fn));
    const { root } = render({
      render: () =>
        createIf(
          () => toggle.value,
          () => createComponent(Child),
        ),
    });
    toggle.value = false;
    await nextTick();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onUnmounted', async () => {
    const toggle = ref(true);
    const fn = vi.fn<() => void>(() => {
      // should be called after the div is removed
      expect(root.innerHTML).toBe('<!---->');
    });
    const Child = div(() => onUnmounted(fn));
    const { root } = render({
      render: () =>
        createIf(
          () => toggle.value,
          () => createComponent(Child),
        ),
    });
    toggle.value = false;
    await nextTick();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onBeforeUnmount in onMounted', async () => {
    const toggle = ref(true);
    const fn = vi.fn<() => void>(() => {
      // should be called before the div is removed
      expect(root.innerHTML).toBe('<div></div><!---->');
    });
    const Child = div(() => onMounted(() => onBeforeUnmount(fn)));
    const { root } = render({
      render: () =>
        createIf(
          () => toggle.value,
          () => createComponent(Child),
        ),
    });
    toggle.value = false;
    await nextTick();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('lifecycle call order', async () => {
    const calls: string[] = [];
    const hooks = (name: string) => {
      onBeforeMount(() => calls.push(`${name} onBeforeMount`));
      onMounted(() => calls.push(`${name} onMounted`));
      onBeforeUpdate(() => calls.push(`${name} onBeforeUpdate`));
      onUpdated(() => calls.push(`${name} onUpdated`));
      onBeforeUnmount(() => calls.push(`${name} onBeforeUnmount`));
      onUnmounted(() => calls.push(`${name} onUnmounted`));
    };
    /** A component that renders `<tag :title="count">` around `inner`. */
    const level = (name: string, tag: string, inner?: ComponentDef): ComponentDef => ({
      __propKeys: ['count'],
      setup: () => hooks(name),
      render: (_s, props) => {
        const el = document.createElement(tag);
        renderEffect(() => {
          el.title = String(props.count);
        });
        if (inner) insert(createComponent(inner, { count: () => props.count }), el);
        return el;
      },
    });
    const Root = level('root', 'section', level('mid', 'p', level('child', 'i')));
    const count = ref(0);

    // mount
    const app = createApp({ render: () => createComponent(Root, { count: () => count.value }) });
    app.mount(document.createElement('div'));
    expect(calls).toEqual([
      'child onBeforeMount',
      'mid onBeforeMount',
      'root onBeforeMount',
      'child onMounted',
      'mid onMounted',
      'root onMounted',
    ]);

    calls.length = 0;

    // update
    count.value++;
    await nextTick();
    expect(calls).toEqual([
      'root onBeforeUpdate',
      'mid onBeforeUpdate',
      'child onBeforeUpdate',
      'root onUpdated',
      'mid onUpdated',
      'child onUpdated',
    ]);

    calls.length = 0;

    // unmount
    app.unmount();
    expect(calls).toEqual([
      'root onBeforeUnmount',
      'mid onBeforeUnmount',
      'child onBeforeUnmount',
      'child onUnmounted',
      'mid onUnmounted',
      'root onUnmounted',
    ]);
  });

  it('runs shared hook fn for each instance', async () => {
    const fn = vi.fn<(...args: unknown[]) => void>();
    const toggle = ref(true);
    const Child = div(() => {
      onMounted(fn);
      onBeforeUnmount(fn);
    });
    render({
      render: () =>
        createIf(
          () => toggle.value,
          () => [createComponent(Child), createComponent(Child)],
        ),
    });
    expect(fn).toHaveBeenCalledTimes(2);
    toggle.value = false;
    await nextTick();
    expect(fn).toHaveBeenCalledTimes(4);
  });
});

describe('hook errors and misuse', () => {
  it('routes an error of each hook with its info', async () => {
    const infos: string[] = [];
    const count = ref(0);
    const show = ref(true);
    const fail = () => {
      throw new Error('hook');
    };
    const Child = div(
      () => {
        onBeforeMount(fail);
        onMounted(fail);
        onBeforeUpdate(fail);
        onUpdated(fail);
        onBeforeUnmount(fail);
        onUnmounted(fail);
      },
      () => count.value,
    );
    const app = createApp({
      render: () =>
        createIf(
          () => show.value,
          () => createComponent(Child),
        ),
    });
    app.config.errorHandler = (_err, _instance, info) => infos.push(info);
    app.mount(document.createElement('div'));
    count.value++;
    await nextTick();
    show.value = false;
    await nextTick();
    expect(infos).toEqual([
      'beforeMount hook',
      'mounted hook',
      'beforeUpdate hook',
      'updated hook',
      'beforeUnmount hook',
      'unmounted hook',
    ]);
  });

  it('skips the updated hooks of an instance unmounted later in the same flush', async () => {
    const show = ref(true);
    const count = ref(0);
    const updated = vi.fn<() => void>();
    const Child = div(
      () => {
        onBeforeUpdate(() => (show.value = false));
        onUpdated(updated);
      },
      () => count.value,
    );
    render({
      render: () =>
        createIf(
          () => show.value,
          () => createComponent(Child),
        ),
    });
    count.value++;
    await nextTick();
    expect(updated).not.toHaveBeenCalled();
  });

  it('onErrorCaptured sees descendant errors nearest first, and false stops them', () => {
    const seen: string[] = [];
    const handler = vi.fn<(...args: unknown[]) => void>();
    const failing: ComponentDef = {
      name: 'Failing',
      setup: () => {
        throw new Error('setup');
      },
      render: () => [],
    };
    const capture = (name: string, result?: false): ComponentDef => ({
      name,
      setup: () =>
        onErrorCaptured<Error>((err, instance, info) => {
          seen.push(`${name}: ${err.message} ${instance?.name} ${info}`);
          return result;
        }),
      render: () => createComponent(name === 'Inner' ? failing : capture('Inner')),
    });
    const app = createApp(capture('Outer', false));
    app.config.errorHandler = handler;
    app.mount(document.createElement('div'));
    expect(seen).toEqual([
      'Inner: setup Failing setup function',
      'Outer: setup Failing setup function',
    ]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('warns VIBE5205 outside setup and registers nothing, silently in prod', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hooks = [
      onBeforeMount,
      onMounted,
      onBeforeUpdate,
      onUpdated,
      onBeforeUnmount,
      onUnmounted,
      onErrorCaptured,
    ];
    for (const hook of hooks) hook(() => {});
    expect(spy.mock.calls.map(([message]) => String(message).split(' ', 2).join(' '))).toEqual([
      '[VIBE5205] onBeforeMount()',
      '[VIBE5205] onMounted()',
      '[VIBE5205] onBeforeUpdate()',
      '[VIBE5205] onUpdated()',
      '[VIBE5205] onBeforeUnmount()',
      '[VIBE5205] onUnmounted()',
      '[VIBE5205] onErrorCaptured()',
    ]);
    vi.stubGlobal('__DEV__', false);
    onMounted(() => {});
    expect(spy).toHaveBeenCalledTimes(7);
  });
});
