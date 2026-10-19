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
import {
  aliasNames,
  assignable,
  expression,
  readsEvent,
  type Mode,
  type Names,
} from './expression.ts';

/** The state of one template walk. */
export interface Walk {
  b: CodeBuilder;
  names: Names;
  source: string;
  depth: number;
  /** The file's own component name when no binding shadows it: that tag types through the file. */
  own: string | undefined;
  /** Whether a tag named the file itself. */
  ownUsed: boolean;
  /** The number of component handles (`__vibe_cN`) emitted so far. */
  handles: number;
  /** The inferred `<slot>` outlets: name -> their `__vibe_sK` numbers; undefined with `defineSlots`. */
  outlets: Map<string, number[]> | undefined;
  /** The number of inferred outlets (`__vibe_sK`) emitted so far. */
  slots: number;
  /** The number of self tags whose slot content is being walked. */
  inSelf: number;
  /**
   * The inferred outlets inside the slot content of a self tag. They forward the file's own slots,
   * so they stay out of `__VibeSlots`: their props would read `__VibeSlots` itself (a type cycle).
   */
  forwarded: Set<number>;
  /** The `ref="key"` targets: key -> type. */
  refs: Map<string, string>;
  /** The number of `v-for` loops around the current element. */
  loops: number;
}

type Locals = ReadonlySet<string>;
type Prop = AttributeNode | DirectiveNode;
/** How an element is checked: an intrinsic, a custom element, a component, `<component :is>` or a `<slot>` outlet. */
type Kind = 'el' | 'custom' | 'component' | 'dynamic' | 'slot';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const STRUCTURE = new Set(['if', 'else-if', 'else', 'for', 'slot']);
/** `Namespaces.SVG` of the template AST. */
const SVG = 1;
const range = (node: { loc: { start: { offset: number }; end: { offset: number } } }) =>
  [node.loc.start.offset, node.loc.end.offset] as [number, number];
/** A single-line string literal. */
const quote = (s: string) =>
  `'${s.replace(/[\\'\n\r\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}'`;
/** An object key: the name, or a string literal. */
export const key = (name: string): string => (IDENTIFIER.test(name) ? name : quote(name));
/** The type arguments of `__vibe.ctx`: the props a template reads, its emits and slots. */
export const CTX_TYPES = '__VibeProps & __VibeModels, __VibeEmits, __VibeSlots';

const line = (w: Walk, s = '') => w.b.add(`\n${'  '.repeat(w.depth)}${s}`);
const directive = (el: ElementNode, name: string) =>
  el.props.find((p): p is DirectiveNode => p.type === NodeTypes.DIRECTIVE && p.name === name);
const findAttr = (el: ElementNode, name: string) =>
  el.props.find((p): p is AttributeNode => p.type === NodeTypes.ATTRIBUTE && p.name === name);
/** A non-empty expression. */
const filled = (exp: SimpleExpressionNode | undefined) =>
  exp && exp.content.trim() ? exp : undefined;
/** The range of a directive's name as written: `v-model`, `:` or `@`. */
const nameRange = (dir: DirectiveNode): [number, number] => {
  const start = dir.loc.start.offset;
  return [start, start + /^(?:v-[\w-]+|.)/.exec(dir.rawName!)![0].length];
};
/** The key that a static attribute or a static `v-bind` sets. */
const staticKey = (p: Prop) =>
  p.type === NodeTypes.ATTRIBUTE
    ? p.name
    : p.name === 'bind' && p.arg?.isStatic && filled(p.exp)
      ? p.arg.content
      : undefined;

/** A `<template v-slot>`: the slot content of the component around it. */
const slotTemplate = (node: TemplateChildNode) =>
  node.type === NodeTypes.ELEMENT &&
  node.tagType === ElementTypes.TEMPLATE &&
  directive(node, 'slot') !== undefined;

/**
 * Emits the template children as statements, with `v-if` chains as `if`/`else` statements. `owner`
 * is the handle of the component whose slot templates these are.
 */
