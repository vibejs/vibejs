import { vibeError } from '../errors.gen.ts';
import type { AppConfig } from '../runtime/app.ts';
import { nextTick } from '../runtime/scheduler.ts';
import { warn } from '../warn.ts';
import { historyState } from './history.ts';
import type { AnyLocation, RouterHistory, RouterScrollBehavior, ScrollPosition } from './types.ts';

type Saved = { left: number; top: number };
type Behavior = (
  to: AnyLocation,
  from: AnyLocation,
  saved: Saved | null,
) => ScrollPosition | false | void | Promise<ScrollPosition | false | void>;

/**
 * The default scroll behavior: back and forward restore the saved position, a hash scrolls to its
 * element, a change of the query alone keeps the position, any other navigation scrolls to the top.
 */
const defaultBehavior: Behavior = (to, from, saved) =>
  saved ?? (to.hash ? { el: to.hash } : to.path !== from.path && { left: 0, top: 0 });

/**
 * Scrolls the window to `position`, or its element into view; offsets come from `scroll-margin-top`.
 * A missing element is warned to `config`, the config of the installed app.
 */
function scrollTo(position: ScrollPosition, config: AppConfig | undefined): void {
  if (!('el' in position)) {
    window.scrollTo(position);
    return;
  }
  const { el, behavior } = position;
  if (typeof el !== 'string') {
    el.scrollIntoView({ behavior });
    return;
  }
  // `#id` is an id, as in a hash; any other string is a selector.
  const target = el.startsWith('#')
    ? document.getElementById(decodeURIComponent(el.slice(1)))
    : document.querySelector(el);
  if (target) target.scrollIntoView({ behavior });
  else warn(vibeError('VIBE7116', { el }), null, config);
}

/** The scrolling of a web history's navigations; the router takes over `scrollRestoration`. */
export function createScroll(
  history: RouterHistory,
  behavior: RouterScrollBehavior | undefined,
): {
  /** Saves the scroll of `from`, `offset` entries before the current one, before the commit. */
  save(from: AnyLocation, offset: number): void;
  /** Scrolls once the new route rendered; `restore` passes the saved position of `to`. */
  apply(
    to: AnyLocation,
    from: AnyLocation,
    restore: boolean,
    config: AppConfig | undefined,
  ): Promise<void>;
} {
  window.history.scrollRestoration = 'manual';
  // The router passes its own locations. The assertion is needed once `Register` is augmented.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-assertion
  const scrollBehavior = (behavior as Behavior | undefined) ?? defaultBehavior;
  /** By the entry position and the full path. */
  const positions = new Map<string, Saved>();
  // The scroll that `pagehide` saved before a reload.
  const { position, scroll } = historyState();
  if (scroll) positions.set(`${position}${history.location}`, scroll);
  return {
    save(from, offset) {
      const key = `${historyState().position - offset}${from.fullPath}`;
      positions.set(key, { left: window.scrollX, top: window.scrollY });
    },
    async apply(to, from, restore, config) {
      const key = `${historyState().position}${to.fullPath}`;
      const saved = (restore && positions.get(key)) || null;
      await nextTick();
      const target = await scrollBehavior(to, from, saved);
      if (target) scrollTo(target, config);
    },
  };
}
