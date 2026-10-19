import type { VibeError } from '@vibejs-org/errors';
import { LineIndex, type Diagnostic } from '../diagnostics.ts';
import { vibeError } from '../errors.gen.ts';
import { camelize, capitalize, hyphenate } from '../expr/index.ts';
import { parseExpression, report, type ExprContext } from '../expr/parse.ts';
import {
  parseParams,
  rewriteExpr,
  type ExprIR,
  type ExprPart,
  type LocalScope,
} from '../expr/rewrite.ts';
import { isIdentifier } from '../expr/walk.ts';
import type { InternalAnalysis } from '../script/analyze.ts';
import type { SFCDescriptor } from '../sfc/parse.ts';
import {
  ElementTypes,
  NodeTypes,
  createSimpleExpression,
  type AttributeNode,
  type DirectiveNode,
  type ElementNode,
  type InterpolationNode,
  type SimpleExpressionNode,
  type SourceLocation,
  type TemplateChildNode,
  type TextNode,
} from '../template/ast.ts';
import { isHTMLTag, isMathMLTag, isSVGTag, isVoidTag } from '../template/tags.ts';
import { serialize, walks, type HNode } from './html.ts';
import type {
  ArgIR,
  BlockIR,
  CallIR,
  HandlerIR,
  MakeIR,
  Op,
  PropIR,
  Ref,
  RootIR,
  SlotIR,
  SpreadIR,
} from './ir.ts';
import { isValidHTMLNesting } from './nesting.ts';
import { resolveComponentTag } from './resolve.ts';

interface State {
  d: SFCDescriptor;
  a: InternalAnalysis;
  ctx: ExprContext;
  /** The scope attribute, or null without a scoped style. */
  scoped: string | null;
  templates: RootIR['templates'];
  abi: Set<string>;
  next: Ref;
}

/** `locals`: the v-for and v-slot scopes, outer to inner. */
interface Env {
  locals: LocalScope[];
  inFor: boolean;
}

type Text = TextNode | InterpolationNode;

/** A child of a block or an element: a text run, an element emitted as HTML, or a dynamic block. */
type Item =
  | { k: 'text'; nodes: Text[]; env: Env }
  | { k: 'el'; el: ElementNode; env: Env; pre: boolean }
  | { k: 'block'; id: Ref; make: MakeIR; after: Op[] };

/** Attributes that are set as DOM properties. */
const PROPS = new Set(['value', 'checked', 'selected', 'muted', 'indeterminate']);
const MODIFIERS = new Set(
  'stop prevent self exact ctrl alt shift meta left middle right'.split(' '),
);
const KEY_EVENTS = new Set(['keydown', 'keyup', 'keypress']);
/** Directives a `<template>` takes; `v-show`, `v-html` and `v-text` are reported elsewhere. */
const TEMPLATE_DIRECTIVES = new Set('if else else-if for slot pre show html text'.split(' '));
/** Elements whose direct text the HTML parser moves or drops. */
const NO_TEXT = new Set('table thead tbody tfoot tr colgroup select'.split(' '));
const BUILTINS = {
  Teleport: 'VIBE2901',
  KeepAlive: 'VIBE2902',
  Transition: 'VIBE2903',
  TransitionGroup: 'VIBE2904',
  Suspense: 'VIBE2905',
} as const;
const NS = [undefined, 'svg', 'math'] as const;

const empty = (): ExprIR => ({ kind: 'expression', parts: [], scopes: new Set() });
const handler = (e: ExprIR): HandlerIR => ({ expr: e, mods: [], keys: [], options: {} });
const span = (loc: SourceLocation): [number, number] => [loc.start.offset, loc.end.offset];
const tagSpan = (el: ElementNode): [number, number] => [
  el.loc.start.offset + 1,
  el.loc.start.offset + 1 + el.tag.length,
];
const need = (s: State, h: HNode): Ref => (h.ref ??= s.next++);
const isDirective = (p: AttributeNode | DirectiveNode): p is DirectiveNode =>
  p.type === NodeTypes.DIRECTIVE;
const dir = (el: ElementNode, name: string) =>
  el.props.find((p): p is DirectiveNode => isDirective(p) && p.name === name);
const attr = (el: ElementNode, name: string) =>
  el.props.find((p): p is AttributeNode => !isDirective(p) && p.name === name);
/** The `:name` binding of an element. */
const bindArg = (el: ElementNode, name: string) =>
  el.props.find(
    (p): p is DirectiveNode =>
      isDirective(p) && p.name === 'bind' && p.arg?.isStatic === true && p.arg.content === name,
  );
const isBlank = (n: TemplateChildNode) => n.type === NodeTypes.TEXT && !n.content.trim();
/** User text, mapped to its offset when the source holds it verbatim. */
const part = (exp: SimpleExpressionNode): ExprPart =>
  exp.content === exp.loc.source
    ? { code: exp.content, offset: exp.loc.start.offset }
    : exp.content;
const literal = (value: string | true): ExprIR => join(JSON.stringify(value === true ? '' : value));

/** Concatenates generated text and expressions. */
function join(...pieces: (string | ExprIR)[]): ExprIR {
  const out = empty();
  for (const piece of pieces) {
    if (typeof piece === 'string') out.parts.push(piece);
    else {
      out.parts.push(...piece.parts);
      for (const scope of piece.scopes) out.scopes.add(scope);
    }
  }
  return out;
}

/** `a && b && c` */
const and = (tests: ExprIR[]): ExprIR => join(...tests.flatMap((t, i) => (i ? [' && ', t] : [t])));

/** Reports `error` at the file range [start, end). */
function err(s: State, error: VibeError, [start, end]: [number, number]): void {
  report(s.ctx, error, start, end);
}

