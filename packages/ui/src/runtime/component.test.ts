import { isVibeError } from '@vibejs-org/errors';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { thrownCode, warnedCodes } from '../../test/codes.ts';
import { mountForTest } from '../../test/abi/mount.ts';
import type { ComponentDef } from '../internal.ts';
import { effectScope } from '../reactivity/effectScope.ts';
import { ref } from '../reactivity/ref.ts';
import { createApp } from './app.ts';
import { createIf, createKeyed, insert } from './block.ts';
import { createComponent, createDynamicComponent } from './component.ts';
import { createFor } from './for.ts';
import { inject, provide } from './inject.ts';
import { on } from './events.ts';
import { onBeforeUpdate, onErrorCaptured, onMounted, onUpdated } from './lifecycle.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';
import { createSlot } from './slots.ts';
import { setRef } from './templateRef.ts';
import { watch } from './watch.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/** A component that renders `<tag>text</tag>`. */
const element = (tag: string, text = '', extra: Partial<ComponentDef> = {}): ComponentDef => ({
  render: () => {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
  },
  ...extra,
});

/** A component whose setup or render throws. */
const failing = (where: 'setup' | 'render'): ComponentDef => ({
  setup: () => {
    if (where === 'setup') throw new Error(where);
  },
  render: () => {
    throw new Error(where);
  },
});

/** A function that throws an error with the message `where`. */
const fail = (where: string) => () => {
  throw new Error(where);
};

/** Mounts `def` through an app into a new element. */
function mount(def: ComponentDef) {
  const host = document.createElement('div');
  const app = createApp(def);
  app.mount(host);
  return { host, app };
}

describe('creation', () => {
  test('runs setup with the props and the context, and render with the unwrapped state', () => {
    const def: ComponentDef = {
      name: 'Greeting',
      __propKeys: ['name'],
      setup: (props, ctx) => {
        expect(Object.keys(ctx)).toEqual(['attrs', 'slots', 'emit', 'expose']);
        return { greeting: ref(`Hello ${String(props.name)}`) };
      },
      render: ($setup) => document.createTextNode(String($setup.greeting)),
    };
    const { host } = mount({
      render: () => createComponent(def, { name: () => 'Ada' }),
    });
    expect(host.textContent).toBe('Hello Ada');
  });

  test('passes let bindings returned as accessors through to render', () => {
    let count = 1;
    const def: ComponentDef = {
      setup: () => ({
        get count() {
          return count;
        },
        set count(v: number) {
          count = v;
        },
      }),
      render: ($setup) => {
        $setup.count = 2;
        return document.createTextNode(String($setup.count));
      },
    };
    const { host } = mount(def);
    expect(host.textContent).toBe('2');
    expect(count).toBe(2);
  });

  test('leaves an empty block after a setup or render error and renders the siblings', () => {
    const errors: [unknown, string][] = [];
    const app = createApp({
      render: () => [
        createComponent(failing('setup')),
        createComponent(failing('render')),
        createComponent(element('b', 'sibling')),
      ],
    });
    app.config.errorHandler = (err, _instance, info) => errors.push([err, info]);
    const host = document.createElement('div');
    app.mount(host);
    expect(host.innerHTML).toBe('<!----><!----><b>sibling</b>');
    expect(errors).toEqual([
      [new Error('setup'), 'setup function'],
      [new Error('render'), 'render effect'],
    ]);
  });

  test('throws VIBE5204 for an async setup, in dev and prod', () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an async setup from untyped code
    const asyncSetup = (async () => {}) as unknown as ComponentDef['setup'];
    const def: ComponentDef = { name: 'Async', setup: asyncSetup, render: () => [] };
    expect(() => mount(def)).toThrow(/^\[VIBE5204\] The setup of the component Async/);
    expect(thrownCode(() => mount(def))).toBe('VIBE5204');
    vi.stubGlobal('__DEV__', false);
    const anonymous: ComponentDef = { setup: asyncSetup, render: () => [] };
    expect(() => mount(anonymous)).toThrow(
      '[VIBE5204] https://vibejs.org/v0/errors/VIBE5204?name=Anonymous',
    );
  });

  test('creates components outside an app with their own context', () => {
    const scope = effectScope();
    const parent = document.createElement('div');
    scope.run(() => insert(createComponent(element('i', 'free')), parent));
    expect(parent.innerHTML).toBe('<i>free</i>');
    scope.stop();
  });

  test('gives a component created in runWithContext the app context', () => {
    const app = createApp(element('i'));
    app.provide('key', 'from app');
    let injected: unknown;
    const scope = effectScope();
    scope.run(() =>
      app.runWithContext(() =>
        createComponent({
          setup: () => {
            injected = inject('key');
          },
          render: () => [],
        }),
      ),
    );
    expect(injected).toBe('from app');
    scope.stop();
  });

  test('a component created in a slot is a child of the component that renders the slot', () => {
    const seen: unknown[] = [];
    const Tabs: ComponentDef = {
      setup: () => provide('tabs', 'tabs'),
      render: () => createSlot('default'),
    };
    const Tab: ComponentDef = {
      setup: () => {
        seen.push(inject('tabs'));
      },
      render: () => [],
    };
    mount({
      render: () => createComponent(Tabs, null, { default: () => createComponent(Tab) }),
    });
    expect(seen).toEqual(['tabs']);
  });
});

