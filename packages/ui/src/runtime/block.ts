import { setActiveSub } from '../reactivity/core.ts';
import { activeEffectScope, EffectScopeImpl } from '../reactivity/effectScope.ts';
import type { EffectScope } from '../reactivity/effectScope.ts';
import { renderEffect } from './renderEffect.ts';

/** What a render function returns and `insert()` places: a node, a fragment or a list of blocks. */
export type Block = Node | Fragment | Block[];

/**
 * Dynamic content (`v-if`, `v-for`, `:key`): its current nodes, the comment that marks its end
 * and the effect scope that owns its current content.
 */
export class Fragment {
  nodes: Block = [];
  readonly anchor: Comment = document.createComment('');
  scope?: EffectScope;
}

/**
 * Inserts the nodes of `b` into `parent` before `anchor` (at the end without one); a fragment's
 * nodes go first, then its own anchor. Codegen inserts each dynamic block before the comment
 * that the template holds for it.
 */
export function insert(b: Block, parent: ParentNode, anchor: Node | null = null): void {
  if (b instanceof Node) parent.insertBefore(b, anchor);
  else if (Array.isArray(b)) for (const item of b) insert(item, parent, anchor);
  else {
    insert(b.nodes, parent, anchor);
    parent.insertBefore(b.anchor, anchor);
  }
}

/** Removes the nodes of `b` from the DOM. It is the only place that removes rendered nodes. */
export function removeNodes(b: Block): void {
  if (b instanceof Node) b.parentNode?.removeChild(b);
  else if (Array.isArray(b)) for (const item of b) removeNodes(item);
  else {
    removeNodes(b.nodes);
    removeNodes(b.anchor);
  }
}

/** The first DOM node of `b`, if it has one. */
export function firstNode(b: Block): Node | undefined {
  if (b instanceof Node) return b;
  if (!Array.isArray(b)) return firstNode(b.nodes) ?? b.anchor;
  for (const item of b) {
    const node = firstNode(item);
    if (node) return node;
  }
  return undefined;
}

/**
 * Runs `render` untracked in a new effect scope, a child of `owner` (the scope that was active
 * when the fragment was created), and returns the scope and the block.
 */
export function build(
  owner: EffectScopeImpl | undefined,
  render: () => Block,
): [EffectScopeImpl, Block] {
  const prevSub = setActiveSub(undefined);
  try {
    const scope = owner ? owner.run(() => new EffectScopeImpl())! : new EffectScopeImpl();
    return [scope, scope.run(render)!];
  } finally {
    setActiveSub(prevSub);
  }
}

/** A fragment that rebuilds its content with `pick(value)` whenever `get()` changes. */
function createSwitch(get: () => unknown, pick: (value: unknown) => (() => Block) | undefined) {
  const frag = new Fragment();
  const owner = activeEffectScope;
  let first = true;
  let current: unknown;
  renderEffect(() => {
    const value = get();
    if (!first && Object.is(value, current)) return;
    first = false;
    current = value;
    frag.scope?.stop();
    removeNodes(frag.nodes);
    const render = pick(value);
    [frag.scope, frag.nodes] = render ? build(owner, render) : [undefined, []];
    const parent = frag.anchor.parentNode;
    if (parent) insert(frag.nodes, parent, frag.anchor);
  });
  return frag;
}

/**
 * `v-if`: renders `then` while `cond()` is truthy, else `otherwise`. The branch is rebuilt only
 * when the truthiness changes; the old branch's effects stop before its nodes are removed.
 * Codegen compiles `v-else-if` to a nested `createIf` in `otherwise`.
 */
export function createIf(
  cond: () => unknown,
  then: () => Block,
  otherwise?: () => Block,
): Fragment {
  return createSwitch(
    () => !!cond(),
    (ok) => (ok ? then : otherwise),
  );
}

/**
 * `:key` outside `v-for`: rebuilds `render` whenever `key()` changes (`Object.is`). Codegen
 * compiles `<el :key="k">` to `createKeyed(() => k, () => el)`.
 */
export function createKeyed(key: () => unknown, render: () => Block): Fragment {
  return createSwitch(key, () => render);
}
