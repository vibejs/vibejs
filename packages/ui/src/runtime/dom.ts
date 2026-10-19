// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/src/patchProp.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/src/modules/attrs.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/src/modules/props.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/src/modules/style.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/shared/src/domAttrConfig.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/shared/src/normalizeProp.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/shared/src/toDisplayString.ts (MIT)
//
// The element ABI: templates, node walkers and the setters that render effects call. Setters keep
// their state in WeakMaps, never on the element, and touch no global DOM object at module level.
import { isRef, toRaw } from '../reactivity/dep.ts';
import { hyphenate, isFunction, isObject, toText } from '../shared.ts';
import { on } from './events.ts';

/**
 * Returns a factory of the node that `html` parses to. `html` has exactly one root and parses
 * the same in any parent (codegen splits invalid nesting into its own template); with `ns` it is
 * parsed inside `<svg>` or `<math>`. The HTML is parsed on the first call; each call returns a
 * deep clone. Codegen hoists one `template()` per static shape to module level.
 */
export function template(html: string, ns?: 'svg' | 'math'): () => Node {
  let node: Node | undefined;
  return () => {
    if (!node) {
      const t = document.createElement('template');
      t.innerHTML = ns ? `<${ns}>${html}</${ns}>` : html;
      node = t.content.firstChild!;
      if (ns) node = node.firstChild!;
    }
    return document.importNode(node, true);
  };
}

/** The first child of `n`. Codegen walks a cloned template with `child`, `next` and `nthChild`. */
export function child(n: Node): Node {
  return n.firstChild!;
}

/** The next sibling of `n`. */
export function next(n: Node): Node {
  return n.nextSibling!;
}

/** The child of `n` at index `i`, for a node far from its previous sibling. */
export function nthChild(n: Node, i: number): Node {
  return n.childNodes[i];
}

/**
 * The text node of an interpolation: the first child of `el`. Codegen emits a placeholder space
 * for each interpolation, so `<p>{{ a }}</p>` is `<p> </p>` and `txt(p)` is its text node.
 */
export function txt(el: Node): Text {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- codegen emits a text node here
  return el.firstChild as Text;
}

/** Sets the text of a text node (or of an element, for `v-text`); an equal text is not written. */
export function setText(n: Node, text: string): void {
  if (n.textContent !== text) n.textContent = text;
}

const xlinkNS = 'http://www.w3.org/1999/xlink';
/** Boolean attributes: present for a truthy value or `''`, removed otherwise. */
const booleanAttrs = new Set(
  'itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,playsinline,readonly,async,autofocus,autoplay,controls,default,defer,disabled,inert,loop,open,required,reversed,scoped,seamless,checked,muted,multiple,selected'.split(
    ',',
  ),
);

const includeBooleanAttr = (value: unknown): boolean => !!value || value === '';

/**
 * Sets an attribute. `null` and `undefined` remove it; a boolean attribute is removed for a
 * falsy value other than `''`; `xlink:*` attributes use the xlink namespace. Codegen emits it for
 * a bound key that is not a DOM property of the element (see `setProp`).
 */
export function setAttr(el: Element, key: string, v: unknown): void {
  if (key.startsWith('xlink:')) {
    if (v == null) el.removeAttributeNS(xlinkNS, key.slice(6));
    else el.setAttributeNS(xlinkNS, key, toText(v));
    return;
  }
  const isBoolean = booleanAttrs.has(key);
  if (v == null || (isBoolean && !includeBooleanAttr(v))) el.removeAttribute(key);
  else el.setAttribute(key, isBoolean ? '' : toText(v));
}

/** The last value of each key written by `setProp`; `value` keeps the raw (unstringified) value. */
const written = new WeakMap<Element, Record<string, unknown>>();

/** The value of an input or option: the raw value bound with `setProp`, else the DOM value. */
export function getValue(el: HTMLInputElement | HTMLOptionElement): unknown {
  const props = written.get(el);
  return props && 'value' in props ? props.value : el.value;
}

