// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';
import { computed } from './computed.ts';
import { ReactiveEffect } from './core.ts';
import {
  ARRAY_ITERATE_KEY,
  getDepFromReactive,
  ITERATE_KEY,
  MAP_KEY_ITERATE_KEY,
  targetMap,
  track,
  trigger,
} from './dep.ts';
import { effectScope } from './effectScope.ts';
import { reactive } from './reactive.ts';

function effect(fn: () => unknown): ReactiveEffect {
  const e = new ReactiveEffect(fn);
  e.run();
  return e;
}

/** An effect that tracks `keys` of `target` directly, and counts its runs. */
function reader(target: object, ...keys: unknown[]) {
  const spy = vi.fn<() => void>(() => {
    for (const key of keys) track(target, key);
  });
  effect(spy);
  spy.mockClear();
  return spy;
}

describe('trigger rules', () => {
  test('add and delete on an object trigger the key and ITERATE; set triggers the key only', () => {
    const raw = {};
    const key = reader(raw, 'a');
    const iterate = reader(raw, ITERATE_KEY);
    trigger(raw, 'add', 'a');
    expect([key.mock.calls.length, iterate.mock.calls.length]).toEqual([1, 1]);
    trigger(raw, 'set', 'a');
    expect([key.mock.calls.length, iterate.mock.calls.length]).toEqual([2, 1]);
    trigger(raw, 'delete', 'a');
    expect([key.mock.calls.length, iterate.mock.calls.length]).toEqual([3, 2]);
  });

  test('an array index change triggers ARRAY_ITERATE; an add also triggers length', () => {
    const raw: unknown[] = [];
    const iterate = reader(raw, ARRAY_ITERATE_KEY);
    const length = reader(raw, 'length');
    trigger(raw, 'set', '0');
    expect([iterate.mock.calls.length, length.mock.calls.length]).toEqual([1, 0]);
    trigger(raw, 'add', '1');
    expect([iterate.mock.calls.length, length.mock.calls.length]).toEqual([2, 1]);
    // A non-index key of an array triggers itself only.
    const foo = reader(raw, 'foo');
    trigger(raw, 'add', 'foo');
    expect([iterate.mock.calls.length, length.mock.calls.length, foo.mock.calls.length]).toEqual([
      2, 1, 1,
    ]);
  });

  test('length = n triggers length, ARRAY_ITERATE and the indices >= n only', () => {
    const raw = [1, 2, 3];
    const below = reader(raw, '0');
    const at = reader(raw, '1');
    const above = reader(raw, '2');
    const length = reader(raw, 'length');
    const iterate = reader(raw, ARRAY_ITERATE_KEY);
    const other = reader(raw, 'foo');
    trigger(raw, 'set', 'length', 1);
    expect([below, at, above, length, iterate, other].map((spy) => spy.mock.calls.length)).toEqual([
      0, 1, 1, 1, 1, 0,
    ]);
  });

  test('Map: add and delete trigger MAP_KEY_ITERATE, set triggers ITERATE only', () => {
    const raw = new Map();
    const iterate = reader(raw, ITERATE_KEY);
    const keys = reader(raw, MAP_KEY_ITERATE_KEY);
    trigger(raw, 'add', 'k');
    expect([iterate.mock.calls.length, keys.mock.calls.length]).toEqual([1, 1]);
    trigger(raw, 'set', 'k');
    expect([iterate.mock.calls.length, keys.mock.calls.length]).toEqual([2, 1]);
    trigger(raw, 'delete', 'k');
    expect([iterate.mock.calls.length, keys.mock.calls.length]).toEqual([3, 2]);
  });

  test('clear triggers every key', () => {
    const raw = new Set();
    const spies = [reader(raw, 'a'), reader(raw, ITERATE_KEY), reader(raw, 'b')];
    trigger(raw, 'clear');
    expect(spies.map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1]);
  });

  test('an untracked target or key triggers nothing, and track without a reader is a no-op', () => {
    const raw = {};
    trigger(raw, 'set', 'a');
    track(raw, 'a');
    expect(targetMap.has(raw)).toBe(false);
    reader(raw, 'a');
    trigger(raw, 'set', 'b');
    expect(getDepFromReactive(raw, 'b')).toBeUndefined();
  });
});

describe('batching', () => {
  test('one mutation re-runs an effect that reads several affected keys once', () => {
    const list = reactive([1, 2, 3]);
    const listSpy = vi.fn<() => void>(() => {
      void list.length;
      void list[0];
      void list[2];
      list.forEach(() => {});
    });
    effect(listSpy);
    list.splice(0, 1);
    expect(listSpy).toHaveBeenCalledTimes(2);
    list.length = 0;
    expect(listSpy).toHaveBeenCalledTimes(3);

    const map = reactive(new Map([['a', 1]]));
    const mapSpy = vi.fn<() => void>(() => {
      void map.get('a');
      void map.size;
      void [...map.keys()];
    });
    effect(mapSpy);
    map.clear();
    expect(mapSpy).toHaveBeenCalledTimes(2);
  });
});

describe('release', () => {
  test('stopping the last effect of a key releases the key, then the target', () => {
    const raw = { a: 1, b: 1 };
    const state = reactive(raw);
    const a = effect(() => state.a);
    const b = effect(() => state.b);
    expect(getDepFromReactive(raw, 'a')).toBeDefined();
    a.stop();
    expect(getDepFromReactive(raw, 'a')).toBeUndefined();
    expect(targetMap.has(raw)).toBe(true);
    b.stop();
    expect(targetMap.has(raw)).toBe(false);

    // Tracking again works.
    let dummy = 0;
    effect(() => (dummy = state.a));
    state.a = 2;
    expect(dummy).toBe(2);
    expect(getDepFromReactive(raw, 'a')).toBeDefined();
  });

  test('stopping a scope releases the keys its effects read', () => {
    const raw = { a: 1 };
    const state = reactive(raw);
    const scope = effectScope();
    scope.run(() => effect(() => state.a));
    expect(targetMap.has(raw)).toBe(true);
    scope.stop();
    expect(targetMap.has(raw)).toBe(false);
  });

  test('a computed that loses its last subscriber releases the keys it read', () => {
    const raw = { a: 1 };
    const state = reactive(raw);
    const double = computed(() => state.a * 2);
    const e = effect(() => double.value);
    expect(getDepFromReactive(raw, 'a')).toBeDefined();
    e.stop();
    expect(getDepFromReactive(raw, 'a')).toBeUndefined();
    expect(targetMap.has(raw)).toBe(false);
    state.a = 2;
    expect(double.value).toBe(4);
  });

  test('a key no longer read by a re-run is released', () => {
    const raw = { flag: true, a: 1 };
    const state = reactive(raw);
    effect(() => (state.flag ? state.a : 0));
    expect(getDepFromReactive(raw, 'a')).toBeDefined();
    state.flag = false;
    expect(getDepFromReactive(raw, 'a')).toBeUndefined();
    expect(getDepFromReactive(raw, 'flag')).toBeDefined();
  });
});