/** Rewrites a template expression; a syntax error (already reported) yields an empty one. */
function expr(
  s: State,
  exp: SimpleExpressionNode,
  env: Env,
  mode: 'expression' | 'handler' = 'expression',
): ExprIR {
  const scope = { ...s.a.scope, locals: env.locals };
  return rewriteExpr(exp, mode, scope, s.ctx) ?? empty();
}

/** The value of a static-argument `v-bind`, with the same-name shorthand `:id` for `:id="id"`. */
function bound(s: State, p: DirectiveNode, env: Env): ExprIR {
  if (p.exp) return expr(s, p.exp, env);
  const arg = p.arg!;
  if (/^[A-Za-z_$][\w$]*$/.test(arg.content)) {
    return expr(s, createSimpleExpression(arg.content, false, arg.loc), env);
  }
  err(s, vibeError('VIBE2401', { name: p.rawName! }), span(p.loc));
  return empty();
}

/** A dynamic argument `[k]` as an expression node over `k`. */
function dynamicArg(s: State, arg: SimpleExpressionNode): SimpleExpressionNode {
  const { lines } = s.ctx;
  const start = arg.loc.start.offset + 1;
  const end = start + arg.content.length;
  const loc = { start: lines.position(start), end: lines.position(end), source: arg.content };
  return createSimpleExpression(arg.content, false, loc);
}

/**
 * Transforms the template of `d` into the render IR. It never throws; `ir` is null when any
 * diagnostic was reported, and diagnostics are collected over the whole template.
 */
export function transform(
  d: SFCDescriptor,
  a: InternalAnalysis,
  o: { id: string },
): { ir: RootIR | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const s: State = {
    d,
    a,
    ctx: { file: d.filename, lines: new LineIndex(d.source), diagnostics },
    scoped: d.styles.some((style) => style.scoped) ? `data-vb-${o.id}` : null,
    templates: [],
    abi: new Set(),
    next: 0,
  };
  const env: Env = { locals: [], inFor: false };
  const block = toBlock(s, items(s, d.template?.ast.children ?? [], env, null, false), true);
  diagnostics.sort((x, y) => x.start.offset - y.start.offset);
  if (diagnostics.length > 0) return { ir: null, diagnostics };
  collectAbi(block, s.abi);
  return { ir: { templates: s.templates, block, abi: s.abi }, diagnostics };
}

/** Groups children into items: text runs, `v-if` chains and elements. Comments are dropped. */
function items(
  s: State,
  nodes: TemplateChildNode[],
  env: Env,
  parent: ElementNode | null,
  pre: boolean,
): Item[] {
  const list = nodes.filter((n) => n.type !== NodeTypes.COMMENT);
  const out: Item[] = [];
  let chain: { test: ExprIR | null; block: BlockIR }[] | null = null;
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (node.type !== NodeTypes.ELEMENT) {
      const next = list.at(i + 1);
      const branchNext =
        next?.type === NodeTypes.ELEMENT && (dir(next, 'else-if') ?? dir(next, 'else'));
      if (chain && isBlank(node) && branchNext) continue;
      chain = null;
      const last = out.at(-1);
      if (last?.k === 'text') last.nodes.push(node);
      else out.push({ k: 'text', nodes: [node], env });
      continue;
    }
    if (pre) {
      out.push({ k: 'el', el: node, env, pre });
      continue;
    }
    const vif = dir(node, 'if');
    const velse = dir(node, 'else-if') ?? dir(node, 'else');
    if (velse && !vif && chain) {
      chain.push(branch(s, node, velse, env));
      continue;
    }
    if (velse && !vif) {
      err(s, vibeError('VIBE2102', { directive: `v-${velse.name}` }), span(velse.loc));
    }
    const test = vif ?? velse;
    if (test) {
      chain = [branch(s, node, test, env)];
      out.push(blockItem(s, { k: 'if', branches: chain }));
      continue;
    }
    chain = null;
    out.push(...elementItems(s, node, env, 1));
  }
  if (parent && NO_TEXT.has(parent.tag)) {
    for (const item of out) {
      if (item.k !== 'text' || item.nodes.every(isBlank)) continue;
      const { nodes: run } = item;
      const range: [number, number] = [run[0].loc.start.offset, run.at(-1)!.loc.end.offset];
      err(s, vibeError('VIBE2005', { tag: parent.tag }), range);
    }
  }
  return out;
}

const blockItem = (s: State, make: MakeIR): Item => ({ k: 'block', id: s.next++, make, after: [] });

/** One branch of a `v-if` chain. */
function branch(
  s: State,
  el: ElementNode,
  d: DirectiveNode,
  env: Env,
): { test: ExprIR | null; block: BlockIR } {
  let test: ExprIR | null = null;
  if (d.name === 'else') {
    if (d.exp) err(s, vibeError('VIBE2104'), span(d.loc));
  } else if (d.exp) test = expr(s, d.exp, env);
  else err(s, vibeError('VIBE2101', { directive: `v-${d.name}` }), span(d.loc));
  const vfor = dir(el, 'for');
  if (vfor) err(s, vibeError('VIBE2103'), span(vfor.loc));
  return { test, block: toBlock(s, elementItems(s, el, env, 1)) };
}

/**
 * The items of an element whose `v-if` is handled. `stage` skips what an outer call handled:
 * 1 starts at `v-for`, 2 at `:key`, 3 at the element itself.
 */
