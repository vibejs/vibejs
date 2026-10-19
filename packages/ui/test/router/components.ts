// oxlint-disable typescript/no-unsafe-type-assertion -- fixtures typed as C4 components
// Fixture components of the router tests, written as the compiler emits them.
import type { App, Component } from '@vibejs-org/ui';
import {
  child,
  createComponent,
  insert,
  renderEffect,
  setAttr,
  template,
  type ComponentDef,
} from '@vibejs-org/ui/internal';
import { RouterLink, RouterView } from '@vibejs-org/ui/router';

const t0 = template('<section><!----></section>');

/**
 * A page: a `<section>` with the class `name` and its props in `data-props`, and a nested
 * RouterView with `nested`. `setup` runs in the page's setup, once per instance.
 */
export function page(
  name: string,
  options: { props?: string[]; nested?: boolean; setup?: () => void } = {},
): Component {
  const { props = [], nested = false, setup } = options;
  return {
    name,
    __propKeys: props,
    setup: () => {
      setup?.();
    },
    render(_, $props) {
      const el = t0() as Element;
      el.className = name;
      renderEffect(() => setAttr(el, 'data-props', JSON.stringify(props.map((k) => $props[k]))));
      if (nested) insert(createComponent(RouterView), el, child(el));
      return el;
    },
  } satisfies ComponentDef;
}

const t1 = template('<nav></nav>');

/** A `<nav>` with one RouterLink per props object (getters of each value); the link text is its index. */
export function links(...list: Record<string, unknown>[]): Component {
  return {
    name: 'Links',
    render() {
      const nav = t1() as Element;
      list.forEach((props, i) => {
        const raw = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, () => v]));
        insert(
          createComponent(RouterLink, raw, { default: () => document.createTextNode(String(i)) }),
          nav,
        );
      });
      return nav;
    },
  } satisfies ComponentDef;
}

/** Renders a RouterView with slot content (VIBE7115). */
export const ViewWithSlot: Component = {
  name: 'ViewWithSlot',
  render: () => createComponent(RouterView, null, { default: () => [] }),
};

/** A plugin that sends the app's errors and warnings to the given handlers. */
export const handlers =
  (errorHandler: (err: unknown) => void, warnHandler: (msg: string) => void = () => {}) =>
  (app: App): void => {
    app.config.errorHandler = errorHandler;
    app.config.warnHandler = warnHandler;
  };