/**
 * Sets a DOM property; a value equal to the last one written is not written again. `value`
 * keeps the raw value (read back by the models) and writes the string only when the DOM differs.
 * `null`/`undefined` reset a string property to `''` and a number property to `0` and remove the
 * attribute; `''` sets a boolean property to `true`. Codegen emits it for `.prop` bindings and
 * for keys that are DOM properties of the element (`key in el`), except the attribute-only keys
 * that `setDynamicProps` routes to `setAttr`.
 */
export function setProp(el: Element, key: string, v: unknown): void {
  let props = written.get(el);
  if (!props) written.set(el, (props = {}));
  const tag = el.tagName;
  if (key === 'value' && tag !== 'PROGRESS' && !tag.includes('-')) {
    // An <option> falls back to its text, so compare with the attribute.
    const old = tag === 'OPTION' ? (el.getAttribute('value') ?? '') : Reflect.get(el, 'value');
    const text = v == null ? (Reflect.get(el, 'type') === 'checkbox' ? 'on' : '') : toText(v);
    if (old !== text || !('value' in props)) Reflect.set(el, 'value', text);
    if (v == null) el.removeAttribute(key);
    props.value = v;
    return;
  }
  if (key in props && Object.is(props[key], v)) return;
  props[key] = v;
  let value = v;
  let remove = false;
  if (v === '' || v == null) {
    const type = typeof Reflect.get(el, key);
    if (type === 'boolean') {
      // `<select multiple>` binds `multiple: ''`.
      value = includeBooleanAttr(v);
    } else if (v == null && type === 'string') {
      value = '';
      remove = true;
    } else if (type === 'number') {
      value = 0;
      remove = true;
    }
  }
  try {
    Reflect.set(el, key, value);
  } catch (err) {
    // A reset of a validated property (`size = 0`) may throw; the attribute removal below is
    // what counts then. Any other invalid value reaches the error handler.
    if (!remove) throw err;
  }
  if (remove) el.removeAttribute(key);
}

/** Sets `innerHTML` (`v-html`); `null` and `undefined` clear it, an equal value is not written. */
export function setHtml(el: Element, v: unknown): void {
  setProp(el, 'innerHTML', v == null ? '' : v);
}

/** Own and inherited (fallthrough) classes of each element. */
const classes = new WeakMap<Element, [own: string, inherited: string]>();

function normalizeClass(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const names: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) names.push(normalizeClass(item));
  } else if (isObject(value)) {
    for (const name in value) if (value[name]) names.push(name);
  }
  return names.filter(Boolean).join(' ');
}

/**
 * Sets the class from a string, an array or an object of `name: condition`. Codegen merges the
 * static `class` and `:class` of an element into one binding, `[static, dynamic]`. With
 * `fallthrough`, `v` is the class inherited from the parent, kept apart from the own class and
 * appended to it.
 */
export function setClass(el: Element, v: unknown, fallthrough = false): void {
  let slots = classes.get(el);
  if (!slots) classes.set(el, (slots = [el.getAttribute('class') ?? '', '']));
  slots[+fallthrough] = normalizeClass(v);
  const value = slots.filter(Boolean).join(' ');
  if (el.getAttribute('class') !== value) el.setAttribute('class', value);
}

type Style = Record<string, unknown>;

/** Own, inherited and applied styles of each element, with hyphenated keys. */
const styles = new WeakMap<Element, [own: Style, inherited: Style, applied: Style]>();

/** The display that `v-show` restores, and whether it hides the element. */
export const shown: WeakMap<Element, { display: string; hidden: boolean }> = new WeakMap();

const listDelimiterRE = /;(?![^(]*\))/g;
const propertyDelimiterRE = /:([^]+)/;
const styleCommentRE = /"(?:[^"\\]|\\[^])*"|'(?:[^'\\]|\\[^])*'|\\[^]|\/\*[^]*?\*\//g;
const importantRE = /\s*!important$/;

