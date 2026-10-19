import {
  capitalize,
  camelize,
  ElementTypes,
  isSimpleHandler,
  NodeTypes,
  type AttributeNode,
  type DirectiveNode,
  type ElementNode,
  type InterpolationNode,
  type SimpleExpressionNode,
  type TemplateChildNode,
} from '@vibejs-org/compiler';
import { Preset, type CodeBuilder } from './builder.ts';
import { aliasNames, expression, type Names } from './expression.ts';

/** The state of one template walk. */
export interface Walk {
  b: CodeBuilder;
  names: Names;
  source: string;
  depth: number;
}

type Locals = ReadonlySet<string>;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const STRUCTURE = new Set(['if', 'else-if', 'else', 'for']);
const range = (node: { loc: { start: { offset: number }; end: { offset: number } } }) =>
  [node.loc.start.offset, node.loc.end.offset] as [number, number];
const key = (name: string) => (IDENTIFIER.test(name) ? name : `'${name}'`);
/** A single-line string literal. */
const quote = (s: string) =>
  `'${s.replace(/[\\'\n\r\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}'`;

const line = (w: Walk, s = '') => w.b.add(`\n${'  '.repeat(w.depth)}${s}`);
const directive = (el: ElementNode, name: string) =>
  el.props.find((p): p is DirectiveNode => p.type === NodeTypes.DIRECTIVE && p.name === name);
/** A non-empty expression. */
const filled = (exp: SimpleExpressionNode | undefined) =>
  exp && exp.content.trim() ? exp : undefined;

/**
 * Typed yet: intrinsic elements and `<template v-if/v-for>` fragments. Not components, slots, slot
 * wrappers, a plain `<template>` or custom elements.
 */
const typed = (el: ElementNode) =>
  el.tagType === ElementTypes.TEMPLATE
    ? !directive(el, 'slot')
    : el.tagType === ElementTypes.ELEMENT && el.tag !== 'template' && !el.tag.includes('-');

/** Emits the template children as statements, with `v-if` chains as `if`/`else` statements. */
export function children(nodes: TemplateChildNode[], w: Walk, locals: Locals): void {
  // Whether the last emitted statement is an `if` that a `v-else(-if)` continues.
  let chain = false;
  for (const node of nodes) {
    // Whitespace and comments keep a chain; other text and interpolations end it.
    if (node.type === NodeTypes.TEXT) chain &&= !node.content.trim();
    if (node.type === NodeTypes.INTERPOLATION) {
      chain = false;
      interpolation(node, w, locals);
    }
    if (node.type !== NodeTypes.ELEMENT) continue;
    const cond = directive(node, 'if') ?? directive(node, 'else-if');
    const otherwise = directive(node, 'else');
    const exp = filled(cond?.exp);
    if (cond || otherwise) {
      line(w, chain && (cond?.name === 'else-if' || otherwise) ? 'else ' : '');
      if (exp) {
        w.b.add('if (');
        expression(w.b, w.names, w.source, range(exp), locals);
        w.b.add(') {');
      } else w.b.add('{');
      chain = exp !== undefined;
      // An untyped branch keeps its condition, so the rest of the chain still narrows.
      if (typed(node)) block(w, () => element(node, w, locals));
      line(w, '}');
    } else {
      chain = false;
      if (typed(node)) element(node, w, locals);
    }
  }
}

/** Runs `body` one level deeper. */
function block(w: Walk, body: () => void): void {
  w.depth++;
  body();
  w.depth--;
}

function interpolation(node: InterpolationNode, w: Walk, locals: Locals): void {
  if (!filled(node.content)) return;
  line(w, '(');
  expression(w.b, w.names, w.source, range(node.content), locals);
  w.b.add(');');
}