export function children(
  nodes: TemplateChildNode[],
  w: Walk,
  locals: Locals,
  owner?: number,
): void {
  // A plain `<template>`, and a slot template outside a component, with a dynamic name or with
  // `v-for` (compiler errors) are untyped.
  const visit = (node: ElementNode) => {
    const slot = slotTemplate(node) ? directive(node, 'slot')! : undefined;
    if (slot && owner !== undefined && slot.arg?.isStatic !== false && !directive(node, 'for')) {
      slotBlock(w, owner, slot, nameRange(slot), node.children, locals);
    } else if (slot || (node.tagType === ElementTypes.ELEMENT && node.tag === 'template')) {
      untyped(node, w);
    } else element(node, w, locals);
  };
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
      block(w, () => visit(node));
      line(w, '}');
    } else {
      chain = false;
      visit(node);
    }
  }
}

/** Runs `body` one level deeper. */
function block(w: Walk, body: () => void): void {
  w.depth++;
  body();
  w.depth--;
}

/**
 * `{ const [params] = __vibe.slotParams(__vibe_cN.slots.name); … }`: slot content, with the slot
 * props as locals. Without an argument the slot is `default`, mapped to `at`.
 */
function slotBlock(
  w: Walk,
  owner: number,
  dir: DirectiveNode | undefined,
  at: [number, number],
  nodes: TemplateChildNode[],
  outer: Locals,
): void {
  const { b } = w;
  const locals = new Set(outer);
  line(w, '{');
  block(w, () => {
    line(w);
    const params = filled(dir?.exp);
    if (params) {
      b.add('const [');
      expression(b, w.names, w.source, range(params), outer, { pattern: true });
      for (const name of aliasNames(w.source, range(params))) locals.add(name);
      b.add('] = ');
    }
    b.add(`__vibe.slotParams(__vibe_c${owner}.slots`);
    const arg = dir?.arg;
    const name = arg?.content ?? 'default';
    const text = key(name);
    b.add(text === name ? '.' : '[');
    if (arg && text === name) b.verbatim(...range(arg), Preset.BOUND);
    else b.atom(text, ...(arg ? range(arg) : at), arg ? Preset.BOUND : Preset.NONE);
    b.add(text === name ? ');' : ']);');
    children(nodes, w, locals);
  });
  line(w, '}');
}

/** Slot content other than whitespace and comments. */
const content = (node: TemplateChildNode) =>
  node.type !== NodeTypes.COMMENT && (node.type !== NodeTypes.TEXT || node.content.trim());

/** The slot content of a component: its slot templates, then the implicit default children. */
function slots(el: ElementNode, w: Walk, locals: Locals, tag: [number, number]): void {
  const owner = w.handles - 1;
  const own = directive(el, 'slot');
  if (own) return slotBlock(w, owner, own, tag, el.children, locals);
  children(el.children.filter(slotTemplate), w, locals, owner);
  const rest = el.children.filter((node) => !slotTemplate(node));
  if (rest.some(content)) slotBlock(w, owner, undefined, tag, rest, locals);
}

/** The refs of an untyped subtree are `unknown`, so their `useTemplateRef` never fails. */
function untyped(node: TemplateChildNode, w: Walk): void {
  if (node.type !== NodeTypes.ELEMENT) return;
  const name = findAttr(node, 'ref')?.value?.content;
  if (name && !w.refs.has(name)) w.refs.set(name, 'unknown');
  for (const child of node.children) untyped(child, w);
}

function interpolation(node: InterpolationNode, w: Walk, locals: Locals): void {
  if (!filled(node.content)) return;
  line(w, '(');
  expression(w.b, w.names, w.source, range(node.content), locals);
  w.b.add(');');
}

/** An element and its children, inside its `v-for` loop. */
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
    expression(w.b, w.names, w.source, range(alias), outer, { pattern: true });
    for (const name of aliasNames(w.source, range(alias))) locals.add(name);
  });
  w.b.add('] of __vibe.vFor(');
  expression(w.b, w.names, w.source, range(parsed.source), outer);
  w.b.add(')) {');
  w.loops++;
  block(w, () => emit(el, w, locals));
  w.loops--;
  line(w, '}');
}

/** The props of one element while they are emitted. */
interface Props {
  w: Walk;
  kind: Kind;
  locals: Locals;
  /** The keys taken so far. */
  seen: Set<string>;
  /** Statements after the element: values whose key is taken, `v-show`, `v-model` writes. */
  after: (() => void)[];
}

/**
 * `__vibe.el(__vibe.tags.div)({ … });`, `__vibe.customElement({ … });`,
 * `var __vibe_cN = __vibe.component(C)({ … });` or a `<slot>` outlet (`var __vibe_sK = ({ … });`,
 * or `__vibe.slot<__VibeSlots, 'name'>()({ … });` with `defineSlots`), then the children; a
 * fragment emits only its children.
 */