function normalizeStyle(value: unknown, into: Style = {}): Style {
  if (typeof value === 'string') {
    const css = value.replaceAll(styleCommentRE, (m) => (m.startsWith('/*') ? '' : m));
    for (const item of css.split(listDelimiterRE)) {
      const parts = item.split(propertyDelimiterRE);
      if (parts.length > 1) into[parts[0].trim()] = parts[1].trim();
    }
  } else if (Array.isArray(value)) {
    for (const item of value) normalizeStyle(item, into);
  } else if (isObject(value)) {
    for (const key in value) {
      // Vendor prefixes keep their leading dash: `WebkitLineClamp`, `msTransform`.
      const name = key.startsWith('--') ? key : hyphenate(key);
      into[/^(?:[A-Z]|ms[A-Z])/.test(key) ? `-${name}` : name] = value[key];
    }
  }
  return into;
}

function setStyleValue(style: CSSStyleDeclaration, name: string, value: unknown): void {
  if (Array.isArray(value)) {
    // Fallbacks: the last value the browser accepts wins.
    for (const item of value) setStyleValue(style, name, item);
    return;
  }
  const text = value == null ? '' : toText(value);
  const important = importantRE.test(text);
  style.setProperty(name, text.replace(importantRE, ''), important ? 'important' : '');
}

/**
 * Sets the inline style from a CSS string, an array or an object (camelCase, hyphenated and
 * `--custom` keys; `!important` values; an array of fallback values). Only changed declarations
 * are written, and no vendor prefixes are added. Codegen merges the static `style` and `:style`
 * into one binding. With `fallthrough`, `v` is the style inherited from the parent; its keys win
 * over the own style.
 */
export function setStyle(el: Element, v: unknown, fallthrough = false): void {
  let slots = styles.get(el);
  if (!slots) {
    const initial = normalizeStyle(el.getAttribute('style') ?? '');
    styles.set(el, (slots = [initial, {}, initial]));
  }
  slots[+fallthrough] = normalizeStyle(v);
  const merged = { ...slots[0], ...slots[1] };
  const applied = slots[2];
  slots[2] = merged;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- HTML, SVG and MathML elements have a style
  const style = (el as HTMLElement).style;
  for (const key in applied) if (merged[key] == null) style.removeProperty(key);
  for (const key in merged) {
    if (merged[key] !== applied[key]) setStyleValue(style, key, merged[key]);
  }
  if (!style.length) el.removeAttribute('style');
  const show = shown.get(el);
  if (show) {
    // v-show restores the bound display and keeps a hidden element hidden.
    // An unchanged display keeps its value: the live one may be v-show's `none`.
    if (merged.display !== applied.display)
      show.display = merged.display == null ? '' : style.display;
    if (show.hidden) style.display = 'none';
  }
}

const svgNS = 'http://www.w3.org/2000/svg';
const isNativeOn = (key: string): boolean => /^on[a-z]/.test(key);

/** Whether `setDynamicProps` sets `key` as a DOM property rather than an attribute. */
function shouldSetAsProp(el: Element, key: string, value: unknown): boolean {
  if (el.namespaceURI === svgNS) {
    // SVG takes attributes, except for these and native `on*` handlers.
    return (
      key === 'innerHTML' ||
      key === 'textContent' ||
      (key in el && isNativeOn(key) && isFunction(value))
    );
  }
  const tag = el.tagName;
  if (
    // Enumerated attributes whose DOM property is a boolean.
    key === 'spellcheck' ||
    key === 'draggable' ||
    key === 'translate' ||
    key === 'autocorrect' ||
    // A sandbox property set to null or '' enables the strictest sandbox.
    (key === 'sandbox' && tag === 'IFRAME') ||
    // Read-only properties.
    key === 'form' ||
    (key === 'list' && tag === 'INPUT') ||
    (key === 'type' && tag === 'TEXTAREA') ||
    // The size of embedded content is an attribute.
    ((key === 'width' || key === 'height') &&
      (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'SOURCE')) ||
    // A string handler is an attribute.
    (isNativeOn(key) && typeof value === 'string')
  ) {
    return false;
  }
  return key in el;
}

interface Channel {
  /** The merged props applied last. */
  values: Record<string, unknown>;
  /** The `on*` keys that have a listener, which calls the current handler of the key. */
  listening: Set<string>;
}

/** The own and the inherited channel of each element. */
const channels = new WeakMap<Element, [own: Channel, inherited: Channel]>();

