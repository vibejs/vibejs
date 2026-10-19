// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/__tests__/apiCreateApp.spec.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/__tests__/helpers/useId.spec.ts (MIT)
//
// Components are ComponentDefs whose render returns DOM nodes. Differences: a second app may mount
// on a host that holds one (the content is replaced, nothing is tracked on the host), and a
// repeated `app.provide()` key replaces the value without a warning. Dropped: config.isNativeTag,
// optionMergeStrategies, globalProperties, throwUnhandledErrorInProduction and the setup-state `_`
// cases (not supported), the nested-app flush-order cases (no synchronous root render inside a
// flush), and the useId cases for idPrefix, async components and SSR prefetch.
// oxlint-disable typescript/no-extraneous-class, unicorn/consistent-function-scoping -- ported as upstream wrote it
import { isVibeError } from '@vibejs-org/errors';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { thrownCode, warnedCodes } from '../../test/codes.ts';
import type { ComponentDef } from '../internal.ts';
import { ref } from '../reactivity/ref.ts';
import { createApp, useId, type App, type ComponentHandle, type Plugin } from './app.ts';
import { createComponent } from './component.ts';
import { inject, provide } from './inject.ts';
import { onMounted } from './lifecycle.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.textContent = '';
});

/** A component that renders the text that `text(props)` returns. */
const comp = (
  text: (props: Record<string, unknown>) => unknown,
  extra: Partial<ComponentDef> = {},
): ComponentDef => ({
  render: (_s, props) => {
    const node = document.createTextNode('');
    renderEffect(() => {
      node.data = String(text(props));
    });
    return node;
  },
  ...extra,
});

/** The first line of each `console.warn` call. */
const warnings = (spy: { mock: { calls: unknown[][] } }): string[] =>
  spy.mock.calls.map(([message]) => String(message).split('\n', 1)[0]);