function elementItems(s: State, el: ElementNode, env: Env, stage: number): Item[] {
  const vfor = stage <= 1 ? dir(el, 'for') : undefined;
  if (vfor) return [forItem(s, el, vfor, env)];
  const key = stage <= 2 ? bindArg(el, 'key') : undefined;
  if (key) {
    const block = toBlock(s, elementItems(s, el, env, 3));
    return [blockItem(s, { k: 'keyed', key: bound(s, key, env), block })];
  }
  if (el.tagType === ElementTypes.COMPONENT) return [componentItem(s, el, env)];
  if (el.tagType === ElementTypes.SLOT) return [blockItem(s, slotMake(s, el, env))];
  if (el.tagType === ElementTypes.TEMPLATE) {
    const slot = dir(el, 'slot');
    if (slot) err(s, vibeError('VIBE2601'), span(slot.loc));
    checkNonElement(s, el);
    checkTemplate(s, el);
    return items(s, el.children, env, null, false);
  }
  if (el.tag === 'template' && !dir(el, 'pre')) {
    err(s, vibeError('VIBE2004'), tagSpan(el));
    return items(s, el.children, env, null, false);
  }
  return [{ k: 'el', el, env, pre: false }];
}

/** Reports what a `<template>` for `v-if`, `v-for` or `v-slot` would drop. */
function checkTemplate(s: State, el: ElementNode): void {
  const key = bindArg(el, 'key');
  for (const p of el.props) {
    if (p === key || (isDirective(p) && TEMPLATE_DIRECTIVES.has(p.name))) continue;
    if (!isDirective(p)) err(s, vibeError('VIBE2012', { name: p.name }), span(p.loc));
    else if (/^(bind|on|model)$/.test(p.name)) {
      err(s, vibeError('VIBE2012', { name: p.rawName! }), span(p.loc));
    } else unsupported(s, p);
  }
}

/** Reports `v-show`, `v-html` and `v-text` on a component, `<template>` or `<slot>`. */
function checkNonElement(s: State, el: ElementNode): void {
  for (const p of el.props) {
    if (isDirective(p) && (p.name === 'show' || p.name === 'html' || p.name === 'text')) {
      err(s, vibeError('VIBE2706', { directive: `v-${p.name}`, tag: el.tag }), span(p.loc));
    }
  }
}

function forItem(s: State, el: ElementNode, d: DirectiveNode, env: Env): Item {
  const r = d.forParseResult;
  let source = empty();
  let params: (ExprPart | null)[] = [];
  const names = new Set<string>();
  if (!d.exp) err(s, vibeError('VIBE2201'), span(d.loc));
  else if (!r) err(s, vibeError('VIBE2202'), span(d.exp.loc));
  else {
    source = expr(s, r.source, env);
    const aliases = [r.value, r.key, r.index];
    for (const alias of aliases) {
      for (const name of (alias && parseParams(alias, s.ctx)?.names) ?? []) names.add(name);
    }
    params = aliases.map((alias) => (alias ? part(alias) : null));
  }
  const scope: LocalScope = { names };
  const inner: Env = { locals: [...env.locals, scope], inFor: true };
  const key = bindArg(el, 'key');
  if (el.tagType === ElementTypes.TEMPLATE) {
    for (const child of el.children) {
      const own = child.type === NodeTypes.ELEMENT && !dir(child, 'for');
      const childKey = own ? bindArg(child, 'key') : undefined;
      if (childKey) err(s, vibeError('VIBE2204'), span(childKey.loc));
    }
  }
  if (r && !key && !/^\d+$/.test(r.source.content)) err(s, vibeError('VIBE2203'), span(d.loc));
  const block = toBlock(s, elementItems(s, el, inner, 3));
  return blockItem(s, {
    k: 'for',
    source,
    scope,
    params,
    key: key ? bound(s, key, inner) : null,
    block,
  });
}

/** The ops of a block whose roots are `list`. */
function toBlock(s: State, list: Item[], root = false): BlockIR {
  const ops: Op[] = [];
  const returns: Ref[] = [];
  for (const item of list) {
    if (item.k === 'block') {
      if (root && list.length === 1 && item.make.k === 'component') item.make.singleRoot = true;
      ops.push({ op: 'block', id: item.id, parent: null, anchor: null, make: item.make });
      ops.push(...item.after);
      returns.push(item.id);
    } else {
      const t = template(s, item);
      ops.push(...t.ops);
      returns.push(t.id);
    }
  }
  return { ops, returns };
}

/** A hoisted template for a text run or an element, with its walks and bindings. */
function template(s: State, item: Exclude<Item, { k: 'block' }>): { id: Ref; ops: Op[] } {
  const body: Op[] = [];
  const root =
    item.k === 'text'
      ? textNode(s, item.nodes, item.env, body)
      : element(s, item.el, item.env, body, item.pre);
  const id = need(s, root);
  const html = serialize(root);
  const ns = item.k === 'el' ? NS[item.el.ns] : undefined;
  const tpl = s.templates.push(ns ? { html, ns } : { html }) - 1;
  const loc = root.loc;
  return { id, ops: [{ op: 'tpl', id, tpl, loc }, ...walks({ ...root, ref: id }), ...body] };
}

/** One text node; a run with interpolations is `" "` plus one `setText` effect. */
function textNode(s: State, nodes: Text[], env: Env, body: Op[]): HNode & { kind: 'text' } {
  const loc = nodes[0].loc.start.offset;
  if (nodes.every((n) => n.type === NodeTypes.TEXT)) {
    return { kind: 'text', text: nodes.map((n) => n.content).join(''), loc };
  }
  const h: HNode & { kind: 'text' } = { kind: 'text', text: ' ', loc };
  const pieces = nodes.flatMap((n, i) => [
    ...(i ? [' + '] : []),
    n.type === NodeTypes.TEXT
      ? JSON.stringify(n.content)
      : join('_toDisplayString(', expr(s, n.content, env), ')'),
  ]);
  s.abi.add('toDisplayString');
  const call = { fn: 'setText', args: [{ ref: need(s, h) }, { expr: join(...pieces) }] };
  body.push({ op: 'effect', call, loc });
  return h;
}