describe('scheduling', () => {
  test('updates parents before children', async () => {
    const order: string[] = [];
    const count = ref(0);
    const Child: ComponentDef = {
      render: () => {
        const el = document.createElement('i');
        renderEffect(() => {
          order.push(`child ${count.value}`);
        });
        return el;
      },
    };
    mount({
      render: () => {
        const child = createComponent(Child);
        renderEffect(() => {
          order.push(`parent ${count.value}`);
        });
        return child;
      },
    });
    order.length = 0;
    count.value++;
    await nextTick();
    expect(order).toEqual(['parent 1', 'child 1']);
  });

  test('never runs the queued render effect or watcher of an unmounted child', async () => {
    const show = ref(true);
    const count = ref(0);
    const ran: string[] = [];
    const Child: ComponentDef = {
      setup: () => {
        watch(count, () => ran.push('watcher'));
      },
      render: () => {
        const el = document.createElement('i');
        renderEffect(() => {
          ran.push(`render ${count.value}`);
        });
        return el;
      },
    };
    mount({
      render: () =>
        createIf(
          () => show.value,
          () => createComponent(Child),
        ),
    });
    ran.length = 0;
    count.value++;
    show.value = false;
    await nextTick();
    expect(ran).toEqual([]);
  });

  test('stops the watchers of setup on unmount', async () => {
    const count = ref(0);
    const seen: number[] = [];
    const { app } = mount({
      setup: () => {
        watch(count, (v) => seen.push(v));
      },
      render: () => [],
    });
    count.value++;
    await nextTick();
    app.unmount();
    count.value++;
    await nextTick();
    expect(seen).toEqual([1]);
  });

  test('calls beforeUpdate and updated once per flush, for mounted instances only', async () => {
    const count = ref(0);
    const log: string[] = [];
    mount({
      setup: () => {
        onBeforeUpdate(() => log.push('beforeUpdate'));
        onUpdated(() => log.push('updated'));
      },
      render: () => {
        const el = document.createElement('i');
        renderEffect(() => {
          el.textContent = String(count.value);
        });
        renderEffect(() => {
          el.title = String(count.value);
        });
        return el;
      },
    });
    count.value++;
    await nextTick();
    count.value++;
    await nextTick();
    expect(log).toEqual(['beforeUpdate', 'updated', 'beforeUpdate', 'updated']);
  });
});

