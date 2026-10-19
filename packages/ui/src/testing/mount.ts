// oxlint-disable typescript/no-explicit-any, typescript/no-empty-object-type -- the signatures of C4 components
// Mounting components and composables in Vitest tests.
import { onTestFinished, TestRunner, type TestContext } from 'vitest';
import type { Component, ComponentProps, ComponentSlots } from '../component.ts';
import { vibeError } from '../errors.gen.ts';
import type { ComponentDef } from '../internal.ts';
import { shallowReactive } from '../reactivity/reactive.ts';
import { createApp, type Plugin } from '../runtime/app.ts';
import type { Block } from '../runtime/block.ts';
import { createComponent } from '../runtime/component.ts';
import type { RawProps } from '../runtime/props.ts';
import { nextTick } from '../runtime/scheduler.ts';
import type { RawSlots } from '../runtime/slots.ts';
import { camelize, capitalize, isFunction } from '../shared.ts';
import { serializeAll, Wrapper, type ComponentWrapper } from './wrapper.ts';

export interface MountOptions<C extends Component<any>> {
  /** The props, including `on*` event listeners. */
  props?: ComponentProps<C>;
  /** Slot content: text, a component, or a function of the slot props that returns text or nodes. */
  slots?: {
    [K in keyof ComponentSlots<C>]?:
      | string
      | Component<any>
      | ((
          props: Parameters<NonNullable<ComponentSlots<C>[K]>>[0],
        ) => string | Node | readonly Node[]);
  };
  /** Values the app provides, by key. */
  provide?: Record<string | symbol, unknown>;
  /** Plugins the app installs, in order. */
  plugins?: readonly Plugin[];
  /** Where the new host element is appended: an element or a selector; `document.body` by default. */
  attachTo?: Element | string;
}

/** The fix for each option that `mount()` rejects (VIBE7206). */
const REJECTED: Readonly<Record<string, string>> = {
  global: 'pass `plugins` and `provide` as top-level options',
  stubs: "mock the child's module instead, as in `vi.mock('./Child.vibe')`",
  shallow: "mock each child's module instead, as in `vi.mock('./Child.vibe')`",
  data: 'pass the starting state in `props`',
  attrs: 'pass attributes in `props`',
};

/** `setImmediate`, else `setTimeout`, captured before `vi.useFakeTimers()` can replace them. */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- setImmediate is not in the DOM lib
const defer = (Reflect.get(globalThis, 'setImmediate') ?? setTimeout) as (cb: () => void) => void;

/** Resolves after the pending promise callbacks, and with them the DOM updates they cause, ran. */
export const flushPromises = (): Promise<void> => new Promise((resolve) => defer(resolve));

/**
 * Appends the rendered HTML to the first error of a failed test, so that every reporter shows it.
 * Runs in `onTestFinished`, after the `afterEach` hooks and before the results are reported.
 */
export function appendRenderedHtml(
  ctx: Pick<TestContext, 'task'>,
  name: string,
  html: string,
): void {
  const { result } = ctx.task;
  const error = result?.state === 'fail' ? result.errors?.[0] : undefined;
  if (error) error.message += `\n\nRendered HTML of ${name}:\n${html}`;
}

/** The element that `selector` matches; VIBE7208 when none does. */
function query(selector: string): Element {
  const el = document.querySelector(selector);
  if (!el) throw vibeError('VIBE7208', { selector });
  return el;
}

interface Host {
  el: Element;
  unmounted: boolean;
  unmount: () => void;
}

/**
 * Mounts `root` in an app with the options' provides and plugins, into a new element appended to
 * `attachTo`. In a test (its body or `beforeEach`) it unmounts when the test finishes, first adding
 * the HTML to the error of a failed test when `name` is given.
 */