function emit(el: ElementNode, w: Walk, locals: Locals): void {
  const { b } = w;
  if (el.tagType === ElementTypes.TEMPLATE) {
    // A fragment's `:key` is still checked.
    for (const prop of el.props) {
      if (prop.type === NodeTypes.DIRECTIVE && prop.name === 'bind' && filled(prop.exp)) {
        line(w, '(');
        value(prop, w, locals);
        b.add(');');
      }
    }
    return children(el.children, w, locals);
  }
  const start = el.loc.start.offset + 1;
  const tag: [number, number] = [start, start + el.tag.length];
  const kind: Kind =
    el.tag === 'component'
      ? 'dynamic'
      : el.tagType === ElementTypes.COMPONENT
        ? 'component'
        : el.tagType === ElementTypes.SLOT
          ? 'slot'
          : el.tag.includes('-')
            ? 'custom'
            : 'el';
  const is = kind === 'dynamic' ? el.props.find((p) => staticKey(p) === 'is') : undefined;
  // An outlet's `name` is its slot, not one of its props.
  const outletName = kind === 'slot' ? findAttr(el, 'name') : undefined;
  if (kind === 'el') line(w, '__vibe.el(__vibe.tags.').atom(el.tag, ...tag, Preset.BOUND);
  else if (kind === 'custom') line(w, '__vibe.customElement(');
  else if (kind === 'slot') {
    const slot = outletName?.value?.content ?? 'default';
    if (w.outlets) {
      const k = w.slots++;
      if (w.inSelf > 0) w.forwarded.add(k);
      w.outlets.set(slot, [...(w.outlets.get(slot) ?? []), k]);
      line(w, `var __vibe_s${k} = (`);
    } else {
      // An undeclared name fails at the `name` value, or at the tag of an unnamed outlet: the
      // callee stands for it, so the call of the resulting non-function fails there too.
      line(w);
      const callee = `__vibe.slot<__VibeSlots, ${quote(slot)}>()`;
      b.atom(callee, ...(outletName?.value ? range(outletName.value) : tag), Preset.NONE).add('(');
    }
  } else {
    line(w, `var __vibe_c${w.handles++} = __vibe.`);
    if (el.tag === w.own) {
      // The file itself, through its own default export.
      b.add('component(').atom('__vibe_self', ...tag, Preset.BOUND);
      w.ownUsed = true;
    } else if (kind === 'component') {
      b.add('component(').verbatim(...tag, Preset.BOUND);
      const root = el.tag.split('.')[0];
      if (w.names.setup.has(root)) w.names.usedSetup.add(root);
      else if (w.names.ctx.has(root)) w.names.usedCtx.add(root);
    } else {
      b.add('dynamicComponent(');
      if (is?.type === NodeTypes.DIRECTIVE) value(is, w, locals);
      else if (is) staticValue(is, w);
      else b.add('null');
    }
  }
  if (kind === 'el' || kind === 'component' || kind === 'dynamic') b.add(')(');
  // A missing required prop is reported on the object literal, which stands for the tag.
  if (kind === 'component' || (kind === 'slot' && !w.outlets)) b.atom('{', ...tag, Preset.NONE);
  else b.add('{');
  const p: Props = { w, kind, locals, seen: new Set(), after: [] };
  // Static and bound `class` (and `style`) merge into one array: head -> the group, rest -> null.
  const merged = new Map<Prop, Prop[] | null>();
  for (const name of ['class', 'style']) {
    const group = el.props.filter((prop) => staticKey(prop) === name);
    if (group.length > 1) group.forEach((prop, i) => merged.set(prop, i === 0 ? group : null));
  }
  // A checkbox model consumes `true-value` and `false-value`: they are typed with its write.
  const consumed = (prop: Prop) =>
    el.tag === 'input' &&
    findAttr(el, 'type')?.value?.content === 'checkbox' &&
    directive(el, 'model') !== undefined &&
    /^(?:true|false)-value$/.test(staticKey(prop) ?? '');
  for (const prop of el.props) {
    if (prop === is || prop === outletName || consumed(prop)) continue;
    const group = merged.get(prop);
    if (group === null) continue;
    if (group) mergedProperty(p, group);
    else if (prop.type === NodeTypes.ATTRIBUTE) attribute(prop, p, el);
    else if (prop.name === 'show' && filled(prop.exp)) loose(p, () => value(prop, w, locals));
    else if (prop.name === 'model') model(prop, p, el);
    else if (!STRUCTURE.has(prop.name)) bound(prop, p);
  }
  b.add(' });');
  for (const statement of p.after) {
    line(w);
    statement();
  }
  if (kind === 'component' || kind === 'dynamic') {
    const self = el.tag === w.own;
    if (self) w.inSelf++;
    block(w, () => slots(el, w, locals, tag));
    if (self) w.inSelf--;
  } else block(w, () => children(el.children, w, locals));
}