/** A plain element and its static subtree; `pre` emits it as written (`v-pre`). */
function element(
  s: State,
  el: ElementNode,
  env: Env,
  body: Op[],
  pre: boolean,
): HNode & { kind: 'el' } {
  const inPre = pre || dir(el, 'pre') !== undefined;
  const h: HNode & { kind: 'el' } = {
    kind: 'el',
    tag: el.tag,
    attrs: [],
    children: [],
    void: el.ns === 0 && isVoidTag(el.tag),
    loc: el.loc.start.offset,
  };
  if (inPre) {
    for (const p of el.props) if (!isDirective(p)) h.attrs.push([p.name, p.value?.content ?? true]);
  } else {
    checkTag(s, el);
    elementProps(s, el, h, env, body);
  }
  if (s.scoped) h.attrs.push([s.scoped, true]);
  for (const item of items(s, el.children, env, el, inPre)) {
    if (item.k === 'text') h.children.push(textNode(s, item.nodes, item.env, body));
    else if (item.k === 'el' && isValidHTMLNesting(el.tag, item.el.tag)) {
      h.children.push(element(s, item.el, item.env, body, item.pre));
    } else {
      const anchor: HNode = { kind: 'anchor' };
      h.children.push(anchor);
      if (item.k === 'el') {
        const t = template(s, item);
        body.push(...t.ops);
        body.push({ op: 'insert', id: t.id, parent: need(s, h), anchor: need(s, anchor) });
      } else {
        const { id, make } = item;
        body.push({ op: 'block', id, parent: need(s, h), anchor: need(s, anchor), make });
        body.push(...item.after);
      }
    }
  }
  // The HTML parser drops a leading newline of <pre> and <textarea>.
  const first = h.children.at(0);
  if (/^(pre|textarea)$/.test(el.tag) && first?.kind === 'text' && first.text.startsWith('\n')) {
    first.text = `\n${first.text}`;
  }
  return h;
}

/** Reports a plain element tag that is a script, a misspelled component or no known element. */
function checkTag(s: State, el: ElementNode): void {
  const { tag } = el;
  const name = capitalize(camelize(tag));
  if (tag === 'script' || tag === 'style') err(s, vibeError('VIBE2011', { tag }), tagSpan(el));
  else if (isHTMLTag(tag) || isSVGTag(tag) || isMathMLTag(tag)) return;
  else if (s.a.bindings.has(name)) err(s, vibeError('VIBE2002', { tag, name }), tagSpan(el));
  else if (!tag.includes('-')) err(s, vibeError('VIBE2003', { tag }), tagSpan(el));
}

