import { afterEach, describe, expect, it, vi } from 'vitest';
import { thrownCode } from '../../test/codes.ts';
import { createMemoryHistory, createWebHistory, isWebHistory } from './history.ts';
import type { RouterHistory } from './types.ts';

type Listener = Parameters<RouterHistory['listen']>[0];

describe('createMemoryHistory', () => {
  it('starts at / and pushes and replaces entries', () => {
    const history = createMemoryHistory();
    expect(history.location).toBe('/');
    history.push('/a');
    history.push('/b');
    history.replace('/c');
    expect(history.location).toBe('/c');
    history.go(-1);
    expect(history.location).toBe('/a');
    // A push drops the forward entries.
    history.push('/d');
    history.go(1);
    expect(history.location).toBe('/d');
    history.go(-2);
    expect(history.location).toBe('/');
  });

  it('clamps go() and notifies listeners synchronously with the applied delta', () => {
    const history = createMemoryHistory();
    history.push('/a');
    history.push('/b');
    const listener = vi.fn<Listener>();
    history.listen(listener);
    history.go(-5);
    expect(listener).toHaveBeenCalledExactlyOnceWith('/', '/b', { delta: -2 });
    history.go(-1);
    expect(listener).toHaveBeenCalledTimes(1);
    history.go(9);
    expect(listener).toHaveBeenLastCalledWith('/b', '/', { delta: 2 });
    expect(history.location).toBe('/b');
  });

  it('pauses listeners with triggerListeners false, and stops one on unlisten', () => {
    const history = createMemoryHistory();
    history.push('/a');
    const listener = vi.fn<Listener>();
    const other = vi.fn<Listener>();
    const unlisten = history.listen(listener);
    history.listen(other);
    history.go(-1, false);
    expect(history.location).toBe('/');
    expect(listener).not.toHaveBeenCalled();
    unlisten();
    history.go(1);
    expect(listener).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledExactlyOnceWith('/a', '/', { delta: 1 });
  });

  it('normalizes the base to a leading slash without a trailing one', () => {
    expect(createMemoryHistory().base).toBe('');
    expect(createMemoryHistory('/').base).toBe('');
    expect(createMemoryHistory('app/').base).toBe('/app');
    expect(createMemoryHistory('//app/v1//').base).toBe('/app/v1');
    expect(createMemoryHistory('app').createHref('/x?y#z')).toBe('/app/x?y#z');
  });

  it('clears listeners and entries on destroy', () => {
    const history = createMemoryHistory();
    const listener = vi.fn<Listener>();
    history.listen(listener);
    history.push('/a');
    history.push('/b');
    history.destroy();
    expect(history.location).toBe('/');
    history.push('/c');
    history.go(-1);
    expect(listener).not.toHaveBeenCalled();
    expect(history.location).toBe('/');
  });
});

/** Resolves with the next popstate, after the history handled it. */
const popped = () =>
  new Promise<void>((resolve) => {
    window.addEventListener('popstate', () => setTimeout(resolve), { once: true });
  });

describe('createWebHistory', () => {
  const created: RouterHistory[] = [];
  const web = (base?: string) => {
    const history = createWebHistory(base);
    created.push(history);
    return history;
  };

  afterEach(() => {
    for (const history of created.splice(0)) history.destroy();
    // A new last entry, as on a page load.
    window.history.pushState(null, '', '/');
  });

  it('throws VIBE7117 without a window', () => {
    vi.stubGlobal('window', undefined);
    expect(thrownCode(() => createWebHistory())).toBe('VIBE7117');
    vi.unstubAllGlobals();
  });

  it('strips the base from the location and gives the first entry its position', () => {
    window.history.replaceState(null, '', '/app/users/1?q=1#h');
    const history = web('app/');
    expect(isWebHistory(history)).toBe(true);
    expect(isWebHistory(createMemoryHistory())).toBe(false);
    expect(history.base).toBe('/app');
    expect(history.location).toBe('/users/1?q=1#h');
    expect(window.history.state).toEqual({ position: window.history.length - 1 });
    expect(history.createHref('/x')).toBe('/app/x');
    window.history.replaceState(null, '', '/app');
    expect(web('/app').location).toBe('/');
    // A URL outside the base keeps its whole path.
    window.history.replaceState({ position: 0 }, '', '/other');
    expect(web('/app').location).toBe('/other');
    expect(web().location).toBe('/other');
  });

  it('pushes and replaces entries with their positions, and reports popstate deltas', async () => {
    const history = web('/app');
    const start = window.history.state.position;
    history.push('/a');
    expect(window.location.pathname).toBe('/app/a');
    expect(window.history.state).toEqual({ position: start + 1 });
    history.replace('/b?x');
    expect(window.history.state).toEqual({ position: start + 1 });
    expect(history.location).toBe('/b?x');
    const listener = vi.fn<Listener>();
    history.listen(listener);
    history.go(-1);
    await popped();
    expect(listener).toHaveBeenCalledExactlyOnceWith('/', '/b?x', { delta: -1 });
    expect(history.location).toBe('/');
  });

  it('pauses the listeners for one popstate, and stops on unlisten and destroy', async () => {
    const history = web();
    history.push('/a');
    const listener = vi.fn<Listener>();
    const unlisten = history.listen(listener);
    history.go(-1, false);
    await popped();
    expect(listener).not.toHaveBeenCalled();
    expect(history.location).toBe('/');
    history.go(1);
    await popped();
    expect(listener).toHaveBeenCalledOnce();
    unlisten();
    const other = vi.fn<Listener>();
    history.listen(other);
    history.destroy();
    window.history.back();
    await popped();
    expect(listener).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
  });

  it('gives an entry without a state a position on popstate', async () => {
    const history = web();
    const listener = vi.fn<Listener>();
    history.listen(listener);
    window.history.pushState(null, '', '/hash#x');
    window.history.back();
    await popped();
    window.history.forward();
    await popped();
    expect(window.history.state).toEqual({ position: window.history.length - 1 });
    expect(listener).toHaveBeenLastCalledWith('/hash#x', '/', { delta: 1 });
  });

  it('saves the scroll in the entry on pagehide', () => {
    web();
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(120);
    window.dispatchEvent(new Event('pagehide'));
    expect(window.history.state).toMatchObject({ scroll: { left: 0, top: 120 } });
  });
});
