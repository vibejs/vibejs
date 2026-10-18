import type { RouterHistory } from './types.ts';

type Listener = Parameters<RouterHistory['listen']>[0];

/** A history kept in memory: for tests and for environments without a URL bar. */
export function createMemoryHistory(base = ''): RouterHistory {
  const listeners = new Set<Listener>();
  let entries = ['/'];
  let index = 0;
  base = ('/' + base).replace(/^\/+/, '/').replace(/\/+$/, '');
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