/** The attributes and directives of a plain element. */
function elementProps(
  s: State,
  el: ElementNode,
  h: HNode & { kind: 'el' },
  env: Env,
  body: Op[],
): void {
  const ref = () => need(s, h);
  const effect = (fn: string, args: ArgIR[], loc: number) =>
    body.push({ op: 'effect', call: { fn, args: [{ ref: ref() }, ...args] }, loc });
  // `v-bind="obj"` and `:[k]` fold every attribute into one setDynamicProps.
  const fold = el.props.some((p) => isDirective(p) && p.name === 'bind' && !p.arg?.isStatic);
  const sources: ([string | ExprIR, ExprIR][] | ExprIR)[] = [];
  const add = (key: string | ExprIR, value: ExprIR) => {
    const last = sources.at(-1);
    if (Array.isArray(last)) last.push([key, value]);
    else sources.push([[key, value]]);
  };
  const model = dir(el, 'model');
  const checkbox = model && el.tag === 'input' && attr(el, 'type')?.value?.content === 'checkbox';
  const isModelValue = (name: string) =>
    checkbox && (name === 'true-value' || name === 'false-value');
  const dynamic: Partial<Record<string, [ExprIR, number]>> = {};
  // A static class or style next to its binding merges into it: `[static, (bound)]`.
  const statics = new Map<string, ExprIR>();
  for (const name of ['class', 'style']) {
    const a = attr(el, name);
    if (a && bindArg(el, name)) statics.set(name, literal(a.value?.content ?? true));
  }
  const merged = (name: string, value: ExprIR) => {
    const fixed = statics.get(name);
    return fixed ? join('[', fixed, ', (', value, ')]') : value;
  };
  for (const p of el.props) {
    if (!isDirective(p)) {
      const value = p.value?.content ?? true;
      if (p.name === 'ref') stringRef(s, p, ref(), env, body);
      else if (p.name === 'is') err(s, vibeError('VIBE2009', { tag: el.tag }), span(p.loc));
      else if (isModelValue(p.name) || statics.has(p.name)) continue;
      else if (fold) add(p.name, literal(value));
      else h.attrs.push([p.name, value]);
      continue;
    }
    const loc = p.loc.start.offset;
    switch (p.name) {
      case 'bind': {
        const { arg } = p;
        if (!arg?.isStatic) {
          if (!p.exp) err(s, vibeError('VIBE2401', { name: p.rawName! }), span(p.loc));
          else if (arg) add(expr(s, dynamicArg(s, arg), env), expr(s, p.exp, env));
          else sources.push(expr(s, p.exp, env));
          break;
        }
        if (arg.content === 'key' || isModelValue(arg.content)) break;
        if (arg.content === 'ref') {
          fnRef(s, p, ref(), env, body);
          break;
        }
        if (arg.content === 'is') {
          err(s, vibeError('VIBE2009', { tag: el.tag }), span(p.loc));
          break;
        }
        const mods = new Set(p.modifiers.map((m) => m.content));
        for (const m of p.modifiers) {
          if (!/^(prop|attr|camel)$/.test(m.content)) {
            err(s, vibeError('VIBE2402', { modifier: m.content }), span(m.loc));
          }
        }
        const name = mods.has('camel') ? camelize(arg.content) : arg.content;
        const value = bound(s, p, env);
        if (fold) add(name, merged(name, value));
        else if (name === 'class' || name === 'style') dynamic[name] = [value, loc];
        else {
          const prop = (mods.has('prop') || PROPS.has(name)) && !mods.has('attr');
          effect(prop ? 'setProp' : 'setAttr', [{ value: name }, { expr: value }], loc);
        }
        break;
      }
      case 'on': {
        const ev = event(s, p, env);
        if (!ev) break;
        const listener = handler(ev.expr);
        for (const m of p.modifiers) {
          const c = m.content;
          if (c === 'once' || c === 'capture' || c === 'passive') listener.options[c] = true;
          else if (KEY_EVENTS.has(ev.name) && (c === 'left' || c === 'right'))
            listener.keys.push(c);
          else if (MODIFIERS.has(c)) listener.mods.push(c);
          else if (KEY_EVENTS.has(ev.name)) listener.keys.push(hyphenate(c));
          else err(s, vibeError('VIBE2304', { modifier: c }), span(m.loc));
        }
        body.push({
          op: 'once',
          call: { fn: 'on', args: [{ ref: ref() }, { value: ev.name }, { handler: listener }] },
        });
        break;
      }
      case 'model':
        nativeModel(s, el, p, env, ref, body);
        break;
      case 'show':
        if (!p.exp) err(s, vibeError('VIBE2705'), span(p.loc));
        else {
          const call = {
            fn: 'applyVShow',
            args: [{ ref: ref() }, { getter: expr(s, p.exp, env) }],
          };
          body.push({ op: 'once', call });
        }
        break;
      case 'html':
      case 'text': {
        const directive = `v-${p.name}`;
        if (!p.exp) err(s, vibeError('VIBE2703', { directive }), span(p.loc));
        else if (el.children.length > 0) {
          err(s, vibeError('VIBE2704', { directive }), span(p.loc));
        } else if (p.name === 'html') effect('setHtml', [{ expr: expr(s, p.exp, env) }], loc);
        else {
          s.abi.add('toDisplayString');
          const text = join('_toDisplayString(', expr(s, p.exp, env), ')');
          effect('setText', [{ expr: text }], loc);
        }
        break;
      }
      case 'slot':
        err(s, vibeError('VIBE2601'), span(p.loc));
        break;
      case 'if':
      case 'else':
      case 'else-if':
      case 'for':
      case 'pre':
        break;
      default:
        unsupported(s, p);
    }
  }
  for (const name of ['class', 'style']) {
    const binding = dynamic[name];
    if (!binding) continue;
    const [value, loc] = binding;
    effect(name === 'class' ? 'setClass' : 'setStyle', [{ expr: merged(name, value) }], loc);
  }
  if (sources.length > 0) {
    const objects = sources.map((source) =>
      Array.isArray(source)
        ? join(
            '{ ',
            ...source.flatMap(([key, value], i) => [
              i ? ', ' : '',
              typeof key === 'string' ? JSON.stringify(key) : join('[', key, ']'),
              ': (',
              value,
              ')',
            ]),
            ' }',
          )
        : join('(', source, ')'),
    );
    const list = join('[', ...objects.flatMap((o, i) => [i ? ', ' : '', o]), ']');
    effect('setDynamicProps', [{ expr: list }], el.loc.start.offset);
  }
}

/** The event name and handler of a `v-on`, or null after a diagnostic. */
function event(s: State, p: DirectiveNode, env: Env): { name: string; expr: ExprIR } | null {
  const { arg } = p;
  const name = p.rawName!;
  if (!arg) {
    err(s, p.exp ? vibeError('VIBE2302') : vibeError('VIBE2301', { name }), span(p.loc));
    return null;
  }
  if (!arg.isStatic) {
    err(s, vibeError('VIBE2303'), span(arg.loc));
    return null;
  }
  if (/^(vue:|vnode-)/.test(arg.content)) {
    err(s, vibeError('VIBE2910', { name }), span(p.loc));
    return null;
  }
  // A listener without a handler only applies its modifiers, as in `@submit.prevent`.
  if (p.exp) return { name: arg.content, expr: expr(s, p.exp, env, 'handler') };
  if (p.modifiers.length > 0) {
    return {
      name: arg.content,
      expr: { kind: 'function', parts: ['() => {}'], scopes: new Set() },
    };
  }
  err(s, vibeError('VIBE2301', { name }), span(p.loc));
  return null;
}

/** The getter and the `$event` setter of a `v-model` target, or null without a target. */
function modelTarget(s: State, p: DirectiveNode, env: Env): { get: ExprIR; set: HandlerIR } | null {
  if (!p.exp) {
    err(s, vibeError('VIBE2501'), span(p.loc));
    return null;
  }
  const get = expr(s, p.exp, env);
  const parsed = parseExpression(p.exp.content);
  const at = span(p.exp.loc);
  if (!('reason' in parsed)) {
    const { node } = parsed;
    if (isIdentifier(node)) {
      const { name } = node;
      const kind = s.a.bindings.get(name)?.kind;
      if (env.locals.some((l) => l.names.has(name))) err(s, vibeError('VIBE2503', { name }), at);
      else if (kind === 'prop' || kind === 'prop-alias') {
        err(s, vibeError('VIBE2504', { name }), at);
      } else if (kind === 'import' || kind === 'const') {
        err(s, vibeError('VIBE2505', { name }), at);
      }
    } else if (node.type !== 'MemberExpression') err(s, vibeError('VIBE2502'), at);
  }
  const set = handler({
    kind: 'statements',
    parts: [...get.parts, ' = $event'],
    scopes: get.scopes,
  });
  return { get, set };
}

