import { afterEach, describe, expect, test, vi, type MockInstance } from 'vitest';
import { isRef } from '../reactivity/dep.ts';
import { reactive } from '../reactivity/reactive.ts';
import { ref, shallowRef, type ShallowRef } from '../reactivity/ref.ts';
import { insert, type Block } from './block.ts';
import { setText } from './dom.ts';
import { createFor } from './for.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

interface Row {
  id: number;
  label: string;
}

const rows = (ids: number[]): Row[] => ids.map((id) => ({ id, label: `row ${id}` }));
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** A keyed list of `<li>` rows, inserted into a `<ul>`. */
function mountRows(src: () => unknown) {
  const ul = document.createElement('ul');
  insert(
    createFor<Row>(
      src,
      (item) => {
        const li = document.createElement('li');
        renderEffect(() => setText(li, item.value.label));
        return li;
      },
      (item) => item.id,
    ),
    ul,
  );
  return ul;
}

const texts = (parent: Element) => [...parent.children].map((c) => c.textContent);

/** Counts DOM inserts and removals from now on. */
function spyOps() {
  const inserts: MockInstance = vi.spyOn(Node.prototype, 'insertBefore');
  const removals: MockInstance = vi.spyOn(Node.prototype, 'removeChild');
  return () => ({ inserts: inserts.mock.calls.length, removals: removals.mock.calls.length });
}

describe('DOM operations', () => {
  test('swapping 2 rows of 10 takes 2 moves', async () => {
    const list = shallowRef(rows(range(10)));
    const ul = mountRows(() => list.value);
    const before = [...ul.children];
    const ops = spyOps();
    const ids = range(10);
    [ids[1], ids[8]] = [ids[8], ids[1]];
    list.value = ids.map((id) => list.value[id - 1]);
    await nextTick();
    expect(ops()).toEqual({ inserts: 2, removals: 0 });
    expect(texts(ul)).toEqual(ids.map((id) => `row ${id}`));
    // The same elements, moved.
    expect(before.every((li) => li.parentNode === ul)).toBe(true);
  });

  test('appending 1 row takes 1 insert and no move', async () => {
    const list = reactive(rows(range(10)));
    const ul = mountRows(() => list);
    const ops = spyOps();
    list.push(...rows([11]));
    await nextTick();
    expect(ops()).toEqual({ inserts: 1, removals: 0 });
    expect(texts(ul).at(-1)).toBe('row 11');
  });

  test('reversing n rows takes n - 1 moves', async () => {
    const list = reactive(rows(range(8)));
    const ul = mountRows(() => list);
    const ops = spyOps();
    list.reverse();
    await nextTick();
    expect(ops()).toEqual({ inserts: 7, removals: 0 });
    expect(texts(ul)).toEqual(range(8).map((i) => `row ${9 - i}`));
  });

  test('reorders keep the longest run in place', async () => {
    for (const [order, moves] of [
      [[2, 4, 3, 1], 2],
      [[4, 3, 1, 2], 2],
    ] as const) {
      const list = shallowRef(rows([1, 2, 3, 4]));
      const ul = mountRows(() => list.value);
      const ops = spyOps();
      list.value = rows([...order]);
      await nextTick();
      expect(ops()).toEqual({ inserts: moves, removals: 0 });
      expect(texts(ul)).toEqual(order.map((id) => `row ${id}`));
      vi.restoreAllMocks();
    }
  });

  test('replacing rows around a kept row moves nothing', async () => {
    const list = shallowRef(rows([1, 2, 3, 4]));
    const ul = mountRows(() => list.value);
    const ops = spyOps();
    list.value = rows([1, 5, 3, 6, 4]);
    await nextTick();
    expect(ops()).toEqual({ inserts: 2, removals: 1 });
    expect(texts(ul)).toEqual(['row 1', 'row 5', 'row 3', 'row 6', 'row 4']);
  });

  test('removing 1 row takes 1 removal', async () => {
    const list = reactive(rows(range(10)));
    const ul = mountRows(() => list);
    const ops = spyOps();
    list.splice(4, 1);
    await nextTick();
    expect(ops()).toEqual({ inserts: 0, removals: 1 });
    expect(texts(ul)).not.toContain('row 5');
  });

  test('a same-key update writes only the changed text', async () => {
    const list = shallowRef(rows(range(10)));
    const ul = mountRows(() => list.value);
    const ops = spyOps();
    const writes = vi.spyOn(Node.prototype, 'textContent', 'set');
    list.value = rows(range(10)).map((row) => (row.id === 3 ? { ...row, label: 'three' } : row));
    await nextTick();
    expect(ops()).toEqual({ inserts: 0, removals: 0 });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(texts(ul)[2]).toBe('three');
  });
});