function mountHost(root: ComponentDef, options: MountOptions<any>, name?: string): Host {
  for (const option in options) {
    if (Object.hasOwn(REJECTED, option)) {
      throw vibeError('VIBE7206', { option, fix: REJECTED[option] });
    }
  }
  const { provide = {}, plugins = [], attachTo = document.body } = options;
  const target = typeof attachTo === 'string' ? query(attachTo) : attachTo;
  const app = createApp(root);
  for (const key of Reflect.ownKeys(provide)) app.provide(key, provide[key]);
  for (const plugin of plugins) app.use(plugin);
  const el = document.createElement('div');
  target.append(el);
  app.mount(el);
  const host: Host = {
    el,
    unmounted: false,
    unmount: () => {
      if (host.unmounted) return;
      host.unmounted = true;
      app.unmount();
      el.remove();
    },
  };
  if (TestRunner.getCurrentTest()) {
    onTestFinished((ctx) => {
      if (name !== undefined) appendRenderedHtml(ctx, name, serializeAll(el.childNodes));
      host.unmount();
    });
  }
  return host;
}

/** The content of a slot option as a block. */
function toBlock(content: string | Component<any> | Node | readonly Node[]): Block {
  if (typeof content === 'string') return document.createTextNode(content);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an array of nodes is a block
  return 'render' in content ? createComponent(content) : (content as Block);
}

/**
 * Mounts `component` for a test and returns its wrapper. Props are reactive (`setProps`), every
 * declared event is recorded (`emitted`) before it reaches the `on*` listener in `props`, and
 * `provide` and `plugins` apply to the app. Mounted in a test body or `beforeEach`, it unmounts
 * when the test finishes and adds the rendered HTML to the error of a failed test; mounted
 * elsewhere, such as in `beforeAll`, it stays until `unmount()`. Not supported in `test.concurrent`.
 */
export function mount<C extends Component<any>>(
  component: C,
  ...[options = {}]: {} extends ComponentProps<C>
    ? [options?: MountOptions<C>]
    : [options: MountOptions<C> & { props: ComponentProps<C> }]
): ComponentWrapper<C> {
  const bag = shallowReactive<Record<string, unknown>>({});
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `$` holds sources, not getters
  const raw = { $: [() => bag] } as RawProps;
  const emitted: Record<string, unknown[][]> = {};
  const listeners: Record<string, unknown> = {};
  /** The event of each listener prop key: `onPick-item` and `onPickItem` for `pick-item`. */
  const events = new Map<string, string>();
  for (const event of component.__emits ?? []) {
    const record = (...args: unknown[]): void => {
      (emitted[event] ??= []).push(args);
      const listener = listeners[event];
      if (isFunction(listener)) Reflect.apply(listener, undefined, args);
    };
    for (const key of [`on${capitalize(event)}`, `on${capitalize(camelize(event))}`]) {
      raw[key] = () => record;
      events.set(key, event);
    }
  }
  // The listeners of declared events go to the recorders, so that the bag cannot shadow them.
  const assign = (props: object): void => {
    for (const [key, value] of Object.entries(props)) {
      const event = events.get(key);
      if (event === undefined) bag[key] = value;
      else listeners[event] = value;
    }
  };
  assign(options.props ?? {});
  const slots: RawSlots = {};
  for (const [slot, content] of Object.entries(options.slots ?? {})) {
    slots[slot] =
      typeof content === 'function' ? (props) => toBlock(content(props)) : () => toBlock(content);
  }
  const name = component.name ?? 'Anonymous';
  const host = mountHost(
    { name: 'TestHost', render: () => createComponent(component, raw, slots, true) },
    options,
    name,
  );
  const alive = (): void => {
    if (host.unmounted) throw vibeError('VIBE7205', { name });
  };
  const wrapper = new Wrapper(() => [...host.el.childNodes], alive);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the wrapper is typed by the component
  return Object.assign(wrapper, {
    async setProps(props: object): Promise<void> {
      alive();
      assign(props);
      await nextTick();
    },
    emitted(event?: string) {
      alive();
      return event === undefined ? emitted : emitted[event];
    },
    unmount: host.unmount,
  }) as unknown as ComponentWrapper<C>;
}

/**
 * Runs `fn` as the setup of a component in an app with `provide` and `plugins`, so that it can use
 * `inject()`, lifecycle hooks and watchers, and returns its result. It unmounts like `mount()`.
 */
export function mountComposable<T>(
  fn: () => T,
  options: Pick<MountOptions<Component>, 'provide' | 'plugins'> = {},
): { readonly result: T; unmount(): void } {
  let result!: T;
  const host = mountHost(
    {
      name: 'ComposableHost',
      setup: () => {
        result = fn();
      },
      render: () => [],
    },
    options,
  );
  return { result, unmount: host.unmount };
}