describe('fallthrough', () => {
  test('puts attributes and listeners on an element root', async () => {
    const onClick = vi.fn<(...args: unknown[]) => void>();
    const { el, props, unmount } = mountForTest(element('button', 'go'), {
      class: 'a',
      onClick,
    });
    const button = el.querySelector('button')!;
    expect(button.className).toBe('a');
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    props.class = 'b';
    await nextTick();
    expect(button.className).toBe('b');
    unmount();
  });

  test('keeps the attributes off the root with inheritAttrs: false', () => {
    const { el, unmount } = mountForTest(element('p', '', { inheritAttrs: false }), { id: 'x' });
    expect(el.querySelector('p')!.hasAttribute('id')).toBe(false);
    unmount();
  });

  test('re-applies the attributes to a createKeyed root after each swap', async () => {
    const key = ref(1);
    const def: ComponentDef = {
      render: () =>
        createKeyed(
          () => key.value,
          () => document.createElement('p'),
        ),
    };
    const { el, unmount } = mountForTest(def, { title: 't' });
    const first = el.querySelector('p')!;
    expect(first.title).toBe('t');
    key.value++;
    await nextTick();
    const second = el.querySelector('p')!;
    expect(second).not.toBe(first);
    expect(second.title).toBe('t');
    unmount();
  });

  test('applies nothing to a swapping root whose content is not one element', () => {
    const def: ComponentDef = {
      render: () =>
        createIf(
          () => false,
          () => [],
        ),
    };
    const { el, unmount } = mountForTest(def, { title: 't' });
    expect(el.innerHTML).toBe('<!---->');
    unmount();
  });

  test('warns VIBE5201 for attributes on a component without a single root element', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const multi: ComponentDef = {
      name: 'Multi',
      render: () => [document.createElement('a'), document.createElement('b')],
    };
    const { unmount } = mountForTest(multi, { id: 'x' });
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^\[VIBE5201\] .* Multi received/));
    expect(warnedCodes(spy)).toEqual(['VIBE5201']);
    unmount();
    spy.mockClear();
    // Without attributes there is nothing to warn about.
    mountForTest(multi).unmount();
    // A list root is not a single root either; in prod the warning is silent.
    vi.stubGlobal('__DEV__', false);
    const list: ComponentDef = {
      render: () =>
        createFor(
          () => [1],
          () => document.createElement('i'),
          (v) => v,
        ),
    };
    mountForTest(list, { id: 'x' }).unmount();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('createDynamicComponent', () => {
  test('reports VIBE5207 to the error handler for a value that is not a component, in prod too', () => {
    vi.stubGlobal('__DEV__', false);
    const errors: unknown[] = [];
    const app = createApp({
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a non-component from untyped code
      render: () => createDynamicComponent(() => ({}) as ComponentDef),
    });
    app.config.errorHandler = (err) => errors.push(err);
    app.mount(document.createElement('div'));
    expect(isVibeError(errors[0], 'VIBE5207')).toBe(true);
    expect(errors[0]).toMatchObject({
      message: '[VIBE5207] https://vibejs.org/v0/errors/VIBE5207?type=object',
    });
  });

  test('takes props and slots like createComponent', () => {
    const def: ComponentDef = {
      __propKeys: ['label'],
      render: (_s, $props) => [
        document.createTextNode(String($props.label)),
        createSlot('default'),
      ],
    };
    const { host } = mount({
      render: () =>
        createDynamicComponent(
          () => def,
          { label: () => 'a' },
          { default: () => document.createTextNode('b') },
        ),
    });
    expect(host.textContent).toBe('ab');
  });
});

describe('error routing', () => {
  test('errors of every source reach onErrorCaptured up the chain, then the app handler', async () => {
    const captured: string[] = [];
    const handled: string[] = [];
    const count = ref(0);
    const Failing: ComponentDef = {
      name: 'Failing',
      __emits: ['pick'],
      setup: (_props, ctx) => {
        watch(() => {
          if (count.value) throw new Error('getter');
          return count.value;
        }, fail('callback'));
        watch(count, (_v, _o, onCleanup) => onCleanup(fail('cleanup')));
        onMounted(() => ctx.emit('pick'));
      },
      render: () => {
        const el = document.createElement('button');
        on(el, 'click', fail('native'));
        setRef(el, fail('ref'));
        renderEffect(() => {
          if (count.value === 2) throw new Error('render');
        });
        return el;
      },
    };
    const Middle: ComponentDef = {
      name: 'Middle',
      setup: () =>
        onErrorCaptured<Error>((err, instance, info) => {
          captured.push(`${err.message} ${instance?.name} ${info}`);
        }),
      render: () => createComponent(Failing, { onPick: () => fail('emit') }),
    };
    const app = createApp(Middle);
    app.config.errorHandler = (_err, _instance, info) => handled.push(info);
    const host = document.createElement('div');
    app.mount(host);
    host.querySelector('button')!.click();
    count.value = 1;
    await nextTick();
    count.value = 2;
    await nextTick();
    expect(captured).toEqual([
      'ref Failing template ref',
      'emit Failing component event handler',
      'native Failing native event handler',
      'getter Failing watcher getter',
      'callback Failing watcher callback',
      'getter Failing watcher getter',
      'cleanup Failing watcher cleanup',
      'render Failing render effect',
    ]);
    expect(handled).toEqual([
      'template ref',
      'component event handler',
      'native event handler',
      'watcher getter',
      'watcher callback',
      'watcher getter',
      'watcher cleanup',
      'render effect',
    ]);
  });

  test('an error of an onErrorCaptured hook goes on up the chain, and so does the original', () => {
    const captured: string[] = [];
    const handled: string[] = [];
    const Parent: ComponentDef = {
      setup: () => onErrorCaptured(fail('hook')),
      render: () => [createComponent(failing('setup')), createComponent(element('b', 'sib'))],
    };
    const app = createApp({
      setup: () =>
        onErrorCaptured<Error>((err, _instance, info) => {
          captured.push(`${err.message} ${info}`);
        }),
      render: () => createComponent(Parent),
    });
    app.config.errorHandler = (_err, _instance, info) => handled.push(info);
    const host = document.createElement('div');
    app.mount(host);
    expect(host.innerHTML).toBe('<!----><b>sib</b>');
    expect(captured).toEqual(['hook errorCaptured hook', 'setup setup function']);
    expect(handled).toEqual(['errorCaptured hook', 'setup function']);
  });

  test('an error of the app handler is logged as VIBE5102 and the siblings still render', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp({
      render: () => [createComponent(failing('setup')), createComponent(element('b', 'sib'))],
    });
    app.config.errorHandler = fail('handler');
    const host = document.createElement('div');
    app.mount(host);
    expect(host.innerHTML).toBe('<!----><b>sib</b>');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({
      code: 'VIBE5102',
      args: { info: 'config.errorHandler' },
      cause: new Error('handler'),
    });
  });

  test('without an app handler, an error is logged as VIBE5102 with its info', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount({
      setup: () => {
        throw new Error('setup');
      },
      render: () => [],
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({
      code: 'VIBE5102',
      args: { info: 'setup function' },
      cause: new Error('setup'),
    });
  });
});