/** `v-model` on `<input>`, `<textarea>` and `<select>`. */
function nativeModel(
  s: State,
  el: ElementNode,
  p: DirectiveNode,
  env: Env,
  ref: () => Ref,
  body: Op[],
): void {
  if (p.arg) err(s, vibeError('VIBE2509', { arg: p.arg.content }), span(p.arg.loc));
  const { tag } = el;
  const type = attr(el, 'type')?.value?.content;
  const input = tag === 'input';
  let fn = 'applyTextModel';
  let allowed = ['lazy', 'number', 'trim'];
  if (input && bindArg(el, 'type')) return err(s, vibeError('VIBE2507'), span(p.loc));
  if (input && type === 'file') return err(s, vibeError('VIBE2508'), span(p.loc));
  if (tag === 'select') [fn, allowed] = ['applySelectModel', ['number']];
  else if (input && type === 'checkbox') [fn, allowed] = ['applyCheckboxModel', []];
  else if (input && type === 'radio') [fn, allowed] = ['applyRadioModel', []];
  else if (!input && tag !== 'textarea') return err(s, vibeError('VIBE2506', { tag }), span(p.loc));
  else {
    const value = bindArg(el, 'value');
    if (value) err(s, vibeError('VIBE2511'), span(value.loc));
  }
  const mods: Record<string, true> = {};
  for (const m of p.modifiers) {
    if (allowed.includes(m.content)) mods[m.content] = true;
    else err(s, vibeError('VIBE2510', { modifier: m.content }), span(m.loc));
  }
  const target = modelTarget(s, p, env);
  if (!target) return;
  const args: ArgIR[] = [{ ref: ref() }, { getter: target.get }, { handler: target.set }];
  const values: Record<string, ArgIR> = {};
  for (const k of fn === 'applyCheckboxModel' ? ['true', 'false'] : []) {
    const b = bindArg(el, `${k}-value`);
    const a = attr(el, `${k}-value`);
    if (b) values[k] = { getter: bound(s, b, env) };
    else if (a) values[k] = { getter: literal(a.value?.content ?? true) };
  }
  if (Object.keys(values).length > 0) args.push({ object: values });
  if (Object.keys(mods).length > 0) args.push({ value: mods });
  body.push({ op: 'once', call: { fn, args } });
}

/** `ref="x"`: a string ref, which needs `useTemplateRef('x')`. */
function stringRef(s: State, p: AttributeNode, target: Ref, env: Env, ops: Op[]): void {
  const name = p.value?.content ?? '';
  if (!s.a.templateRefs.some((r) => r.key === name)) {
    err(s, vibeError('VIBE2701', { name }), span(p.loc));
  }
  const call = { fn: 'setRef', args: [{ ref: target }, { value: name }, { value: env.inFor }] };
  ops.push({ op: 'once', call });
}

/** `:ref="fn"`: a function or a member path that holds one. */
function fnRef(s: State, p: DirectiveNode, target: Ref, env: Env, ops: Op[]): void {
  const e = p.exp ? expr(s, p.exp, env, 'handler') : null;
  if (!e || e.kind === 'statements') {
    return err(s, vibeError('VIBE2702'), span(p.exp?.loc ?? p.loc));
  }
  const args = [{ ref: target }, { handler: handler(e) }, { value: env.inFor }];
  ops.push({ op: 'once', call: { fn: 'setRef', args } });
}

/** v-memo, v-once, v-cloak and custom directives. */
function unsupported(s: State, p: DirectiveNode): void {
  const at = span(p.loc);
  if (p.name === 'memo') err(s, vibeError('VIBE2906'), at);
  else if (p.name === 'once') err(s, vibeError('VIBE2907'), at);
  else if (p.name === 'cloak') err(s, vibeError('VIBE2909'), at);
  else err(s, vibeError('VIBE2908', { name: p.name }), at);
}

/** The reference of a component tag, or `''` after a diagnostic. */
function resolveTag(s: State, el: ElementNode): string {
  const { tag } = el;
  if (resolveComponentTag(tag, s.a, s.d.filename) === null) {
    const code = Object.entries(BUILTINS).find(([name]) => name === tag)?.[1];
    if (code) err(s, vibeError(code), tagSpan(el));
    else err(s, vibeError('VIBE2001', { tag }), tagSpan(el));
    return '';
  }
  const root = tag.split('.')[0];
  const kind = s.a.bindings.get(root)?.kind;
  if (kind === undefined) return '_sfc';
  if (kind === 'import') return tag;
  if (kind === 'prop') return `$props.${tag}`;
  if (kind === 'prop-alias') return `$props.${s.a.propAliases.get(root)}${tag.slice(root.length)}`;
  return `$setup.${tag}`;
}

/** A string or template literal. */
function isStringLiteral(content: string): boolean {
  const parsed = parseExpression(content);
  if ('reason' in parsed) return false;
  const { node } = parsed;
  return (
    (node.type === 'Literal' && typeof node.value === 'string') || node.type === 'TemplateLiteral'
  );
}

