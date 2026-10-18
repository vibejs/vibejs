// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from './history.ts';
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
