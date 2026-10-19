import type { Slot, Slots } from '../component.ts';
import { createSwitch, type Block, type SwitchFragment } from './block.ts';
import {
  currentInstance,
  setupInstance,
  withInstance,
  type ComponentInstance,
} from './instance.ts';
import { rawView, type RawProps } from './props.ts';

/**
 * The slots a parent passes: a function per name, and `$` for slots under `v-if` or `v-for`
 * (`null` when absent; the last one with a name wins).
 */
export type RawSlots = Record<string, Slot> & {
  $?: (() => { name: string; fn: Slot } | null | undefined)[];
};

/** A slot under `v-if` or `v-for`: its name and function, or nothing while it is absent. */
type SlotEntry = () => { name: string; fn: Slot } | null | undefined;

/** The `$` entries of `raw`. */
const entries = (raw: RawSlots | null): SlotEntry[] => raw?.$ ?? [];

/** The slot `name` of `raw`: the last `$` entry with the name, else the static one. */
function findSlot(raw: RawSlots | null, name: string): Slot | undefined {
  const dynamic = entries(raw);
  for (let i = dynamic.length - 1; i >= 0; i--) {
    const entry = dynamic[i]();
    if (entry?.name === name) return entry.fn;
  }
  return raw && name !== '$' && Object.hasOwn(raw, name) ? raw[name] : undefined;
}

/** Every slot name of `raw`. */
function slotNames(raw: RawSlots | null): string[] {
  const names = new Set<string>();
  for (const name in raw) if (name !== '$') names.add(name);
  for (const get of entries(raw)) {
    const entry = get();
    if (entry) names.add(entry.name);
  }
  return [...names];
}

/**
 * `fn`, a slot of `host`, bound to run with the component whose template wrote it as the current
 * instance, and with `host` as the parent of the components it creates.
 */
const bind =
  (host: ComponentInstance, fn: Slot): Slot =>
  (props) =>
    withInstance(host.owner, () => fn(props), host);

/** The slots of `instance`, each bound to its owner. */
export function createSlots(instance: ComponentInstance): Slots {
  const get = (name: string | symbol): Slot | undefined => {
    const fn = typeof name === 'string' ? findSlot(instance.rawSlots, name) : undefined;
    return fn && bind(instance, fn);
  };
  return new Proxy(
    {},
    {
      get: (_, name) => get(name),
      has: (_, name) => !!get(name),
      ownKeys: () => slotNames(instance.rawSlots),
      getOwnPropertyDescriptor: (_, name) => {
        const fn = get(name);
        return fn && { value: fn, enumerable: true, configurable: true };
      },
    },
  );
}

/**
 * `<slot name="x" :a="b">fallback</slot>`: renders the slot `name` that the parent passed, with
 * `props` (getters, read through a reactive view) and the parent as the current instance, or
 * `fallback` while the parent passes none. The content is rebuilt when the parent's slot
 * changes (a `v-if` slot). Codegen emits it in the component's render.
 */
export function createSlot(
  name: string,
  props?: RawProps | null,
  fallback?: () => Block,
): SwitchFragment {
  const host = currentInstance!;
  const slotProps = rawView(props ?? null);
  return createSwitch(
    () => findSlot(host.rawSlots, name),
    (fn) => (fn ? () => bind(host, fn)(slotProps) : fallback),
  );
}

/** The slots of the component whose setup is running; VIBE5205 outside setup. */
export function useSlots(): Slots {
  return setupInstance('useSlots')?.slots ?? {};
}
