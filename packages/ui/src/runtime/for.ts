// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/renderer.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-core/src/helpers/renderList.ts (MIT)
//
// The keyed reconciliation of `patchKeyedChildren` and `getSequence`, on items instead of vnodes.
import { vibeError } from '../errors.gen.ts';
import { reactiveReadArray } from '../reactivity/arrayInstrumentations.ts';
import { activeEffectScope, type EffectScopeImpl } from '../reactivity/effectScope.ts';
import { wrapperFor } from '../reactivity/reactive.ts';
import { shallowRef, type ShallowRef } from '../reactivity/ref.ts';
import { isObject } from '../shared.ts';
import { warn } from '../warn.ts';
import { build, firstNode, Fragment, insert, removeNodes, type Block } from './block.ts';
import { renderEffect } from './renderEffect.ts';

interface Item {
  key: unknown;
  scope: EffectScopeImpl;
  nodes: Block;
  item: ShallowRef<unknown>;
  k: ShallowRef<unknown> | undefined;
  i: ShallowRef<number> | undefined;
}

const isIterable = (value: unknown): value is Iterable<unknown> =>
  isObject(value) && Symbol.iterator in value;

/** The values of a v-for source and, for a plain object, its keys. */
function entries(source: unknown): [values: unknown[], keys?: string[]] {
  if (source == null) return [[]];
  if (Array.isArray(source)) return [reactiveReadArray(source, wrapperFor(source))];
  if (typeof source === 'string') return [source.split('')];
  if (typeof source === 'number' && Number.isInteger(source) && source >= 0) {
    return [Array.from({ length: source }, (_, i) => i + 1)];
  }
  if (isIterable(source)) return [Array.from(source)];
  if (isObject(source)) {
    const keys = Object.keys(source);
    return [keys.map((key) => source[key]), keys];
  }
  if (__DEV__) warn(vibeError('VIBE5401', { type: typeof source }));
  return [[]];
}

/**
 * `v-for`: renders one block per entry of `src()`, matched across updates by `getKey`. Sources:
 * arrays (reactive ones track their items), iterables (`Map` entries are `[key, value]`
 * pairs), strings, an integer `n >= 0` (`1` to `n`) and plain objects (value, key, index);
 * `null` and `undefined` render nothing, any other value warns VIBE5401. Each item renders in
 * its own effect scope and reads its value through `item`, a shallow ref updated in place while
 * its key stays; `key` and `index` are created only when `render` declares them. Updates do the
 * fewest DOM moves (longest increasing subsequence). Codegen always passes `getKey`: the `:key`
 * expression, or `v => v` without one.
 */
export function createFor<T>(
  src: () => unknown,
  render: (item: ShallowRef<T>, key: ShallowRef<unknown>, index: ShallowRef<number>) => Block,
  getKey: (item: T, key: unknown, index: number) => unknown,
): Fragment {
  const frag = new Fragment();
  const owner = activeEffectScope;
  const withKey = render.length > 1;
  const withIndex = render.length > 2;
  let items: Item[] = [];

  renderEffect(() => {
    const [values, objectKeys] = entries(src());
    const keyOf = (i: number): unknown => objectKeys?.[i] ?? i;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T is the item type codegen infers
    const keys = values.map((value, i) => getKey(value as T, keyOf(i), i));
    if (__DEV__) {
      const seen = new Set<unknown>();
      for (const key of keys) {
        if (seen.has(key)) warn(vibeError('VIBE5402', { key: String(key) }));
        seen.add(key);
      }
    }
    const parent = frag.anchor.parentNode;
    const next: Item[] = Array.from({ length: values.length });

    const update = (item: Item, i: number) => {
      item.item.value = values[i];
      if (item.k) item.k.value = keyOf(i);
      if (item.i) item.i.value = i;
      next[i] = item;
    };
    /** The node that the item at `i` goes before: the first node of a later item, or the anchor. */
    const anchorAfter = (i: number): Node => {
      for (let j = i + 1; j < next.length; j++) {
        const node = firstNode(next[j].nodes);
        if (node) return node;
      }
      return frag.anchor;
    };
    const mount = (i: number, anchor: Node) => {
      const item = shallowRef(values[i]);
      const k = withKey ? shallowRef(keyOf(i)) : undefined;
      const index = withIndex ? shallowRef(i) : undefined;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- refs of unknown hold T; absent refs are never read
      const [scope, nodes] = build(owner, () => render(item as ShallowRef<T>, k!, index!));
      next[i] = { key: keys[i], scope, nodes, item, k, i: index };
      if (parent) insert(nodes, parent, anchor);
    };
    const unmount = (item: Item) => {
      item.scope.stop();
      removeNodes(item.nodes);
    };

    let i = 0;
    let e1 = items.length - 1;
    let e2 = values.length - 1;
    // The common prefix and suffix keep their place.
    for (; i <= e1 && i <= e2 && Object.is(items[i].key, keys[i]); i++) update(items[i], i);
    for (; i <= e1 && i <= e2 && Object.is(items[e1].key, keys[e2]); e1--, e2--) {
      update(items[e1], e2);
    }

    if (i > e1) {
      // New items between the prefix and the suffix render in order before the suffix.
      const anchor = anchorAfter(e2);
      for (let j = i; j <= e2; j++) mount(j, anchor);
    } else if (i > e2) {
      for (let j = i; j <= e1; j++) unmount(items[j]);
    } else {
      const keyToIndex = new Map<unknown, number>();
      for (let j = i; j <= e2; j++) keyToIndex.set(keys[j], j);
      // The old index + 1 of each new index from `i`; 0 for a new item.
      const sources = Array.from<number>({ length: e2 - i + 1 }).fill(0);
      let moved = false;
      let maxIndex = 0;
      for (let j = i; j <= e1; j++) {
        const item = items[j];
        const index = keyToIndex.get(item.key);
        // A stale key, or a duplicate key whose new index is taken.
        if (index === undefined || sources[index - i]) {
          unmount(item);
          continue;
        }
        sources[index - i] = j + 1;
        if (index >= maxIndex) maxIndex = index;
        else moved = true;
        update(item, index);
      }
      const stay = moved ? getSequence(sources) : [];
      let s = stay.length - 1;
      for (let j = sources.length - 1; j >= 0; j--) {
        if (!sources[j]) mount(i + j, anchorAfter(i + j));
        else if (moved) {
          if (s >= 0 && j === stay[s]) s--;
          else if (parent) insert(next[i + j].nodes, parent, anchorAfter(i + j));
        }
      }
    }
    items = next;
    frag.nodes = next.map((item) => item.nodes);
  });
  return frag;
}

/** The indexes of a longest increasing subsequence of the non-zero entries of `arr`. */
function getSequence(arr: number[]): number[] {
  const p = arr.slice();
  const result = [0];
  for (let i = 0; i < arr.length; i++) {
    const value = arr[i];
    if (!value) continue;
    const last = result.at(-1)!;
    if (arr[last] < value) {
      p[i] = last;
      result.push(i);
      continue;
    }
    let u = 0;
    let v = result.length - 1;
    while (u < v) {
      const c = (u + v) >> 1;
      if (arr[result[c]] < value) u = c + 1;
      else v = c;
    }
    // Entries are distinct, so `value` is below `arr[result[u]]` here.
    if (u > 0) p[i] = result[u - 1];
    result[u] = i;
  }
  let u = result.length;
  let v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }
  return result;
}
