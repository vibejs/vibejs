import { vibeError } from '../errors.gen.ts';
import type { RouterHistory } from './types.ts';

type Listener = Parameters<RouterHistory['listen']>[0];

/** A leading `/` and no trailing `/`; `''` for the root. */
const normalizeBase = (base: string): string =>
  ('/' + base).replace(/^\/+/, '/').replace(/\/+$/, '');

/** A history kept in memory: for tests and for environments without a URL bar. */
export function createMemoryHistory(base = ''): RouterHistory {
  const listeners = new Set<Listener>();
  let entries = ['/'];
  let index = 0;
  base = normalizeBase(base);
  return {
    base,
    get location() {
      return entries[index];
    },
    push(to) {
      entries = [...entries.slice(0, ++index), to];
    },
    replace(to) {
      entries[index] = to;
    },
    go(delta, triggerListeners = true) {
      const from = entries[index];
      const next = Math.min(Math.max(index + delta, 0), entries.length - 1);
      const applied = next - index;
      index = next;
      if (!applied || !triggerListeners) return;
      for (const listener of listeners) listener(entries[index], from, { delta: applied });
    },
    listen(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    createHref: (location) => base + location,
    destroy() {
      listeners.clear();
      entries = ['/'];
      index = 0;
    },
  };
}

/** What a web history keeps in `history.state`: the entry index, and the scroll saved on `pagehide`. */
export interface HistoryState {
  position: number;
  scroll?: { left: number; top: number };
}

const webHistories = new WeakSet<RouterHistory>();

/** Whether `history` is a web history, whose navigations scroll the page. */
export const isWebHistory = (history: RouterHistory): boolean => webHistories.has(history);

/** The state of the current entry; an entry without one (such as the first) gets its index. */
export function historyState(): HistoryState {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the router writes every state
  const state = window.history.state as HistoryState | null;
  if (typeof state?.position === 'number') return state;
  const fresh = { position: window.history.length - 1 };
  window.history.replaceState(fresh, '');
  return fresh;
}

/**
 * A history of the browser's URL bar, under `base` (`import.meta.env.BASE_URL` in an app). Each
 * entry stores its index in `history.state`, so a `popstate` reports how far it moved.
 */
export function createWebHistory(base = ''): RouterHistory {
  if (typeof window === 'undefined') throw vibeError('VIBE7117');
  base = normalizeBase(base);
  const listeners = new Set<Listener>();
  const read = (): string => {
    const { pathname, search, hash } = window.location;
    const path =
      pathname === base || pathname.startsWith(base + '/')
        ? pathname.slice(base.length) || '/'
        : pathname;
    return path + search + hash;
  };
  let location = read();
  let position = historyState().position;
  let paused = false;

  const onPopState = (): void => {
    const from = location;
    const next = historyState().position;
    const delta = next - position;
    location = read();
    position = next;
    if (paused) {
      paused = false;
      return;
    }
    for (const listener of listeners) listener(location, from, { delta });
  };
  // Saves the scroll in the entry, so that a reload restores it.
  const onPageHide = (): void => {
    const scroll = { left: window.scrollX, top: window.scrollY };
    window.history.replaceState({ ...historyState(), scroll }, '');
  };
  window.addEventListener('popstate', onPopState);
  window.addEventListener('pagehide', onPageHide);

  const history: RouterHistory = {
    base,
    get location() {
      return location;
    },
    push(to) {
      window.history.pushState({ position: ++position }, '', base + to);
      location = to;
    },
    replace(to) {
      window.history.replaceState({ position }, '', base + to);
      location = to;
    },
    go(delta, triggerListeners = true) {
      // The router reverts only by an existing number of entries, so a popstate follows.
      paused = !triggerListeners;
      window.history.go(delta);
    },
    listen(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    createHref: (to) => base + to,
    destroy() {
      listeners.clear();
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('pagehide', onPageHide);
    },
  };
  webHistories.add(history);
  return history;
}