describe('api: createApp', () => {
  test('mount', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Comp = comp((props) => props.count, {
      __propKeys: ['count'],
      __defaults: { count: () => 0 },
    });

    const root1 = document.createElement('div');
    root1.innerHTML = '<p>old</p>';
    createApp(Comp).mount(root1);
    expect(root1.innerHTML).toBe('0');

    // mount with props
    const root2 = document.createElement('div');
    const app2 = createApp(Comp, { count: 1 });
    app2.mount(root2);
    expect(root2.innerHTML).toBe('1');

    // remount warning
    const root3 = document.createElement('div');
    app2.mount(root3);
    expect(root3.innerHTML).toBe('');
    expect(warnings(spy)).toEqual([
      '[VIBE5302] The app is already mounted, so the second app.mount() did nothing.',
    ]);
    expect(warnedCodes(spy)).toContain('VIBE5302');
  });

  test('mount by selector, and VIBE5303 for a missing target in dev and prod', () => {
    document.body.innerHTML = '<main id="app"></main>';
    createApp(comp(() => 'hi')).mount('#app');
    expect(document.body.innerHTML).toBe('<main id="app">hi</main>');
    expect(() => createApp(comp(() => '')).mount('#missing')).toThrow(
      /^\[VIBE5303\] app\.mount\(\) could not find the element #missing\./,
    );
    expect(thrownCode(() => createApp(comp(() => '')).mount('#missing'))).toBe('VIBE5303');
    vi.stubGlobal('__DEV__', false);
    expect(() => createApp(comp(() => '')).mount('#missing')).toThrow(
      '[VIBE5303] https://vibejs.org/v0/errors/VIBE5303?target=%23missing',
    );
  });

  test('mount returns the exposed values of the root once the mounted hooks ran', () => {
    const mounted = vi.fn<(...args: unknown[]) => void>();
    const exposed = createApp({
      setup: (_p, ctx) => {
        onMounted(mounted);
        ctx.expose({ count: ref(1) });
      },
      render: () => [],
    }).mount(document.createElement('div'));
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(exposed).toEqual({ count: 1 });
    expect(createApp(comp(() => '')).mount(document.createElement('div'))).toEqual({});
  });

  test('unmount', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = document.createElement('div');
    const app = createApp(comp(() => 0));

    // warning
    app.unmount();
    expect(warnings(spy)).toEqual([
      '[VIBE5305] app.unmount() was called on an app that is not mounted.',
    ]);
    expect(warnedCodes(spy)).toContain('VIBE5305');

    app.mount(root);
    app.unmount();
    expect(root.innerHTML).toBe('');
    app.unmount();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('provide', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let values: unknown[] = [];
    const Child = comp(() => values.join(','), {
      setup: () => {
        values = [inject('foo'), inject('bar')];
        inject('__proto__');
      },
    });
    const Root: ComponentDef = {
      setup: () => {
        // test override
        provide('foo', 3);
      },
      render: () => createComponent(Child),
    };

    const app = createApp(Root);
    expect(app.provide('foo', 1)).toBe(app);
    app.provide('bar', 2);

    const root = document.createElement('div');
    app.mount(root);
    expect(root.innerHTML).toBe('3,2');
    expect(warnings(spy)).toEqual(['[VIBE5206] Nothing provides the injection key __proto__.']);
    expect(warnedCodes(spy)).toContain('VIBE5206');
  });

  test('runWithContext', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = createApp({
      setup: () => {
        provide('foo', 'should not be seen');

        // nested createApp
        const childApp = createApp({
          setup: () => provide('foo', 'foo from child'),
          render: () => [],
        });

        childApp.provide('foo', 2);
        expect(childApp.runWithContext(() => inject('foo'))).toBe(2);
      },
      render: () => [],
    });
    app.provide('foo', 1);

    expect(app.runWithContext(() => inject('foo'))).toBe(1);
    const root = document.createElement('div');
    app.mount(root);

    expect(
      app.runWithContext(() => {
        app.runWithContext(() => {});
        return inject('foo');
      }),
    ).toBe(1);

    // ensure the context is restored
    inject('foo');
    expect(warnings(spy)).toEqual([
      "[VIBE5205] inject() can only be called synchronously inside a component's setup.",
    ]);
    expect(warnedCodes(spy)).toContain('VIBE5205');
  });

  test('component, directive and mixin throw VIBE5301, in prod too', () => {
    const app = createApp(comp(() => ''));
    expect(() => app.component()).toThrow(/^\[VIBE5301\] app\.component\(\) is not supported\./);
    expect(() => app.directive()).toThrow(/^\[VIBE5301\] app\.directive\(\)/);
    expect(thrownCode(() => app.directive())).toBe('VIBE5301');
    vi.stubGlobal('__DEV__', false);
    expect(() => app.mixin()).toThrow('[VIBE5301] https://vibejs.org/v0/errors/VIBE5301?api=mixin');
  });

  test('use', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const PluginA: Plugin = (app) => app.provide('foo', 1);
    const PluginB: Plugin<[number, number]> = {
      install: (app, arg1, arg2) => app.provide('bar', arg1 + arg2),
    };
    class PluginC {
      static install(app: App) {
        app.provide('baz', 2);
      }
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an invalid plugin from untyped code
    const PluginD = undefined as unknown as Plugin;

    let values: unknown[] = [];
    const Root = comp(() => values.join(','), {
      setup: () => {
        values = [inject('foo'), inject('bar'), inject('baz')];
      },
    });

    const app = createApp(Root);
    expect(app.use(PluginA)).toBe(app);
    app.use(PluginB, 1, 1);
    app.use(PluginC);

    const root = document.createElement('div');
    app.mount(root);
    expect(root.innerHTML).toBe('1,2,2');

    app.use(PluginA);
    app.use(PluginD);
    expect(warnings(spy)).toEqual([
      '[VIBE5304] app.use() received a plugin that is already installed.',
      '[VIBE5304] app.use() received no plugin.',
    ]);
    expect(warnedCodes(spy)).toContain('VIBE5304');
    vi.stubGlobal('__DEV__', false);
    app.use(PluginA);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('onUnmount', () => {
    const cleanup = vi.fn<(...args: unknown[]) => void>();
    const PluginA: Plugin = (app) => {
      app.provide('foo', 1);
      app.onUnmount(cleanup);
    };
    const PluginB: Plugin<[number, number]> = {
      install: (app, arg1, arg2) => {
        app.provide('bar', arg1 + arg2);
        app.onUnmount(cleanup);
      },
    };

    const app = createApp(comp(() => 'Test'));
    app.use(PluginA);
    app.use(PluginB, 1, 2);

    app.mount(document.createElement('div'));

    // also can be added after mount
    app.onUnmount(cleanup);

    app.unmount();

    expect(cleanup).toHaveBeenCalledTimes(3);
  });

  test('config.errorHandler', () => {
    const error = new Error();
    const handler = vi.fn<(err: unknown, instance: ComponentHandle | null, info: string) => void>(
      (err, instance, info) => {
        expect(err).toBe(error);
        expect(instance?.name).toBe('Root');
        expect(instance?.parent).toBeNull();
        expect(info).toBe('render effect');
      },
    );
    const app = createApp({
      name: 'Root',
      render: () => {
        throw error;
      },
    });
    app.config.errorHandler = handler;
    app.mount(document.createElement('div'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('config.warnHandler receives component warnings with the name trace', () => {
    const console = vi.spyOn(globalThis.console, 'warn').mockImplementation(() => {});
    const handler = vi.fn<(...args: unknown[]) => void>();
    const Child: ComponentDef = {
      name: 'Child',
      setup: () => void inject('missing'),
      render: () => [],
    };
    const app = createApp({ name: 'Hello', render: () => createComponent(Child) });
    app.config.warnHandler = handler;
    app.mount(document.createElement('div'));
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an invalid plugin from untyped code
    app.use(undefined as unknown as Plugin);
    expect(handler).toHaveBeenCalledTimes(2);
    const [[msg, instance, trace], [pluginMsg, noInstance, emptyTrace]] = handler.mock.calls;
    expect(msg).toMatch(/^\[VIBE5206\] Nothing provides the injection key missing\./);
    expect(instance).toMatchObject({ name: 'Child', parent: { name: 'Hello', parent: null } });
    expect(trace).toBe('at <Child>\nat <Hello>');
    expect(pluginMsg).toMatch(/^\[VIBE5304\]/);
    expect(noInstance).toBeNull();
    expect(emptyTrace).toBe('');
    expect(console).not.toHaveBeenCalled();
  });

  test('config.warnHandler traces an anonymous component', () => {
    const handler = vi.fn<(...args: unknown[]) => void>();
    const app = createApp({ setup: () => void inject('x'), render: () => [] });
    app.config.warnHandler = handler;
    app.mount(document.createElement('div'));
    expect(handler.mock.calls[0][2]).toBe('at <Anonymous>');
  });
});

describe('useId', () => {
  test('basic', () => {
    const ids: string[] = [];
    const Child = comp(() => '', { setup: () => void ids.push(useId(), useId()) });
    const Root: ComponentDef = {
      setup: () => void ids.push(useId()),
      render: () => [createComponent(Child), createComponent(Child)],
    };
    createApp(Root).mount(document.createElement('div'));
    const [prefix] = ids[0].split('-');
    expect(prefix).toMatch(/^v\d+$/);
    expect(ids).toEqual([0, 1, 2, 3, 4].map((n) => `${prefix}-${n}`));
    // another app counts on its own
    const other: string[] = [];
    createApp(comp(() => '', { setup: () => void other.push(useId()) })).mount(
      document.createElement('div'),
    );
    expect(other[0]).toMatch(/^v\d+-0$/);
    expect(other[0]).not.toBe(ids[0]);
  });

  test('stays the same across updates', async () => {
    const count = ref(0);
    let id = '';
    const root = document.createElement('div');
    createApp(
      comp(() => `${id}:${count.value}`, {
        setup: () => {
          id = useId();
        },
      }),
    ).mount(root);
    const before = root.textContent;
    count.value++;
    await nextTick();
    expect(root.textContent).toBe(before.replace(':0', ':1'));
  });

  test('returns an empty string with VIBE5205 outside setup', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(useId()).toBe('');
    expect(warnings(spy)).toEqual([
      "[VIBE5205] useId() can only be called synchronously inside a component's setup.",
    ]);
    expect(warnedCodes(spy)).toContain('VIBE5205');
  });
});

test('a failed root setup still mounts an empty block', () => {
  const errors: unknown[] = [];
  const app = createApp({
    setup: () => {
      throw new Error('setup');
    },
    render: () => [],
  });
  app.config.errorHandler = (err) => errors.push(err);
  const root = document.createElement('div');
  app.mount(root);
  expect(root.innerHTML).toBe('<!---->');
  expect(isVibeError(errors[0])).toBe(false);
});
