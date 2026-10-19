import { effectScope, isRef, shallowReactive, unref, type SetupContext } from '@vibejs-org/ui';
import { insert, type ComponentDef } from '@vibejs-org/ui/internal';

export interface Mounted {
  /** The host element the component renders into. */
  el: Element;
  /** The props, reactive: assign to update them. */
  props: Record<string, unknown>;
  /** The arguments of each emitted event, by event name. */
  emitted: Record<string, unknown[][]>;
  unmount: () => void;
}

/**
 * Mounts a component without the app API: props in a shallow reactive bag, a setup context that
 * records emits, and `$setup` as a ref-unwrapping proxy over what setup returns, all owned by one
 * effect scope. The component runtime replaces it with a mount through `createApp`.
 */
export function mountForTest(def: ComponentDef, props: Record<string, unknown> = {}): Mounted {
  const bag = shallowReactive({ ...props });
  const emitted: Record<string, unknown[][]> = {};
  const ctx: SetupContext = {
    attrs: {},
    slots: {},
    emit: (event, ...args) => {
      (emitted[event] ??= []).push(args);
    },
    expose: () => {},
  };
  const el = document.createElement('div');
  document.body.append(el);
  const scope = effectScope();
  scope.run(() => {
    const state = def.setup?.(bag, ctx) ?? {};
    const $setup = new Proxy(state, {
      get: (target, key) => unref(Reflect.get(target, key)),
      set: (target, key, value) => {
        const old: unknown = Reflect.get(target, key);
        if (isRef(old) && !isRef(value)) {
          old.value = value;
          return true;
        }
        return Reflect.set(target, key, value);
      },
    });
    insert(def.render($setup, bag, ctx), el);
  });
  return {
    el,
    props: bag,
    emitted,
    unmount: () => {
      scope.stop();
      el.remove();
    },
  };
}