/** A directive's value, verbatim. */
function value(dir: DirectiveNode, w: Walk, locals: Locals, mode?: Mode): void {
  expression(w.b, w.names, w.source, range(dir.exp!), locals, mode);
}

/** A statement `(…);` after the element. */
function loose(p: Props, body: () => void): void {
  p.after.push(() => {
    p.w.b.add('(');
    body();
    p.w.b.add(');');
  });
}

/** Starts an entry; `id` marks it taken. */
function entry(p: Props, id: string): void {
  p.w.b.add(p.seen.size > 0 ? ', ' : ' ');
  p.seen.add(id);
}

/**
 * Starts a property; false when the key is taken. The key maps to `at`: as an ALIAS for a renamed
 * name (`@click` -> `onClick`), else BOUND (or `features`).
 */
function property(
  p: Props,
  name: string,
  at: [number, number],
  alias = false,
  features: number = Preset.BOUND,
): boolean {
  if (p.seen.has(name)) return false;
  entry(p, name);
  const { b, source } = p.w;
  const text = key(name);
  if (alias) b.alias(text, ...at, Preset.ALIAS);
  else if (text === source.slice(...at)) b.verbatim(...at, features);
  else b.atom(text, ...at, features);
  b.add(': ');
  return true;
}

/**
 * A kebab name on a component is its camelCase prop key; `data-*` and `aria-*` stay attributes. An
 * outlet passes its keys as written.
 */
const componentKey = (p: Props, name: string) =>
  p.kind === 'component' && !/^(?:data|aria)-/.test(name) ? camelize(name) : name;

/** `class="c"` -> `class: 'c'`; a valueless attribute is `true`; `ref="r"` adds a template ref. */
function attribute(node: AttributeNode, p: Props, el: ElementNode): void {
  if (node.name === 'ref') return ref(node, p, el);
  const name = componentKey(p, node.name);
  if (property(p, name, range({ loc: node.nameLoc }), name !== node.name)) staticValue(node, p.w);
}

function staticValue(node: AttributeNode, w: Walk): void {
  if (node.value) w.b.atom(quote(node.value.content), ...range(node.value), Preset.BOUND);
  else w.b.atom('true', ...range({ loc: node.nameLoc }), Preset.BOUND);
}

/** Whether an `<option>` in this subtree binds its `:value`. */
const boundOption = (node: TemplateChildNode): boolean =>
  node.type === NodeTypes.ELEMENT &&
  ((node.tag === 'option' &&
    node.props.some((x) => x.type === NodeTypes.DIRECTIVE && staticKey(x) === 'value')) ||
    node.children.some(boundOption));

/** `ref="r"`: the element type or the component's exposed values; an array inside `v-for`. */
function ref(node: AttributeNode, p: Props, el: ElementNode): void {
  const name = node.value?.content;
  if (!name) return;
  const map = el.ns === SVG ? 'SVGElementTagNameMap' : 'HTMLElementTagNameMap';
  // The tag's binding is read from the script, not from the template block: a template that reads
  // the ref then has no type cycle through `__vibe_cN`. A non-component tag gives `unknown` here;
  // its error is at the tag.
  const [root, ...path] = el.tag.split('.');
  const binding = p.locals.has(root)
    ? undefined
    : p.w.names.setup.has(root)
      ? `ReturnType<typeof __vibe.unrefs<{ c: typeof ${root} }>>['c']`
      : p.w.names.ctx.has(root)
        ? `ReturnType<typeof __vibe.ctx<${CTX_TYPES}>>['${root}']`
        : undefined;
  const tag = binding && binding + path.map((m) => `['${m}']`).join('');
  // ponytail: a `v-for` local (or an unresolved name) as the tag still goes through `__vibe_cN`.
  const type =
    p.kind === 'dynamic' || p.kind === 'slot'
      ? 'unknown'
      : p.kind === 'el' || p.kind === 'custom'
        ? `${map} extends Record<'${el.tag}', infer E> ? E : Element`
        : tag
          ? `${tag} extends infer __VibeC extends Parameters<typeof __vibe.component>[0] ? ReturnType<ReturnType<typeof __vibe.component<__VibeC>>>['exposed'] : unknown`
          : `typeof __vibe_c${p.w.handles - 1}.exposed`;
  p.w.refs.set(name, p.w.loops > 0 ? `(${type})[]` : type);
}

