import { afterEach, expect, test, vi } from 'vitest';
import { effectScope } from '../reactivity/effectScope.ts';
import { ref } from '../reactivity/ref.ts';
import { createIf, createKeyed, firstNode, Fragment, insert, removeNodes } from './block.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const el = (tag: string, text = '') => {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
};

test('insert places nodes, arrays and a fragment with its anchor last', () => {
  const parent = el('div');
  const end = parent.appendChild(document.createComment('end'));
  const frag = new Fragment();
  frag.nodes = [el('b'), [el('i')]];
  insert([el('a'), frag], parent, end);
  expect(parent.innerHTML).toBe('<a></a><b></b><i></i><!----><!--end-->');
  insert(el('p'), parent);
  expect(parent.lastChild!.nodeName).toBe('P');
});

test('removeNodes removes every node of a block, inserted or not', () => {
  const parent = el('div');
  const frag = new Fragment();
  frag.nodes = el('b');
  insert([el('a'), frag], parent);
  removeNodes([parent.firstChild!, frag, el('detached')]);
  expect(parent.innerHTML).toBe('');
});

test('firstNode finds the first node of nested and empty blocks', () => {
  const a = el('a');
  const empty = new Fragment();
  expect(firstNode([[], empty, a])).toBe(empty.anchor);
  const filled = new Fragment();
  filled.nodes = [[], a];
  expect(firstNode(filled)).toBe(a);
  expect(firstNode([[]])).toBeUndefined();
});

test('createIf swaps branches on truthiness changes only', async () => {
  const value = ref<unknown>(1);
  const renders: string[] = [];
  const parent = el('div');
  const frag = createIf(
    () => value.value,
    () => (renders.push('then'), el('a', 'yes')),
    () => (renders.push('else'), el('b', 'no')),
  );
  insert(frag, parent);
  expect(parent.innerHTML).toBe('<a>yes</a><!---->');
  value.value = 'still truthy';
  await nextTick();
  expect(renders).toEqual(['then']);
  value.value = 0;
  await nextTick();
  expect(parent.innerHTML).toBe('<b>no</b><!---->');
  value.value = null;
  await nextTick();
  expect(renders).toEqual(['then', 'else']);
});

test('createIf without otherwise renders nothing for a falsy condition', async () => {
  const show = ref(false);
  const parent = el('div');
  insert(
    createIf(
      () => show.value,
      () => el('a'),
    ),
    parent,
  );
  expect(parent.innerHTML).toBe('<!---->');
  show.value = true;
  await nextTick();
  expect(parent.innerHTML).toBe('<a></a><!---->');
});

test('a swap stops the old branch effects before removing its nodes', async () => {
  const show = ref(true);
  const text = ref('a');
  const runs: string[] = [];
  const parent = el('div');
  const remove = vi.spyOn(Node.prototype, 'removeChild');
  insert(
    createIf(
      () => show.value,
      () => {
        const node = el('p');
        renderEffect(() => {
          runs.push(text.value);
          node.textContent = text.value;
        });
        return node;
      },
    ),
    parent,
  );
  // The branch effect is queued after the swap, which disposes it.
  show.value = false;
  text.value = 'b';
  await nextTick();
  text.value = 'c';
  await nextTick();
  expect(runs).toEqual(['a']);
  expect(parent.innerHTML).toBe('<!---->');
  expect(remove).toHaveBeenCalledTimes(1);
});

test('nested createIf renders v-else-if chains', async () => {
  const n = ref(0);
  const parent = el('div');
  insert(
    createIf(
      () => n.value === 0,
      () => el('a'),
      () =>
        createIf(
          () => n.value === 1,
          () => el('b'),
          () => el('c'),
        ),
    ),
    parent,
  );
  const tags = () => [...parent.children].map((c) => c.tagName);
  expect(tags()).toEqual(['A']);
  n.value = 1;
  await nextTick();
  expect(tags()).toEqual(['B']);
  n.value = 2;
  await nextTick();
  expect(tags()).toEqual(['C']);
  n.value = 0;
  await nextTick();
  expect(tags()).toEqual(['A']);
  expect(parent.childNodes).toHaveLength(2);
});

test('the branch reads are not tracked by the condition', async () => {
  const show = ref(true);
  const inner = ref(0);
  let renders = 0;
  insert(
    createIf(
      () => show.value,
      () => {
        renders++;
        return el('a', String(inner.value));
      },
    ),
    el('div'),
  );
  inner.value++;
  await nextTick();
  expect(renders).toBe(1);
});

test('createKeyed rebuilds when the key changes', async () => {
  const key = ref<unknown>(1);
  const parent = el('div');
  const frag = createKeyed(
    () => key.value,
    () => el('a', String(key.value)),
  );
  insert(frag, parent);
  const first = parent.firstChild;
  key.value = 1;
  await nextTick();
  expect(parent.firstChild).toBe(first);
  key.value = Number.NaN;
  await nextTick();
  const second = parent.firstChild;
  expect(second).not.toBe(first);
  expect(parent.innerHTML).toBe('<a>NaN</a><!---->');
  key.value = Number.NaN;
  await nextTick();
  expect(parent.firstChild).toBe(second);
});

test('branches are owned by the enclosing scope', async () => {
  const runs: number[] = [];
  const count = ref(0);
  const scope = effectScope();
  scope.run(() =>
    createIf(
      () => true,
      () => {
        renderEffect(() => runs.push(count.value));
        return [];
      },
    ),
  );
  scope.stop();
  count.value++;
  await nextTick();
  expect(runs).toEqual([0]);
});