/** Renders `src` to text: one `value|key|index` line per item. */
function mountEntries(src: () => unknown) {
  const div = document.createElement('div');
  insert(
    createFor(
      src,
      (item: ShallowRef<unknown>, key, index) => {
        const text = document.createTextNode('');
        renderEffect(() =>
          setText(text, `${String(item.value)}|${String(key.value)}|${index.value};`),
        );
        return text;
      },
      (_item, key) => key,
    ),
    div,
  );
  return div;
}

describe('sources', () => {
  test('arrays, strings and integers', () => {
    expect(mountEntries(() => ['a', 'b']).textContent).toBe('a|0|0;b|1|1;');
    expect(mountEntries(() => 'hi').textContent).toBe('h|0|0;i|1|1;');
    expect(mountEntries(() => 3).textContent).toBe('1|0|0;2|1|1;3|2|2;');
    expect(mountEntries(() => 0).textContent).toBe('');
  });

  test('plain objects as value, key and index', () => {
    expect(mountEntries(() => ({ x: 1, y: 2 })).textContent).toBe('1|x|0;2|y|1;');
  });

  test('iterables: Set values and Map entries', () => {
    expect(mountEntries(() => new Set(['a', 'b'])).textContent).toBe('a|0|0;b|1|1;');
    expect(mountEntries(() => new Map([['k', 'v']])).textContent).toBe('k,v|0|0;');
  });

  test('null and undefined render nothing', async () => {
    const src = ref<string[] | null | undefined>(null);
    const div = mountEntries(() => src.value);
    expect(div.textContent).toBe('');
    src.value = ['a'];
    await nextTick();
    expect(div.textContent).toBe('a|0|0;');
    src.value = undefined;
    await nextTick();
    expect(div.textContent).toBe('');
  });

  test('a reactive array tracks push and splice, with reactive items', async () => {
    const list = reactive([{ n: 1 }, { n: 2 }]);
    const div = document.createElement('div');
    const seen: unknown[] = [];
    insert(
      createFor<{ n: number }>(
        () => list,
        (item) => {
          seen.push(item.value);
          const text = document.createTextNode('');
          renderEffect(() => setText(text, `${item.value.n};`));
          return text;
        },
        (item) => item.n,
      ),
      div,
    );
    expect(seen).toEqual([list[0], list[1]]);
    expect(seen[0]).toBe(list[0]);
    list.push({ n: 3 });
    await nextTick();
    expect(div.textContent).toBe('1;2;3;');
    list.splice(0, 2, { n: 0 });
    await nextTick();
    expect(div.textContent).toBe('0;3;');
    list[0].n = 5;
    await nextTick();
    expect(div.textContent).toBe('5;3;');
  });

  test('a reactive Set tracks additions', async () => {
    const set = reactive(new Set([1]));
    const div = mountEntries(() => set);
    set.add(2);
    await nextTick();
    expect(div.textContent).toBe('1|0|0;2|1|1;');
  });

  test('an invalid source warns VIBE5401 and renders nothing', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const src of [true, -1, 1.5, () => {}]) {
      expect(mountEntries(() => src).textContent).toBe('');
    }
    const codes = spy.mock.calls.map(([message]) => String(message).slice(1, 9));
    expect(codes).toEqual(['VIBE5401', 'VIBE5401', 'VIBE5401', 'VIBE5401']);
    expect(spy.mock.calls.map(([message]) => String(message).split('\n')[0])).toEqual([
      '[VIBE5401] v-for cannot iterate over a value of type boolean, so it rendered nothing.',
      '[VIBE5401] v-for cannot iterate over a value of type number, so it rendered nothing.',
      '[VIBE5401] v-for cannot iterate over a value of type number, so it rendered nothing.',
      '[VIBE5401] v-for cannot iterate over a value of type function, so it rendered nothing.',
    ]);
  });

  test('an invalid source is silent in prod', () => {
    vi.stubGlobal('__DEV__', false);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mountEntries(() => true).textContent).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('items', () => {
  test('creates the key and index refs only when render declares them', () => {
    const args: unknown[][] = [];
    createFor(
      () => ['a'],
      (item: ShallowRef<string>, key, index) => {
        args.push([item, key, index]);
        return [];
      },
      (v) => v,
    );
    createFor(
      () => ['a'],
      (item) => {
        args.push([item, undefined, undefined]);
        return [];
      },
      (v) => v,
    );
    const two = (item: ShallowRef<string>, key: ShallowRef<unknown>): Block => {
      args.push([item, key]);
      return [];
    };
    createFor(
      () => ['a'],
      two,
      (v) => v,
    );
    expect(args.map((a) => a.map((r) => (isRef(r) ? r.value : r)))).toEqual([
      ['a', 0, 0],
      ['a', undefined, undefined],
      ['a', 0],
    ]);
  });

  test('updates the key and index refs of moved items in place', async () => {
    const list = ref(['a', 'b', 'c']);
    const div = mountEntries(() => Object.fromEntries(list.value.map((v) => [v, v.toUpperCase()])));
    const nodes = [...div.childNodes];
    list.value = ['c', 'a', 'b'];
    await nextTick();
    expect(div.textContent).toBe('C|c|0;A|a|1;B|b|2;');
    expect(div.childNodes[0]).toBe(nodes[2]);
  });

  test('keeps the order when updated before it is inserted', async () => {
    const list = shallowRef(rows([1, 2, 3]));
    const frag = createFor<Row>(
      () => list.value,
      (item) => document.createTextNode(String(item.value.id)),
      (item) => item.id,
    );
    list.value = rows([3, 4, 1]);
    await nextTick();
    const div = document.createElement('div');
    insert(frag, div);
    expect(div.textContent).toBe('341');
  });

  test('inserts before the next item that has nodes', async () => {
    const list = shallowRef([1, 2]);
    const div = document.createElement('div');
    insert(
      createFor<number>(
        () => list.value,
        (item) => (item.value === 2 ? [] : document.createTextNode(String(item.value))),
        (v) => v,
      ),
      div,
    );
    list.value = [1, 3, 2];
    await nextTick();
    list.value = [4, 1, 3, 2];
    await nextTick();
    expect(div.textContent).toBe('413');
  });

  test('duplicate keys warn VIBE5402 and still render every item', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const list = shallowRef([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 2, label: 'c' },
      { id: 3, label: 'd' },
    ]);
    const ul = mountRows(() => list.value);
    expect(texts(ul)).toEqual(['a', 'b', 'c', 'd']);
    expect(String(spy.mock.calls[0][0]).slice(1, 9)).toBe('VIBE5402');
    expect(String(spy.mock.calls[0][0])).toMatch(
      /^\[VIBE5402\] Two items of a v-for have the key 2\./,
    );
    list.value = [
      { id: 3, label: 'd' },
      { id: 2, label: 'e' },
      { id: 2, label: 'f' },
      { id: 1, label: 'g' },
    ];
    await nextTick();
    expect(texts(ul)).toEqual(['d', 'e', 'f', 'g']);
  });

  test('duplicate keys are silent in prod', () => {
    vi.stubGlobal('__DEV__', false);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountRows(() => rows([1, 1]));
    expect(spy).not.toHaveBeenCalled();
  });

  test('clears and refills the list', async () => {
    const list = shallowRef(rows([1, 2]));
    const ul = mountRows(() => list.value);
    list.value = [];
    await nextTick();
    expect(ul.innerHTML).toBe('<!---->');
    list.value = rows([5, 1, 2, 3, 4]);
    await nextTick();
    list.value = rows([1, 2, 5, 3, 4]);
    await nextTick();
    expect(texts(ul)).toEqual(['row 1', 'row 2', 'row 5', 'row 3', 'row 4']);
  });
});