/** Component or slot props in source order; any `v-bind="obj"` or `:[k]` makes them spread groups. */
function propList(s: State, env: Env) {
  const groups: SpreadIR = [];
  const props: PropIR[] = [];
  let spread = false;
  const add = (prop: PropIR) => {
    props.push(prop);
    const last = groups.at(-1);
    if (Array.isArray(last)) last.push(prop);
    else groups.push([prop]);
  };
  /** A `v-bind` other than the special keys of the caller. */
  const bind = (p: DirectiveNode) => {
    const { arg } = p;
    if (arg?.isStatic) {
      for (const m of p.modifiers) {
        if (m.content !== 'camel')
          err(s, vibeError('VIBE2402', { modifier: m.content }), span(m.loc));
      }
      const key = p.modifiers.length > 0 ? camelize(arg.content) : arg.content;
      return add({ key, value: bound(s, p, env), loc: p.loc.start.offset });
    }
    spread = true;
    if (!p.exp) err(s, vibeError('VIBE2401', { name: p.rawName! }), span(p.loc));
    else if (arg) {
      const key = expr(s, dynamicArg(s, arg), env);
      groups.push(join('{ [', key, ']: (', expr(s, p.exp, env), ') }'));
    } else groups.push(expr(s, p.exp, env));
  };
  const result = () => (spread ? { props: [], spread: groups } : { props, spread: null });
  return { add, bind, result };
}

function componentItem(s: State, el: ElementNode, env: Env): Item {
  const id = s.next++;
  const after: Op[] = [];
  const dynamic = el.tag === 'component';
  let is: string | ExprIR = '';
  if (dynamic) {
    const binding = bindArg(el, 'is');
    const fixed = attr(el, 'is');
    if (fixed) err(s, vibeError('VIBE2006'), span(fixed.loc));
    else if (!binding?.exp) err(s, vibeError('VIBE2006'), tagSpan(el));
    else if (isStringLiteral(binding.exp.content)) {
      err(s, vibeError('VIBE2006'), span(binding.exp.loc));
    } else is = expr(s, binding.exp, env);
  } else is = resolveTag(s, el);
  checkNonElement(s, el);
  const list = propList(s, env);
  const { add } = list;
  for (const p of el.props) {
    const loc = p.loc.start.offset;
    if (!isDirective(p)) {
      if (p.name === 'ref') stringRef(s, p, id, env, after);
      else if (p.name !== 'is') add({ key: p.name, value: p.value?.content ?? true, loc });
      else if (!dynamic) err(s, vibeError('VIBE2009', { tag: el.tag }), span(p.loc));
      continue;
    }
    switch (p.name) {
      case 'bind': {
        const name = p.arg?.isStatic ? p.arg.content : null;
        if (name === 'key' || (dynamic && name === 'is')) break;
        if (name === 'ref') fnRef(s, p, id, env, after);
        else if (name === 'is') err(s, vibeError('VIBE2009', { tag: el.tag }), span(p.loc));
        else list.bind(p);
        break;
      }
      case 'on': {
        const ev = event(s, p, env);
        if (!ev) break;
        for (const m of p.modifiers) {
          err(s, vibeError('VIBE2305', { modifier: m.content }), span(m.loc));
        }
        add({ key: `on${capitalize(camelize(ev.name))}`, value: handler(ev.expr), loc });
        break;
      }
      case 'model': {
        if (p.arg && !p.arg.isStatic) {
          err(s, vibeError('VIBE2509', { arg: p.arg.content }), span(p.arg.loc));
          break;
        }
        const name = p.arg?.content ?? 'modelValue';
        const target = modelTarget(s, p, env);
        if (!target) break;
        add({ key: name, value: target.get, loc });
        add({ key: `onUpdate:${name}`, value: target.set, loc });
        if (p.modifiers.length > 0) {
          const mods = p.modifiers.map((m) => `${JSON.stringify(m.content)}: true`);
          add({ key: `${name}Modifiers`, value: join(`{ ${mods.join(', ')} }`), loc });
        }
        break;
      }
      case 'slot':
      case 'if':
      case 'else':
      case 'else-if':
      case 'for':
      case 'show':
      case 'html':
      case 'text':
        break;
      default:
        unsupported(s, p);
    }
  }
  const make: MakeIR = {
    k: 'component',
    is,
    ...list.result(),
    slots: slotsOf(s, el, env),
    singleRoot: false,
  };
  return { k: 'block', id, make, after };
}

/** `nodes` without blank text at either end. */
function trim(nodes: TemplateChildNode[]): TemplateChildNode[] {
  const list = nodes.filter((n) => n.type !== NodeTypes.COMMENT);
  while (list.length > 0 && isBlank(list[0])) list.shift();
  while (list.length > 0 && isBlank(list.at(-1)!)) list.pop();
  return list;
}

