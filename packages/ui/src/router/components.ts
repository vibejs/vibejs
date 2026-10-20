// oxlint-disable typescript/no-empty-object-type, typescript/no-unsafe-type-assertion -- C4 casts each ComponentDef to its signature
// RouterView and RouterLink, written as the compiler emits components (CONTRACTS C3, C4).
import type { Component, Handle, Slot } from '../component.ts';
import type { IntrinsicElementAttributes, ReservedProps } from '../dom-types.ts';
import { vibeError } from '../errors.gen.ts';
import type { ComponentDef } from '../internal.ts';
import { computed } from '../reactivity/computed.ts';
import { insert } from '../runtime/block.ts';
import { createDynamicComponent } from '../runtime/component.ts';
import { setAttr, setClass, template } from '../runtime/dom.ts';
import { on } from '../runtime/events.ts';
import { inject, provide } from '../runtime/inject.ts';
import type { RawProps } from '../runtime/props.ts';
import { renderEffect } from '../runtime/renderEffect.ts';
import { createSlot } from '../runtime/slots.ts';
import { depthKey, injectRouter, recordKey, useLink } from './composables.ts';
import type { AnyLocation, RouteRecordNormalized, RouterLinkProps } from './types.ts';

/** The props of the record's component: the params for `true`, else the object or the function's result. */
function routeProps(
  record: RouteRecordNormalized | undefined,
  route: AnyLocation,
): Record<string, unknown> {
  const props = record?.props;
  if (props === true) return route.params;
  return typeof props === 'function' ? props(route) : props || {};
}

/**
 * Renders the component of the matched record at its depth, as `<component :is :="props">` would:
 * the same component keeps its instance and gets new props. Records without a component are
 * skipped, and a nested RouterView renders the next record.
 */
export const RouterView = {
  name: 'RouterView',
  setup(_props, { slots }) {
    if (slots.default) throw vibeError('VIBE7115');
    const router = injectRouter('RouterView');
    const depth = inject(depthKey, null);
    const index = computed(() => {
      const { matched } = router.currentRoute.value;
      let i = depth?.value ?? 0;
      while (matched[i] && !matched[i].component) i++;
      return i;
    });
    const record = computed(() => router.currentRoute.value.matched[index.value]);
    provide(
      depthKey,
      computed(() => index.value + 1),
    );
    provide(recordKey, record);
    const props: RawProps = {
      $: [() => routeProps(record.value, router.currentRoute.value)],
    } as RawProps;
    return { record, props };
  },
  render($setup) {
    // A lazy component is loaded before its route is committed.
    const component = () =>
      ($setup.record as RouteRecordNormalized | undefined)?.component as ComponentDef | undefined;
    return createDynamicComponent(() => component() ?? null, $setup.props as RawProps);
  },
} satisfies ComponentDef as ComponentDef as Component<(props: {}) => Handle>;

const t0 = template('<a></a>');

/**
 * A link inside the app, as `<a :href :class :aria-current @click="navigate"><slot/></a>` would
 * render it, built on `useLink()`. Other attributes (`class`, `target`) fall through to the `<a>`.
 */
export const RouterLink = {
  name: 'RouterLink',
  __propKeys: ['to', 'replace', 'activeClass', 'exactActiveClass', 'ariaCurrentValue'],
  setup(props) {
    return useLink({
      to: () => props.to as RouterLinkProps['to'],
      replace: () => props.replace as boolean | undefined,
    });
  },
  render($setup, $props) {
    const a = t0() as Element;
    const navigate = $setup.navigate as (e: MouseEvent) => unknown;
    renderEffect(() => setAttr(a, 'href', $setup.href));
    renderEffect(() =>
      setClass(a, {
        [($props.activeClass as string | undefined) ?? 'router-link-active']: $setup.isActive,
        [($props.exactActiveClass as string | undefined) ?? 'router-link-exact-active']:
          $setup.isExactActive,
      }),
    );
    renderEffect(() =>
      setAttr(a, 'aria-current', $setup.isExactActive ? ($props.ariaCurrentValue ?? 'page') : null),
    );
    on(a, 'click', (e) => navigate(e as MouseEvent));
    insert(createSlot('default'), a);
    return a;
  },
} satisfies ComponentDef as ComponentDef as Component<
  (
    props: RouterLinkProps &
      Omit<IntrinsicElementAttributes['a'], keyof RouterLinkProps> &
      ReservedProps,
  ) => Handle<{ default?: Slot<{}> }>
>;
