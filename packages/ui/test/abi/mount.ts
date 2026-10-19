import { createApp, shallowReactive, type App } from '@vibejs-org/ui';
import {
  createComponent,
  setRef,
  type ComponentDef,
  type RawProps,
  type RawSlots,
} from '@vibejs-org/ui/internal';

export interface Mounted {
  /** The host element the component renders into. */
  el: Element;
  /** The props, reactive: assign to update them. */
  props: Record<string, unknown>;
  /** The arguments of each emitted event, by event name. */
  emitted: Record<string, unknown[][]>;
  /** The values the component exposes, as a template ref to it holds them. */
  readonly exposed: Record<string, unknown>;
  app: App;
  unmount: () => void;
}

export interface MountOptions {
  slots?: RawSlots;
  /** Values the app provides. */
  provide?: Record<string | symbol, unknown>;
}

/** `pick-item` → `onPickItem`, `update:modelValue` → `onUpdate:modelValue`. */
const listenerKey = (event: string): string =>
  `on${event.charAt(0).toUpperCase()}${event.slice(1).replaceAll(/-(\w)/g, (_, c: string) => c.toUpperCase())}`;

/**
 * Mounts a component as the only root of a host component, through `createApp`: props are
 * getters over a shallow reactive bag, every declared event has a listener that records its
 * arguments, and the host keeps a template ref to the component's exposed values.
 */
export function mountForTest(
  def: ComponentDef,
  props: Record<string, unknown> = {},
  { slots, provide = {} }: MountOptions = {},
): Mounted {
  const bag = shallowReactive({ ...props });
  const emitted: Record<string, unknown[][]> = {};
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `$` holds sources, not getters
  const raw = { $: [() => bag] } as RawProps;
  for (const event of def.__emits ?? []) {
    raw[listenerKey(event)] =
      () =>
      (...args: unknown[]) =>
        (emitted[event] ??= []).push(args);
  }
  let exposed: Record<string, unknown> = {};
  const host: ComponentDef = {
    name: 'TestHost',
    render: () => {
      const child = createComponent(def, raw, slots, true);
      setRef(child, (value) => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a component ref holds its exposed values
        if (value) exposed = value as Record<string, unknown>;
      });
      return child;
    },
  };
  const app = createApp(host);
  for (const key of Reflect.ownKeys(provide)) app.provide(key, provide[key]);
  const el = document.createElement('div');
  document.body.append(el);
  app.mount(el);
  return {
    el,
    props: bag,
    emitted,
    get exposed() {
      return exposed;
    },
    app,
    unmount: () => {
      app.unmount();
      el.remove();
    },
  };
}
