// Creating, mounting and unmounting components; the instance itself lives in `instance.ts`.
import { vibeError } from '../errors.gen.ts';
import type { ComponentDef } from '../internal.ts';
import { setActiveSub } from '../reactivity/core.ts';
import { onScopeDispose } from '../reactivity/effectScope.ts';
import { proxyRefs } from '../reactivity/ref.ts';
import { isObject } from '../shared.ts';
import { warn } from '../warn.ts';
import { createSwitch, SwitchFragment, type Block } from './block.ts';
import { setDynamicProps } from './dom.ts';
import { handleError } from './errorHandling.ts';
import {
  callHooks,
  ComponentInstance,
  currentInstance,
  currentParent,
  withInstance,
  type AppContext,
} from './instance.ts';
import { createAttrs, createEmit, createProps, hasFallthrough, type RawProps } from './props.ts';
import { renderEffect } from './renderEffect.ts';
import { queuePostFlushCb } from './scheduler.ts';
import { createSlots, type RawSlots } from './slots.ts';

/**
 * `<Child :a="b" @pick="f">…</Child>`: creates a component of the current instance's template
 * and runs its setup and render. It is a child of that instance, or in slot content of the
 * component that renders the slot, so it injects what that component provides. `props` holds a getter per prop, attribute and listener (a valueless attribute is
 * `() => true`, a listener a getter of the handler) and `$` for `v-bind` objects; `slots` a
 * function per slot. Codegen passes `isSingleRoot` when the component is its template's only
 * root, so it inherits the parent's fallthrough attributes and scope ids. The component mounts on
 * its first `insert()` and unmounts when the scope that created it stops.
 */
export function createComponent(
  def: ComponentDef,
  props: RawProps | null = null,
  slots: RawSlots | null = null,
  isSingleRoot = false,
): ComponentInstance {
  const owner = currentInstance;
  let raw = props;
  if (isSingleRoot && owner && owner.def.inheritAttrs !== false && hasFallthrough(owner)) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `$` holds sources, not getters
    raw = { ...raw, $: [...(raw?.$ ?? []), () => owner.attrs] } as RawProps;
  }
  return setupComponent(new ComponentInstance(def, currentParent, owner, raw, slots, isSingleRoot));
}

/** Creates the root component of an app. */
export function createRootComponent(
  def: ComponentDef,
  props: RawProps | null,
  appContext: AppContext,
): ComponentInstance {
  return setupComponent(new ComponentInstance(def, null, null, props, null, false, appContext));
}

/** Runs the setup and the render of `instance`, owned by the active scope. */
function setupComponent(instance: ComponentInstance): ComponentInstance {
  const { def } = instance;
  onScopeDispose(() => unmountComponent(instance), true);
  instance.props = createProps(instance);
  instance.attrs = createAttrs(instance);
  instance.slots = createSlots(instance);
  instance.ctx = {
    attrs: instance.attrs,
    slots: instance.slots,
    emit: createEmit(instance),
    expose: (exposed) => {
      instance.exposed = exposed;
    },
  };
  const prevSub = setActiveSub(undefined);
  try {
    withInstance(instance, () =>
      instance.scope.run(() => {
        let state: Record<string, unknown> | void;
        try {
          state = def.setup?.(instance.props, instance.ctx);
        } catch (err) {
          handleError(err, instance, 'setup function');
          return;
        }
        if (state instanceof Promise) {
          throw vibeError('VIBE5204', { name: instance.name ?? 'Anonymous' });
        }
        let block: Block;
        try {
          block = def.render(proxyRefs(state ?? {}), instance.props, instance.ctx);
        } catch (err) {
          handleError(err, instance, 'render effect');
          return;
        }
        instance.block = block;
        fallthrough(instance);
        setScopeIds(instance);
      }),
    );
  } finally {
    setActiveSub(prevSub);
  }
  return instance;
}

/** Unmounts `instance`: `beforeUnmount` hooks, then its scope stops (and with it its children), then `unmounted` hooks are queued. */
function unmountComponent(instance: ComponentInstance): void {
  callHooks(instance, 'beforeUnmount');
  instance.scope.stop();
  instance.isUnmounted = true;
  queuePostFlushCb(() => callHooks(instance, 'unmounted'));
}

/** Puts the fallthrough attributes on the root: an element, or each one-element content of a swapping root. */
function fallthrough(instance: ComponentInstance): void {
  if (instance.def.inheritAttrs === false || !hasFallthrough(instance)) return;
  const root = instance.block;
  const apply = (nodes: Block): void => {
    if (nodes instanceof Element)
      renderEffect(() => setDynamicProps(nodes, [instance.attrs], true));
  };
  if (root instanceof SwitchFragment) {
    root.onSwap = apply;
    root.scope?.run(() => apply(root.nodes));
  } else if (root instanceof Element) apply(root);
  // A component root takes the attributes as its own props (`isSingleRoot`).
  else if (!(root instanceof ComponentInstance) && Object.keys(instance.attrs).length) {
    warn(vibeError('VIBE5201', { name: instance.name ?? 'Anonymous' }), instance);
  }
}

/** Adds the owner's scope id to a root element, and each further owner's through single roots. */
function setScopeIds(instance: ComponentInstance): void {
  const root = instance.block;
  if (!(root instanceof Element)) return;
  for (let cur = instance; cur.owner; cur = cur.owner) {
    const id = cur.owner.def.__scopeId;
    if (id) root.setAttribute(id, '');
    if (!cur.isSingleRoot) return;
  }
}

/**
 * `<component :is="c">`: renders the component that `is()` returns, created like
 * `createComponent(c, props, slots, isSingleRoot)`, and remounts it when `is()` returns another
 * one; `null` and `undefined` render nothing. Any other value throws VIBE5207 (strings are a
 * compile error).
 */
export function createDynamicComponent(
  is: () => ComponentDef | null | undefined,
  props: RawProps | null = null,
  slots: RawSlots | null = null,
  isSingleRoot = false,
): SwitchFragment {
  return createSwitch(is, (def) => {
    if (def == null) return undefined;
    if (!isObject(def) || typeof def.render !== 'function') {
      throw vibeError('VIBE5207', { type: typeof def });
    }
    return () => createComponent(def, props, slots, isSingleRoot);
  });
}