/** `class: ['c', e]`: the static and bound values of one key, in order. */
function mergedProperty(p: Props, group: Prop[]): void {
  const [head] = group;
  const at = head.type === NodeTypes.ATTRIBUTE ? range({ loc: head.nameLoc }) : range(head.arg!);
  // The head is the first prop of its key, so the key is free.
  property(p, staticKey(head)!, at);
  p.w.b.add('[');
  group.forEach((prop, i) => {
    if (i > 0) p.w.b.add(', ');
    if (prop.type === NodeTypes.ATTRIBUTE) staticValue(prop, p.w);
    else value(prop, p.w, p.locals);
  });
  p.w.b.add(']');
}

/**
 * `:id="e"` -> `id: e`, `:view-box.camel` -> `viewBox`, `v-bind="o"` -> `...o`, `:[k]="v"` ->
 * `[k]: v`; `@click="h"` -> `onClick: h`; `v-html`/`v-text` -> `innerHTML`/`textContent`. A value
 * whose key is taken, `@[k]="h"` and `v-on="o"` go after the element.
 */
function bound(dir: DirectiveNode, p: Props): void {
  const { w, locals } = p;
  const { arg } = dir;
  if (!filled(dir.exp)) return;
  if ((dir.name === 'html' || dir.name === 'text') && p.kind === 'el') {
    const name = dir.name === 'html' ? 'innerHTML' : 'textContent';
    if (property(p, name, nameRange(dir), true)) value(dir, w, locals);
    else loose(p, () => value(dir, w, locals));
    return;
  }
  if (dir.name !== 'bind' && dir.name !== 'on') return;
  const on = dir.name === 'on';
  // `v-on="o"` is an object; `@[k]="h"` a handler.
  if (on && !arg?.isStatic) {
    return loose(p, () => (arg ? handler(dir, p, true) : value(dir, w, locals)));
  }
  if (!arg) {
    entry(p, `...${dir.loc.start.offset}`);
    w.b.add('...');
    return value(dir, w, locals);
  }
  if (!arg.isStatic) {
    const [start, end] = range(arg);
    entry(p, `[${start}]`);
    w.b.add('[');
    expression(w.b, w.names, w.source, [start + 1, end - 1], locals);
    w.b.add(']: ');
    return value(dir, w, locals);
  }
  // An outlet does not pass its `:key`.
  if (p.kind === 'slot' && arg.content === 'key') return loose(p, () => value(dir, w, locals));
  const camel = on || dir.modifiers.some((m) => m.content === 'camel');
  const name = camel ? camelize(arg.content) : componentKey(p, arg.content);
  const alias = on || (!camel && name !== arg.content);
  if (property(p, on ? `on${capitalize(name)}` : name, range(arg), alias)) handler(dir, p);
  else loose(p, () => handler(dir, p, true));
}

/**
 * A `v-bind` value or a `v-on` handler: a simple handler passes as is, inline statements become an
 * arrow typed by the event payload. Without a key (`isLoose`), the payload is `unknown`.
 */
function handler(dir: DirectiveNode, p: Props, isLoose = false): void {
  const { w, locals } = p;
  const exp = dir.exp!;
  if (dir.name !== 'on' || isSimpleHandler(exp.content)) return value(dir, w, locals);
  const event = readsEvent(w.source, range(exp));
  w.b.add(event ? `($event${isLoose ? ': unknown' : ''}) => { ` : '() => { ');
  value(dir, w, new Set([...locals, '$event']));
  w.b.add(' }');
}

/**
 * Native `v-model`: the value key (`checked` for a checkbox), then a write of what the element
 * yields: a string (a number with `.number` or `type="number"`), the `true-value`/`false-value`
 * of a checkbox, the bound `:value` of a radio, or for a checkbox or a multiple select the target
 * itself, checked against the values it can hold. On a component: `x: m` (a kebab name
 * camelized), `'onUpdate:x'` writing `m`, and `xModifiers`.
 */