/** An intrinsic element and its children, inside its `v-for` loop. */
function element(el: ElementNode, w: Walk, outer: Locals): void {
  const loop = directive(el, 'for');
  if (!loop) return emit(el, w, outer);
  const parsed = loop.forParseResult;
  if (!parsed) return;
  const locals = new Set(outer);
  line(w, 'for (const [');
  const aliases = [parsed.value, parsed.key, parsed.index];
  const last = aliases.findLastIndex(Boolean);
  aliases.slice(0, last + 1).forEach((alias, i) => {
    if (i > 0) w.b.add(', ');
    if (!alias) return;
    expression(w.b, w.names, w.source, range(alias), outer, true);
    for (const name of aliasNames(w.source, range(alias))) locals.add(name);
  });
  w.b.add('] of __vibe.vFor(');
  expression(w.b, w.names, w.source, range(parsed.source), outer);
  w.b.add(')) {');
  block(w, () => emit(el, w, locals));
  line(w, '}');
}

/** `__vibe.el(__vibe.tags.div)({ … });`, then the children; a fragment emits only its children. */
function emit(el: ElementNode, w: Walk, locals: Locals): void {
  if (el.tagType === ElementTypes.TEMPLATE) return children(el.children, w, locals);
  const { b } = w;
  const start = el.loc.start.offset + 1;
  line(w, '__vibe.el(__vibe.tags.');
  b.atom(el.tag, start, start + el.tag.length, Preset.BOUND).add(')({');
  const seen = new Set<string>();
  // `v-show` and values whose key is taken are still checked, as statements after the element.
  const loose: (() => void)[] = [];
  for (const prop of el.props) {
    if (prop.type === NodeTypes.ATTRIBUTE) attribute(prop, w, seen);
    else if (prop.name === 'show' && filled(prop.exp)) {
      const exp = prop.exp!;
      loose.push(() => expression(b, w.names, w.source, range(exp), locals));
    } else if (!STRUCTURE.has(prop.name)) bound(prop, w, seen, locals, loose);
  }
  b.add(' });');
  for (const value of loose) {
    line(w, '(');
    value();
    b.add(');');
  }
  block(w, () => children(el.children, w, locals));
}

/** Starts a property; false when the key is taken (merging is not typed yet). */
function property(w: Walk, seen: Set<string>, name: string, at: [number, number], alias = false) {
  if (seen.has(name)) return false;
  w.b.add(seen.size > 0 ? ', ' : ' ');
  seen.add(name);
  const text = key(name);
  const source = w.source.slice(...at);
  if (alias) w.b.alias(text, ...at, Preset.ALIAS);
  else if (text === source) w.b.verbatim(...at, Preset.BOUND);
  else w.b.atom(text, ...at, Preset.BOUND);
  w.b.add(': ');
  return true;
}

/** `class="c"` -> `class: 'c'`; a valueless attribute is `true`. */
function attribute(attr: AttributeNode, w: Walk, seen: Set<string>): void {
  if (attr.name === 'ref') return;
  const name = range({ loc: attr.nameLoc });
  if (!property(w, seen, attr.name, name)) return;
  if (attr.value) w.b.atom(quote(attr.value.content), ...range(attr.value), Preset.BOUND);
  else w.b.atom('true', ...name, Preset.BOUND);
}

/**
 * `:id="e"` -> `id: e`, `:view-box.camel` -> `viewBox`; `@click="h"` -> `onClick: h`, inline
 * statements in an arrow. A value whose key is taken goes to `loose`.
 */
function bound(
  dir: DirectiveNode,
  w: Walk,
  seen: Set<string>,
  locals: Locals,
  loose: (() => void)[],
): void {
  const { arg } = dir;
  const exp = filled(dir.exp);
  if (!arg?.isStatic || !exp || (dir.name !== 'bind' && dir.name !== 'on')) return;
  if (dir.name === 'bind' && arg.content === 'ref') return;
  const on = dir.name === 'on';
  const camel = on || dir.modifiers.some((m) => m.content === 'camel');
  const name = camel ? camelize(arg.content) : arg.content;
  const value = () => {
    if (!on || isSimpleHandler(exp.content))
      return expression(w.b, w.names, w.source, range(exp), locals);
    w.b.add('($event) => { ');
    expression(w.b, w.names, w.source, range(exp), new Set([...locals, '$event']));
    w.b.add(' }');
  };
  if (property(w, seen, on ? `on${capitalize(name)}` : name, range(arg), on)) value();
  else loose.push(value);
}
