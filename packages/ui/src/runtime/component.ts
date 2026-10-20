// Creating, mounting and unmounting components; the instance itself lives in `instance.ts`.
import { vibeError } from '../errors.gen.ts';
import type { ComponentDef } from '../internal.ts';
import { setActiveSub } from '../reactivity/core.ts';
import { EffectScopeImpl, onScopeDispose } from '../reactivity/effectScope.ts';
import { proxyRefs } from '../reactivity/ref.ts';
import { isObject } from '../shared.ts';
import { warn } from '../warn.ts';
import {
  createSwitch,
  firstNode,
  insert,
  removeNodes,
  SwitchFragment,
  type Block,
} from './block.ts';
import { setDynamicProps } from './dom.ts';
import { handleError } from './errorHandling.ts';
import {
  callHooks,
  ComponentInstance,
  currentInstance,
  currentParent,
  hmrRecords,
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
  if (__DEV__ && def.__hmrId) hmrRecords.get(def.__hmrId)?.instances.add(instance);
  untracked(() =>
    withInstance(instance, () =>
      instance.scope.run(() => {
        let state: Record<string, unknown> | void;
        try {
          state = def.setup?.(instance.props, instance.ctx);
          if (!(state instanceof Promise)) instance.setupState = proxyRefs(state ?? {});
        } catch (err) {
          handleError(err, instance, 'setup function');
          return;
        }
        if (state instanceof Promise) {
          throw vibeError('VIBE5204', { name: instance.name ?? 'Anonymous' });
        }
        renderComponent(instance);
      }),
    ),
  );
  return instance;
}

/** Runs `fn` with no active subscriber, so that what it reads is not tracked. */
function untracked(fn: () => void): void {
  const prevSub = setActiveSub(undefined);
  try {
    fn();
  } finally {
    setActiveSub(prevSub);
  }
}

/** Runs the render of `instance` in a new render scope and decorates its root. */
function renderComponent(instance: ComponentInstance): void {
  const scope = instance.scope.run(() => new EffectScopeImpl())!;
  instance.renderScope = scope;
  scope.run(() => {
    try {
      instance.block = instance.def.render(instance.setupState, instance.props, instance.ctx);
    } catch (err) {
      instance.block = document.createComment('');
      handleError(err, instance, 'render effect');
      return;
    }
    decorateRoot(instance);
  });
}

/**
 * HMR: renders `instance` again with the current `def.render` and the same setup state, props and
 * context, and puts the new block where the old one was. Child components are created again. A
 * block with no node (an empty template) has no position, so the instance is recreated instead.
 */
export function rerenderComponent(instance: ComponentInstance): void {
  if (instance.isUnmounted) return;
  const old = instance.block;
  const anchor = firstNode(old);
  if (!anchor?.parentNode) {
    recreateComponent(instance);
    return;
  }
  instance.renderScope?.stop();
  untracked(() => withInstance(instance, () => renderComponent(instance)));
  insert(instance.block, anchor.parentNode, anchor);
  removeNodes(old);
}

/** HMR: creates `instance` again by rerendering its parent, remounts a root, or reloads the page. */
export function recreateComponent(instance: ComponentInstance): void {
  if (instance.parent) rerenderComponent(instance.parent);
  else if (instance.appContext.remount) instance.appContext.remount();
  else location.reload();
}

/** Unmounts `instance`: `beforeUnmount` hooks, then its scope stops (and with it its children), then `unmounted` hooks are queued. */
function unmountComponent(instance: ComponentInstance): void {
  callHooks(instance, 'beforeUnmount');
  if (__DEV__ && instance.def.__hmrId) {
    hmrRecords.get(instance.def.__hmrId)?.instances.delete(instance);
  }
  instance.scope.stop();
  instance.isUnmounted = true;
  queuePostFlushCb(() => callHooks(instance, 'unmounted'));
}

/**
 * Puts the owners' scope ids (see `scopeIds`) and the fallthrough attributes on the root: an
 * element, or each one-element content of a swapping root.
 */
function decorateRoot(instance: ComponentInstance): void {
  const ids = scopeIds(instance);
  const attrs = instance.def.inheritAttrs !== false && hasFallthrough(instance);
  const root = instance.block;
  const apply = (nodes: Block): void => {
    if (!(nodes instanceof Element)) return;
    for (const id of ids) nodes.setAttribute(id, '');
    if (attrs) renderEffect(() => setDynamicProps(nodes, [instance.attrs], true));
  };
  if (root instanceof SwitchFragment) {
    root.onSwap = apply;
    root.scope?.run(() => apply(root.nodes));
  } else if (root instanceof Element) apply(root);
  // A component root takes the attributes as its own props (`isSingleRoot`).
  else if (
    __DEV__ &&
    attrs &&
    !(root instanceof ComponentInstance) &&
    Object.keys(instance.attrs).length
  ) {
    warn(vibeError('VIBE5201', { name: instance.name ?? 'Anonymous' }), instance);
  }
}

/** The scope id of the owner, and of each further owner through single roots. */
function scopeIds(instance: ComponentInstance): string[] {
  const ids: string[] = [];
  for (let cur = instance; cur.owner; cur = cur.owner) {
    const id = cur.owner.def.__scopeId;
    if (id) ids.push(id);
    if (!cur.isSingleRoot) break;
  }
  return ids;
}

/**
 * `<component :is="c">`: renders the component that `is()` returns, created like
 * `createComponent(c, props, slots, isSingleRoot)`, and remounts it when `is()` returns another
 * one; `null` and `undefined` render nothing. Any other value raises VIBE5207, in every build
 * (strings are a compile error); like any render error it goes to the error handler as
 * `'render effect'`, since a later swap runs in a scheduler flush where nothing can catch it.
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
