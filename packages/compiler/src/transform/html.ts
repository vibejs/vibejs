import type { Op, Ref, Step } from './ir.ts';

/**
 * A node of an emitted template. `ref` is set on the nodes that render code reaches; `loc` is the
 * file offset of an element or of the first node of a text run.
 */
export type HNode =
  | {
      kind: 'el';
      tag: string;
      attrs: [string, string | true][];
      children: HNode[];
      void: boolean;
      ref?: Ref;
      loc?: number;
    }
  | { kind: 'text'; text: string; ref?: Ref; loc?: number }
  | { kind: 'anchor'; ref?: Ref };

// The escapes of the HTML serializer, so that a template string re-serializes unchanged.
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\u00a0': '&nbsp;',
};
const escape = (s: string, chars: RegExp): string => s.replace(chars, (c) => ESCAPES[c]);
const TEXT = /[&<>\u00a0]/g;
const ATTR = /[&"\u00a0]/g;

/** The HTML of `node`: explicit end tags except on HTML void elements, `<!>` for an anchor. */
export function serialize(node: HNode): string {
  if (node.kind === 'anchor') return '<!>';
  if (node.kind === 'text') return escape(node.text, TEXT);
  const attrs = node.attrs.map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escape(v, ATTR)}"`));
  const open = `<${node.tag}${attrs.join('')}>`;
  return node.void ? open : `${open}${node.children.map(serialize).join('')}</${node.tag}>`;
}

/**
 * The walks that reach every node with a `ref` below `root`, in document order. A node walks
 * `next` from its nearest earlier sibling with a ref, else `child` (`txt` for an only text child)
 * or `nthChild` from its parent, which is itself reached the same way when it has no ref.
 */
export function walks(root: HNode & { ref: Ref }): Op[] {
  const parents = new Map<HNode, HNode & { kind: 'el' }>();
  const ops: Op[] = [];
  const path = (node: HNode): { from: Ref; steps: Step[] } => {
    const parent = parents.get(node)!;
    const siblings = parent.children;
    const i = siblings.indexOf(node);
    for (let j = i - 1; j >= 0; j--) {
      const ref = siblings[j].ref;
      if (ref !== undefined) return { from: ref, steps: Array<Step>(i - j).fill('next') };
    }
    const step: Step = i > 0 ? i : node.kind === 'text' && siblings.length === 1 ? 'txt' : 'child';
    if (parent.ref !== undefined) return { from: parent.ref, steps: [step] };
    const up = path(parent);
    return { from: up.from, steps: [...up.steps, step] };
  };
  const visit = (node: HNode) => {
    if (node.kind !== 'el') return;
    for (const child of node.children) {
      parents.set(child, node);
      if (child.ref !== undefined) {
        const { from, steps } = path(child);
        ops.push({
          op: 'walk',
          id: child.ref,
          from,
          steps,
          loc: 'loc' in child ? child.loc : undefined,
        });
      }
      visit(child);
    }
  };
  visit(root);
  return ops;
}