function model(dir: DirectiveNode, p: Props, el: ElementNode): void {
  const { w, locals } = p;
  if (!filled(dir.exp) || (dir.arg && !dir.arg.isStatic)) return;
  const at = dir.arg ? range(dir.arg) : nameRange(dir);
  // The write side repeats the value: diagnostics only.
  const target = () => value(dir, w, locals, { target: true, features: Preset.NONE });
  const read = () => value(dir, w, locals);
  // An invalid target (VIBE2502) is only read.
  const writes = assignable(w.source, range(dir.exp!));
  if (p.kind === 'el' || p.kind === 'custom') {
    const type = findAttr(el, 'type')?.value?.content;
    const checkbox = el.tag === 'input' && type === 'checkbox';
    const find = (name: string) => el.props.find((x) => staticKey(x) === name);
    // A checkbox with `true-value`/`false-value` yields those values, not `checked`.
    // ponytail: with them, an array or Set model is not accepted; it is meaningless there.
    const yes = checkbox ? find('true-value') : undefined;
    const no = checkbox ? find('false-value') : undefined;
    if (!yes && !no && property(p, checkbox ? 'checked' : 'value', at, true)) read();
    else loose(p, read);
    const multiple = el.tag === 'select' && findAttr(el, 'multiple');
    const number = type === 'number' || dir.modifiers.some((m) => m.content === 'number');
    // A radio with a bound `:value` yields that value.
    const radio = el.tag === 'input' && type === 'radio' ? find('value') : undefined;
    const radioValue = radio?.type === NodeTypes.DIRECTIVE ? radio : undefined;
    if (!writes) {
      for (const prop of [yes, no])
        if (prop?.type === NodeTypes.DIRECTIVE) loose(p, () => value(prop, w, locals));
      return;
    }
    // ponytail: a select with a bound `<option :value>` is not write-checked; type it from the
    // option values if needed.
    if (el.tag === 'select' && !multiple && el.children.some(boundOption)) return;
    // TS reports a failed `satisfies` at the keyword: it stands for the value.
    const values = `satisfies ${checkbox ? 'boolean | ' : ''}unknown[] | Set<unknown>`;
    /** A yielded value: the attribute, the bound expression, or `fallback`. */
    const yielded = (prop: Prop | undefined, fallback: string) => {
      if (!prop) w.b.add(fallback);
      else if (prop.type === NodeTypes.ATTRIBUTE) staticValue(prop, w);
      else value(prop, w, locals);
    };
    p.after.push(() => {
      target();
      if (yes || no) {
        w.b.add(' = Boolean() ? ');
        yielded(yes, 'true');
        w.b.add(' : ');
        yielded(no, 'false');
        w.b.add(';');
      } else if (radioValue) {
        w.b.add(' = ');
        value(radioValue, w, locals, { features: Preset.NONE });
        w.b.add(';');
      } else if (!checkbox && !multiple) {
        w.b.add(number ? ' = Number();' : ' = String();');
      } else {
        w.b.add(' = ');
        value(dir, w, locals, { features: Preset.NONE });
        w.b
          .add(' ')
          .atom(values, ...range(dir.exp!), Preset.NONE)
          .add(';');
      }
    });
    return;
  }
  const name = dir.arg ? componentKey(p, dir.arg.content) : 'modelValue';
  if (property(p, name, at, name !== dir.arg?.content)) read();
  // ponytail: `<component :is>` declares no models, so its write side is not checked.
  if (p.kind === 'dynamic') return;
  // The initializer stands in for a missing contextual type (an unknown model): no implicit any.
  const update = () => {
    w.b.add('($event = undefined as never) => { ');
    target();
    w.b.add(' = $event }');
  };
  // A taken key (an explicit `@update:x` first) still checks the write, as a statement.
  if (writes) {
    if (property(p, `onUpdate:${name}`, at, false, Preset.NONE)) update();
    else loose(p, update);
  }
  const modifiers = name === 'modelValue' ? 'modelModifiers' : `${name}Modifiers`;
  if (dir.modifiers.length === 0 || !property(p, modifiers, at, false, Preset.NONE)) return;
  w.b.add('{ ');
  dir.modifiers.forEach((m, i) => {
    if (i > 0) w.b.add(', ');
    w.b.atom(key(m.content), ...range(m), Preset.NONE).add(': true');
  });
  w.b.add(' }');
}