/** The slots passed to a component: `v-slot` on it, `<template #x>` children, or loose content. */
function slotsOf(s: State, el: ElementNode, env: Env): SlotIR[] {
  const onComponent = dir(el, 'slot');
  const isSlot = (n: TemplateChildNode): n is ElementNode =>
    n.type === NodeTypes.ELEMENT && n.tagType === ElementTypes.TEMPLATE && !!dir(n, 'slot');
  const named = el.children.filter(isSlot);
  const loose = trim(el.children.filter((n) => !isSlot(n)));
  const slot = (
    d: DirectiveNode | undefined,
    nodes: TemplateChildNode[],
    test: ExprIR | null,
  ): SlotIR => {
    let name = 'default';
    if (d?.arg && !d.arg.isStatic) err(s, vibeError('VIBE2605'), span(d.arg.loc));
    else if (d?.arg) name = d.arg.content;
    const scope = d?.exp ? parseParams(d.exp, s.ctx) : null;
    const inner = scope ? { ...env, locals: [...env.locals, scope] } : env;
    const block = toBlock(s, items(s, nodes, inner, null, false));
    return { name, scope, params: d?.exp ? part(d.exp) : null, block, test };
  };
  if (onComponent) {
    if (named.length > 0) err(s, vibeError('VIBE2602'), span(onComponent.loc));
    return [slot(onComponent, loose, null)];
  }
  const slots: SlotIR[] = [];
  const seen = new Map<string, boolean>();
  let chain: ExprIR[] | null = null;
  for (const t of named) {
    const d = dir(t, 'slot')!;
    checkNonElement(s, t);
    checkTemplate(s, t);
    const vfor = dir(t, 'for');
    if (vfor) err(s, vibeError('VIBE2606'), span(vfor.loc));
    const vif = dir(t, 'if');
    const velse = dir(t, 'else-if') ?? dir(t, 'else');
    const condition = (c: DirectiveNode) => {
      if (c.exp) return expr(s, c.exp, env);
      err(s, vibeError('VIBE2101', { directive: `v-${c.name}` }), span(c.loc));
      return empty();
    };
    let test: ExprIR | null = null;
    if (vif) {
      test = condition(vif);
      chain = [test];
    } else if (velse) {
      if (!chain) {
        err(s, vibeError('VIBE2102', { directive: `v-${velse.name}` }), span(velse.loc));
      }
      if (velse.name === 'else' && velse.exp) err(s, vibeError('VIBE2104'), span(velse.loc));
      const previous = (chain ?? []).map((c) => join('!(', c, ')'));
      const current = velse.name === 'else' ? null : condition(velse);
      test = and(current ? [...previous, join('(', current, ')')] : previous);
      chain = current ? [...(chain ?? []), current] : null;
    } else chain = null;
    const result = slot(d, t.children, test);
    const conditional = seen.get(result.name);
    if (conditional !== undefined && !(conditional && test)) {
      err(s, vibeError('VIBE2603', { name: result.name }), span(d.loc));
    }
    seen.set(result.name, test !== null);
    slots.push(result);
  }
  if (loose.length > 0) {
    const i = slots.findIndex((sl) => sl.name === 'default');
    if (i >= 0) err(s, vibeError('VIBE2604'), span(dir(named[i], 'slot')!.loc));
    else slots.push(slot(undefined, loose, null));
  }
  return slots;
}

/** A `<slot>` outlet. */
function slotMake(s: State, el: ElementNode, env: Env): MakeIR {
  let name = 'default';
  const list = propList(s, env);
  checkNonElement(s, el);
  for (const p of el.props) {
    const loc = p.loc.start.offset;
    if (!isDirective(p)) {
      if (p.name === 'name') name = p.value?.content ?? '';
      else if (p.name === 'ref') err(s, vibeError('VIBE2608', { name: 'ref' }), span(p.loc));
      else list.add({ key: p.name, value: p.value?.content ?? true, loc });
      continue;
    }
    switch (p.name) {
      case 'bind': {
        const key = p.arg?.isStatic ? p.arg.content : null;
        if (key === 'name') err(s, vibeError('VIBE2607'), span(p.loc));
        else if (key === 'ref') err(s, vibeError('VIBE2608', { name: p.rawName! }), span(p.loc));
        else if (key !== 'key') list.bind(p);
        break;
      }
      case 'if':
      case 'else':
      case 'else-if':
      case 'for':
      case 'show':
      case 'html':
      case 'text':
        break;
      default:
        err(s, vibeError('VIBE2608', { name: p.rawName! }), span(p.loc));
    }
  }
  const children = trim(el.children);
  const fallback = children.length > 0 ? toBlock(s, items(s, children, env, null, false)) : null;
  return { k: 'slot', name, ...list.result(), fallback };
}

/** Adds every C3 helper that `block` uses to `abi`. */
function collectAbi(block: BlockIR, abi: Set<string>): void {
  const arg = (a: ArgIR) => {
    if ('handler' in a) {
      if (a.handler.mods.length > 0) abi.add('withModifiers');
      if (a.handler.keys.length > 0) abi.add('withKeys');
    }
    if ('object' in a) Object.values(a.object).forEach(arg);
  };
  const call = (c: CallIR) => {
    abi.add(c.fn);
    c.args.forEach(arg);
  };
  const blocks = (list: (BlockIR | null)[]) => {
    for (const b of list) if (b) collectAbi(b, abi);
  };
  for (const op of block.ops) {
    switch (op.op) {
      case 'tpl':
        abi.add('template');
        break;
      case 'walk':
        for (const step of op.steps) abi.add(typeof step === 'number' ? 'nthChild' : step);
        break;
      case 'effect':
        abi.add('renderEffect');
        call(op.call);
        break;
      case 'once':
        call(op.call);
        break;
      case 'insert':
        abi.add('insert');
        break;
      case 'block': {
        if (op.parent !== null) abi.add('insert');
        const m = op.make;
        if (m.k === 'if') {
          abi.add('createIf');
          blocks(m.branches.map((b) => b.block));
        } else if (m.k === 'for') {
          abi.add('createFor');
          blocks([m.block]);
        } else if (m.k === 'keyed') {
          abi.add('createKeyed');
          blocks([m.block]);
        } else if (m.k === 'component') {
          abi.add(typeof m.is === 'string' ? 'createComponent' : 'createDynamicComponent');
          blocks(m.slots.map((sl) => sl.block));
        } else {
          abi.add('createSlot');
          blocks([m.fallback]);
        }
      }
    }
  }
}
