import { describe, expect, it } from 'vitest';
import { ir } from '../../test/transform.ts';
import type { BlockIR, Op, RootIR } from './ir.ts';

/** A node of the HTML child-list model. */
interface MNode {
  tag: string | null;
  attrs: string;
  text: string | null;
  children: MNode[];
  parent: MNode | null;
}

const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/;

/** Parses an emitted template string into its root nodes. */
function model(html: string): MNode[] {
  const top: MNode = { tag: '#root', attrs: '', text: null, children: [], parent: null };
  let current = top;
  for (const [token] of html.matchAll(/<!>|<\/[^>]+>|<[^>]+>|[^<]+/g)) {
    if (token.startsWith('</')) current = current.parent!;
    else if (token === '<!>') {
      current.children.push({
        tag: '#comment',
        attrs: '',
        text: null,
        children: [],
        parent: current,
      });
    } else if (token.startsWith('<')) {
      const [, tag, attrs] = /^<([^\s>]+)(.*)>$/.exec(token)!;
      const node: MNode = { tag, attrs, text: null, children: [], parent: current };
      current.children.push(node);
      if (!VOID.test(tag)) current = node;
    } else
      current.children.push({ tag: null, attrs: '', text: token, children: [], parent: current });
  }
  for (const root of top.children) root.parent = null;
  return top.children;
}

/** Runs the walks of every block and checks what each op receives. */
function check(root: RootIR): string[] {
  const problems: string[] = [];
  const nodes = new Map<number, MNode>();
  const used = new Set<number>();
  const sibling = (n: MNode) => n.parent!.children[n.parent!.children.indexOf(n) + 1];
  const visit = (block: BlockIR) => {
    for (const op of block.ops) visitOp(op);
  };
  const visitOp = (op: Op) => {
    if (op.op === 'tpl') {
      const roots = model(root.templates[op.tpl].html);
      if (roots.length !== 1) problems.push(`t${op.tpl} has ${roots.length} roots`);
      nodes.set(op.id, roots[0]);
    } else if (op.op === 'walk') {
      used.add(op.from);
      let n = nodes.get(op.from)!;
      for (const step of op.steps) {
        if (typeof step === 'number') n = n.children[step];
        else if (step === 'next') n = sibling(n);
        else {
          if (step === 'txt' && n.children.length !== 1) problems.push(`txt of ${n.tag}`);
          n = n.children[0];
        }
      }
      nodes.set(op.id, n);
    } else if (op.op === 'effect' || op.op === 'once') {
      const [target, key] = op.call.args;
      if (!('ref' in target)) throw new Error('the target of a call is a node');
      const n = nodes.get(target.ref)!;
      used.add(target.ref);
      if (op.call.fn === 'setText' && n.text !== ' ' && n.tag === null)
        problems.push(`setText on ${n.text}`);
      if (op.call.fn === 'setAttr') {
        const name = 'value' in key ? String(key.value) : '';
        if (!n.attrs.includes(`x="${name}"`))
          problems.push(`setAttr ${name} on <${n.tag}${n.attrs}>`);
      }
    } else {
      if (op.parent !== null) {
        used.add(op.parent).add(op.anchor!);
        const anchor = nodes.get(op.anchor!)!;
        if (anchor.tag !== '#comment') problems.push(`anchor n${op.anchor} is not <!>`);
        if (anchor.parent !== nodes.get(op.parent))
          problems.push(`n${op.anchor} not in n${op.parent}`);
      }
      if (op.op === 'block' && op.make.k === 'if') op.make.branches.forEach((b) => visit(b.block));
      if (op.op === 'block' && op.make.k === 'for') visit(op.make.block);
    }
  };
  visit(root.block);
  for (const [id, n] of nodes) {
    const isRoot = n.parent === null;
    if (!isRoot && !used.has(id)) problems.push(`n${id} is never used`);
  }
  return problems;
}

/** The ops of a block and of its `if` branches. */
const allOps = (b: BlockIR): Op[] =>
  b.ops.flatMap((op) =>
    op.op === 'block' && op.make.k === 'if'
      ? [op, ...op.make.branches.flatMap((x) => allOps(x.block))]
      : [op],
  );

describe('node paths', () => {
  it.each([
    ['nested elements', '<div><p><a x="a" :a="text"></a></p><b x="b" :b="text"></b></div>', 2],
    ['mixed text runs', '<p>a {{ text }}<b x="b" :b="text"></b>c {{ count }} d</p>', 3],
    ['sole-child interpolation', '<div><p>{{ text }}</p></div>', 1],
    ['anchors after static siblings', '<div><p></p>text<p v-if="text"></p><Item /></div>', 2],
    [
      'nthChild jumps',
      '<ul><li></li><li></li><li x="c" :c="text"></li><li></li><li x="d" :d="text"></li></ul>',
      2,
    ],
    [
      'deep chains',
      '<div><p><span><i>{{ text }}</i></span></p><p><b x="e" :e="text"></b></p></div>',
      2,
    ],
    ['split subtrees', '<table><tr><td x="f" :f="text">{{ text }}</td></tr></table>', 3],
  ])('%s', (_, template, walks) => {
    const root = ir(template);
    expect(check(root)).toStrictEqual([]);
    expect(allOps(root.block).filter((op) => op.op === 'walk')).toHaveLength(walks);
  });
});

describe('nesting split', () => {
  it.each([
    ['<table><tr></tr></table>', ['<tr></tr>', '<table><!></table>']],
    ['<p><div></div></p>', ['<div></div>', '<p><!></p>']],
    ['<a><a></a></a>', ['<a></a>', '<a><!></a>']],
    // The HTML parser keeps a <div> in a <ul>, so it is not split.
    ['<ul><div></div></ul>', ['<ul><div></div></ul>']],
  ])('%s', (template, html) => {
    const root = ir(template);
    expect(root.templates.map((t) => t.html)).toStrictEqual(html);
    expect(check(root)).toStrictEqual([]);
    const inserts = root.block.ops.filter((op) => op.op === 'insert');
    expect(inserts).toHaveLength(html.length - 1);
  });
});

describe('templates', () => {
  it('gives each root its own template and SVG or MathML roots their namespace', () => {
    const root = ir('<svg><g v-if="text"></g></svg><math></math><p></p>text');
    expect(root.templates).toStrictEqual([
      { html: '<g></g>', ns: 'svg' },
      { html: '<svg><!></svg>', ns: 'svg' },
      { html: '<math></math>', ns: 'math' },
      { html: '<p></p>' },
      { html: 'text' },
    ]);
    expect(root.block.returns).toHaveLength(4);
    expect(check(root)).toStrictEqual([]);
  });
});