function setKey(el: Element, channel: Channel, key: string, v: unknown, fallthrough: boolean) {
  if (key === 'class') setClass(el, v, fallthrough);
  else if (key === 'style') setStyle(el, v, fallthrough);
  else if (/^on[^a-z]/.test(key)) {
    // A model listener of a component is not a DOM event.
    if (key.startsWith('onUpdate:') || channel.listening.has(key)) return;
    channel.listening.add(key);
    on(el, key[2] === ':' ? key.slice(3) : hyphenate(key.slice(2)), (e) => {
      const handler = channel.values[key];
      return isFunction(handler) ? Reflect.apply(handler, el, [e]) : undefined;
    });
  } else if (shouldSetAsProp(el, key, v)) setProp(el, key, v);
  else setAttr(el, key, v);
}

/**
 * Applies `v-bind="obj"` objects (and, with `fallthrough`, the attributes a component inherits).
 * `sources` merge with the last one winning; `class` and `style` go to their setters, `on*` keys
 * to listeners, other keys to `setProp` or `setAttr` by the element's DOM properties. A key that
 * was applied last time but is now absent is removed. The own and the inherited channel are
 * tracked apart. Codegen calls it inside one render effect per element.
 */
export function setDynamicProps(
  el: Element,
  sources: Record<string, unknown>[],
  fallthrough = false,
): void {
  let pair = channels.get(el);
  if (!pair) {
    pair = [
      { values: {}, listening: new Set() },
      { values: {}, listening: new Set() },
    ];
    channels.set(el, pair);
  }
  const channel = pair[+fallthrough];
  const prev = channel.values;
  const values: Record<string, unknown> = Object.assign({}, ...sources);
  channel.values = values;
  for (const key in prev) if (!(key in values)) setKey(el, channel, key, undefined, fallthrough);
  for (const key in values) setKey(el, channel, key, values[key], fallthrough);
}

const label = (value: unknown, index: number | string = ''): unknown =>
  typeof value === 'symbol' ? `Symbol(${value.description ?? index})` : value;

/** The JSON form of a value that `JSON.stringify` cannot show: collections, symbols, elements. */
function toJSONValue(value: unknown): unknown {
  if (value instanceof Map) {
    const entries = [...value].map(([k, v]: [unknown, unknown], i) => [
      `${String(label(k, i))} =>`,
      v,
    ]);
    return { [`Map(${value.size})`]: Object.fromEntries(entries) };
  }
  if (value instanceof Set) return { [`Set(${value.size})`]: [...value].map((v) => label(v)) };
  if (typeof value === 'symbol') return label(value);
  const tag = Object.prototype.toString.call(value);
  if (isObject(value) && !Array.isArray(value) && tag !== '[object Object]') return toText(value);
  return value;
}

/** Pretty JSON of `value` with refs unwrapped; a reference to an ancestor is `"[Circular]"`. */
function stringify(value: unknown): string {
  const ancestors: [source: unknown, json: unknown][] = [];
  return JSON.stringify(
    value,
    function replacer(this: unknown, _key: string, raw: unknown): unknown {
      // `this` holds `raw`: leave the ancestors that are not in its chain.
      while (ancestors.length && ancestors.at(-1)![1] !== this) ancestors.pop();
      let source = raw;
      while (isRef(source)) source = source.value;
      // A proxy and its target are the same object.
      const target = toRaw(source);
      if (ancestors.some(([s]) => s === target)) return '[Circular]';
      // Read through the proxy, so that a render effect tracks what it shows.
      const json = toJSONValue(source);
      if (isObject(json)) ancestors.push([target, json]);
      return json;
    },
    2,
  );
}

/**
 * The text of an interpolation: `''` for `null` and `undefined`, the unwrapped value of a ref,
 * pretty JSON for arrays and for objects without their own `toString` (with `Map`, `Set` and
 * symbol entries labelled and cycles shown as `"[Circular]"`), and `String(v)` otherwise.
 */
export function toDisplayString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  if (isRef(v)) return toDisplayString(v.value);
  if (
    Array.isArray(v) ||
    // oxlint-disable-next-line typescript/unbound-method -- compared, never called
    (isObject(v) && (v.toString === Object.prototype.toString || !isFunction(v.toString)))
  ) {
    return stringify(v);
  }
  return toText(v);
}
