// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/__tests__/patchClass.spec.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/__tests__/patchStyle.spec.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/__tests__/patchAttrs.spec.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/__tests__/patchProps.spec.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/runtime-dom/__tests__/patchEvents.spec.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/shared/__tests__/toDisplayString.spec.ts (MIT)
//
// The patch specs call the setter that codegen emits for each binding instead of patchProp:
// setClass, setStyle, setAttr, setProp, and setDynamicProps for `v-bind="obj"` keys. Differences:
// - Cases built on vnodes, components, Transition classes and custom elements are dropped.
// - setStyle writes only changed declarations: an unchanged one is not reapplied, it adds no
//   vendor prefixes, and it does not warn about trailing semicolons (no warning code exists).
// - setProp throws (to the render effect's error handler) instead of warning when the DOM
//   rejects a value, and does not mirror `value`/`checked`/`selected` to attributes.
// - setAttr stringifies values itself; `.prop`/`^attr` key prefixes are chosen at compile time.
// - setDynamicProps does not parse `Once`/`Passive`/`Capture` key suffixes (codegen passes them
//   as `on` options) and takes one handler per key, not an array.
// - toDisplayString prints a reference to an ancestor as "[Circular]" instead of throwing.
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { computed } from '../reactivity/computed.ts';
import { reactive } from '../reactivity/reactive.ts';
import { ref } from '../reactivity/ref.ts';
import { renderEffect } from './renderEffect.ts';
import { nextTick } from './scheduler.ts';
import {
  child,
  getValue,
  next,
  nthChild,
  setAttr,
  setClass,
  setDynamicProps,
  setHtml,
  setProp,
  setStyle,
  setText,
  template,
  toDisplayString,
  txt,
} from './dom.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const svgNS = 'http://www.w3.org/2000/svg';
const xlinkNS = 'http://www.w3.org/1999/xlink';
function asElement(node: Node): Element {
  if (node instanceof Element) return node;
  throw new TypeError('expected an element');
}
const css = (el: HTMLElement) => el.style.cssText.replaceAll(/\s/g, '');

describe('template and walkers', () => {
  test('parses on the first call and clones once per call', () => {
    const create = vi.spyOn(document, 'createElement');
    const t = template('<div><p>a<b>x</b></p><!----><i></i></div>');
    expect(create).not.toHaveBeenCalled();
    const importNode = vi.spyOn(document, 'importNode');
    const a = t();
    const b = t();
    expect(create).toHaveBeenCalledTimes(1);
    expect(importNode).toHaveBeenCalledTimes(2);
    expect(a).not.toBe(b);
    expect(a.ownerDocument).toBe(document);
    expect(asElement(a).outerHTML).toBe('<div><p>a<b>x</b></p><!----><i></i></div>');
  });

  test('walks to the nodes of the source', () => {
    const root = template('<div><p>a<b>x</b></p><!----><i> </i></div>')();
    const p = child(root);
    expect(p.nodeName).toBe('P');
    expect(txt(p).data).toBe('a');
    expect(next(p).nodeType).toBe(Node.COMMENT_NODE);
    expect(nthChild(root, 2).nodeName).toBe('I');
    expect(txt(nthChild(p, 1)).data).toBe('x');
  });

  test('parses a foreign root in its namespace', () => {
    const svg = asElement(template('<circle r="1"></circle>', 'svg')());
    expect(svg.namespaceURI).toBe(svgNS);
    expect(svg.localName).toBe('circle');
    const math = asElement(template('<mi>x</mi>', 'math')());
    expect(math.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
    const html = asElement(template('<circle></circle>')());
    expect(html.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
  });

  test('setText writes only a changed text', () => {
    const text = document.createTextNode('a');
    const write = vi.spyOn(Node.prototype, 'textContent', 'set');
    setText(text, 'a');
    setText(text, 'b');
    expect(text.data).toBe('b');
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('runtime-dom: class patching', () => {
  test('basics', () => {
    const el = document.createElement('div');
    setClass(el, 'foo');
    expect(el.className).toBe('foo');
    setClass(el, null);
    expect(el.className).toBe('');
  });

  test('svg', () => {
    const el = document.createElementNS(svgNS, 'svg');
    setClass(el, 'foo');
    expect(el.getAttribute('class')).toBe('foo');
  });

  test('normalizes strings, arrays and objects', () => {
    const el = document.createElement('div');
    setClass(el, [' a ', ['b', { c: true, d: false }], null, '', { e: 1 }]);
    expect(el.className).toBe('a b c e');
  });

  test('merges the inherited class after the own class', () => {
    const el = document.createElement('div');
    el.className = 'static';
    setClass(el, 'inherited', true);
    expect(el.className).toBe('static inherited');
    setClass(el, ['static', { own: true }]);
    expect(el.className).toBe('static own inherited');
    setClass(el, null, true);
    expect(el.className).toBe('static own');
    const write = vi.spyOn(el, 'setAttribute');
    setClass(el, ['static', 'own']);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('runtime-dom: style patching', () => {
  it('string', () => {
    const el = document.createElement('div');
    setStyle(el, 'color:red');
    expect(css(el)).toBe('color:red;');
  });

  it('should not patch same string style', () => {
    const el = document.createElement('div');
    setStyle(el, 'color:red;');
    const set = vi.spyOn(el.style, 'setProperty');
    setStyle(el, 'color:red;');
    expect(css(el)).toBe('color:red;');
    expect(set).not.toHaveBeenCalled();
  });

  it('plain object', () => {
    const el = document.createElement('div');
    setStyle(el, { color: 'red' });
    expect(css(el)).toBe('color:red;');
  });

  it('camelCase', () => {
    const el = document.createElement('div');
    setStyle(el, { marginRight: '10px' });
    expect(css(el)).toBe('margin-right:10px;');
  });

  it('remove if falsy value', () => {
    const el = document.createElement('div');
    setStyle(el, { color: undefined, borderRadius: null });
    expect(css(el)).toBe('');
    setStyle(el, { color: 'red' });
    setStyle(el, { color: null, borderRadius: undefined });
    expect(css(el)).toBe('');
  });

  it('!important', () => {
    const el = document.createElement('div');
    setStyle(el, { color: 'red !important' });
    expect(css(el)).toBe('color:red!important;');
  });

  it('camelCase with !important', () => {
    const el = document.createElement('div');
    setStyle(el, { marginRight: '10px !important' });
    expect(css(el)).toBe('margin-right:10px!important;');
  });

  it('object with multiple entries', () => {
    const el = document.createElement('div');
    setStyle(el, { color: 'red', marginRight: '10px' });
    expect(el.style.getPropertyValue('color')).toBe('red');
    expect(el.style.getPropertyValue('margin-right')).toBe('10px');
  });

  it('patch with falsy style value', () => {
    const el = document.createElement('div');
    setStyle(el, { width: '100px' });
    setStyle(el, { width: 0 });
    expect(el.style.width).toBe('0px');
  });

  it('should remove style attribute on falsy value', () => {
    const el = document.createElement('div');
    el.style.cssText = 'color: red;';
    setStyle(el, null);
    expect(el.hasAttribute('style')).toBe(false);
    expect(el.style.cssText).toBe('');
  });

  it('should not warn for escaped trailing semicolons', () => {
    const el = document.createElement('div');
    setStyle(el, { '--custom': '100\\;' });
    expect(el.style.getPropertyValue('--custom')).toBe('100\\;');
  });

  it('shorthand properties', () => {
    const el = document.createElement('div');
    setStyle(el, { borderBottom: '1px solid red' });
    setStyle(el, { border: '1px solid green' });
    expect(el.style.border).toBe('1px solid green');
    expect(el.style.borderBottom).toBe('1px solid green');
  });

  it('CSS custom properties', () => {
    const el = document.createElement('div');
    setStyle(el, { '--theme': 'red' });
    expect(el.style.getPropertyValue('--theme')).toBe('red');
  });

  it('CSS custom properties with !important', () => {
    const el = document.createElement('div');
    const setProperty = vi.spyOn(el.style, 'setProperty');
    setStyle(el, { '--theme': 'red !important' });
    expect(setProperty).toHaveBeenCalledWith('--theme', 'red', 'important');
  });

  it('multiple values', () => {
    const el = document.createElement('div');
    setStyle(el, { display: ['-webkit-box', '-ms-flexbox', 'flex'] });
    expect(el.style.display).toBe('flex');
  });

  it('should clear previous css string value', () => {
    const el = document.createElement('div');
    setStyle(el, 'color:red');
    expect(css(el)).toBe('color:red;');
    setStyle(el, { fontSize: '12px' });
    expect(css(el)).toBe('font-size:12px;');
  });

  it('parses strings with comments, functions and arrays of sources', () => {
    const el = document.createElement('div');
    setStyle(el, [
      'color: red; /* note */ background: url("a;b.png")',
      ['margin: 1px', { marginTop: '2px' }],
      42,
    ]);
    expect(el.style.color).toBe('red');
    expect(el.style.backgroundImage).toBe('url("a;b.png")');
    expect(el.style.margin).toBe('2px 1px 1px');
  });

  it('merges the inherited style over the own style', () => {
    const el = document.createElement('div');
    el.setAttribute('style', 'color: red; width: 1px');
    setStyle(el, { color: 'blue' }, true);
    expect(css(el)).toBe('color:blue;width:1px;');
    setStyle(el, { color: 'green', height: '2px' });
    expect(css(el)).toBe('color:blue;height:2px;');
    setStyle(el, null, true);
    expect(css(el)).toBe('color:green;height:2px;');
  });
});

describe('runtime-dom: attrs patching', () => {
  test('xlink attributes', () => {
    const el = document.createElementNS(svgNS, 'use');
    setAttr(el, 'xlink:href', 'a');
    expect(el.getAttributeNS(xlinkNS, 'href')).toBe('a');
    setAttr(el, 'xlink:href', null);
    expect(el.getAttributeNS(xlinkNS, 'href')).toBe(null);
  });

  test('textContent attributes /w svg', () => {
    const el = document.createElementNS(svgNS, 'use');
    setDynamicProps(el, [{ textContent: 'foo' }]);
    expect(el.attributes.length).toBe(0);
    expect(el.innerHTML).toBe('foo');
  });

  test('boolean attributes', () => {
    const el = document.createElement('input');
    setAttr(el, 'readonly', true);
    expect(el.getAttribute('readonly')).toBe('');
    setAttr(el, 'readonly', false);
    expect(el.getAttribute('readonly')).toBe(null);
    setAttr(el, 'readonly', '');
    expect(el.getAttribute('readonly')).toBe('');
    setAttr(el, 'readonly', 0);
    expect(el.getAttribute('readonly')).toBe(null);
    setAttr(el, 'readonly', '0');
    expect(el.getAttribute('readonly')).toBe('');
    setAttr(el, 'readonly', false);
    expect(el.getAttribute('readonly')).toBe(null);
    setAttr(el, 'readonly', 1);
    expect(el.getAttribute('readonly')).toBe('');
    setAttr(el, 'readonly', undefined);
    expect(el.getAttribute('readonly')).toBe(null);
  });

  test('playsinline boolean attribute', () => {
    const el = document.createElement('video');
    setAttr(el, 'playsinline', true);
    expect(el.getAttribute('playsinline')).toBe('');
    setAttr(el, 'playsinline', false);
    expect(el.getAttribute('playsinline')).toBe(null);
    setAttr(el, 'playsinline', '');
    expect(el.getAttribute('playsinline')).toBe('');
  });

  test('attributes', () => {
    const el = document.createElement('div');
    setAttr(el, 'foo', 'a');
    expect(el.getAttribute('foo')).toBe('a');
    setAttr(el, 'foo', null);
    expect(el.getAttribute('foo')).toBe(null);
  });

  test('onxxx but non-listener attributes', () => {
    const el = document.createElement('div');
    setDynamicProps(el, [{ onwards: 'a' }]);
    expect(el.getAttribute('onwards')).toBe('a');
    setDynamicProps(el, [{ onwards: null }]);
    expect(el.getAttribute('onwards')).toBe(null);
  });

  test('should allow setting attribute to symbol', () => {
    const el = document.createElement('div');
    const symbol = Symbol('foo');
    setAttr(el, 'foo', symbol);
    expect(el.getAttribute('foo')).toBe(symbol.toString());
  });

  test('should allow setting value to symbol', () => {
    const el = document.createElement('input');
    const symbol = Symbol('foo');
    setProp(el, 'value', symbol);
    expect(el.value).toBe(symbol.toString());
  });

  test('should allow setting value to object, leaving stringification to the element', () => {
    const el = document.createElement('div');
    const obj = { toString: () => 'foo' };
    setAttr(el, 'data-test', obj);
    expect(el.dataset.test).toBe('foo');
  });

  test('sandbox should be handled as attribute even if property exists', () => {
    const iframe = document.createElement('iframe');
    let propSetCount = 0;
    Object.defineProperty(iframe, 'sandbox', {
      configurable: true,
      set() {
        propSetCount++;
      },
    });
    setDynamicProps(iframe, [{ sandbox: 'allow-scripts' }]);
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    setDynamicProps(iframe, [{ sandbox: null }]);
    expect(iframe.hasAttribute('sandbox')).toBe(false);
    setDynamicProps(iframe, [{ sandbox: '' }]);
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(propSetCount).toBe(0);
  });
});

describe('runtime-dom: props patching', () => {
  test('basic', () => {
    const el = document.createElement('div');
    setProp(el, 'id', 'foo');
    expect(el.id).toBe('foo');
    // prop with string value should be set to empty string on null values
    setProp(el, 'id', null);
    expect(el.id).toBe('');
    expect(el.getAttribute('id')).toBe(null);
  });

  test('value', () => {
    const el = document.createElement('input');
    setProp(el, 'value', 'foo');
    expect(el.value).toBe('foo');
    setProp(el, 'value', null);
    expect(el.value).toBe('');
    expect(el.getAttribute('value')).toBe(null);
    const obj = {};
    setProp(el, 'value', obj);
    expect(el.value).toBe('[object Object]');
    expect(getValue(el)).toBe(obj);

    const option = document.createElement('option');
    setProp(option, 'textContent', 'foo');
    expect(option.value).toBe('foo');
    expect(option.getAttribute('value')).toBe(null);
    setProp(option, 'value', 'foo');
    expect(option.value).toBe('foo');
    expect(option.getAttribute('value')).toBe('foo');
  });

  test('value of a checkbox resets to "on"', () => {
    const el = document.createElement('input');
    el.type = 'checkbox';
    setProp(el, 'value', 'x');
    setProp(el, 'value', undefined);
    expect(el.value).toBe('on');
    expect(getValue(el)).toBeUndefined();
  });

  test('value writes the DOM only when it differs', () => {
    const el = document.createElement('input');
    setProp(el, 'value', 1);
    const write = vi.spyOn(el, 'value', 'set');
    setProp(el, 'value', '1');
    expect(write).not.toHaveBeenCalled();
    expect(getValue(el)).toBe('1');
    el.value = 'typed';
    setProp(el, 'value', '1');
    expect(el.value).toBe('1');
  });

  test('value of progress and custom elements is a plain property', () => {
    const progress = document.createElement('progress');
    setProp(progress, 'value', 0.5);
    expect(progress.value).toBe(0.5);
    const custom = document.createElement('my-input');
    const obj = {};
    setProp(custom, 'value', obj);
    expect(Reflect.get(custom, 'value')).toBe(obj);
  });

  test('value for non-text input', () => {
    const el = document.createElement('option');
    el.textContent = 'foo';
    setProp(el, 'value', 'foo');
    expect(el.getAttribute('value')).toBe('foo');
    expect(el.value).toBe('foo');
    setProp(el, 'value', null);
    el.textContent = '';
    expect(el.value).toBe('');
    expect(el.getAttribute('value')).toBe(null);
  });

  test('boolean prop', () => {
    const el = document.createElement('select');
    setProp(el, 'multiple', '');
    expect(el.multiple).toBe(true);
    setProp(el, 'multiple', null);
    expect(el.multiple).toBe(false);
    setProp(el, 'multiple', true);
    expect(el.multiple).toBe(true);
    setProp(el, 'multiple', 0);
    expect(el.multiple).toBe(false);
    setProp(el, 'multiple', '0');
    expect(el.multiple).toBe(true);
    setProp(el, 'multiple', false);
    expect(el.multiple).toBe(false);
    setProp(el, 'multiple', 1);
    expect(el.multiple).toBe(true);
    setProp(el, 'multiple', undefined);
    expect(el.multiple).toBe(false);
  });

  test('skips a value equal to the last one written', () => {
    const el = document.createElement('div');
    setProp(el, 'title', 'a');
    const write = vi.spyOn(el, 'title', 'set');
    setProp(el, 'title', 'a');
    expect(write).not.toHaveBeenCalled();
    setProp(el, 'title', 'b');
    expect(write).toHaveBeenCalledTimes(1);
  });

  test('innerHTML through setHtml', () => {
    const el = document.createElement('div');
    setHtml(el, '<b>bar</b>');
    expect(el.innerHTML).toBe('<b>bar</b>');
    setHtml(el, undefined);
    expect(el.innerHTML).toBe('');
    const svg = document.createElementNS(svgNS, 'svg');
    setHtml(svg, '<g></g>');
    expect(svg.innerHTML).toBe('<g></g>');
  });

  test('set value as-is for non string-value props', () => {
    const el = document.createElement('video');
    el.srcObject = null;
    const initialValue = el.srcObject;
    const fakeObject = {};
    setProp(el, 'srcObject', fakeObject);
    expect(el.srcObject).toBe(fakeObject);
    setProp(el, 'srcObject', null);
    expect(el.srcObject).toBe(initialValue);
  });

  test('a rejected prop value throws', () => {
    const el = document.createElement('div');
    const err = new TypeError('Invalid type');
    Object.defineProperty(el, 'someProp', {
      set() {
        throw err;
      },
    });
    expect(() => setProp(el, 'someProp', 'foo')).toThrow(err);
  });

  test('remove attribute when value is falsy', () => {
    const el = document.createElement('div');
    setProp(el, 'id', '');
    expect(el.hasAttribute('id')).toBe(true);
    setProp(el, 'id', null);
    expect(el.hasAttribute('id')).toBe(false);

    setProp(el, 'id', '');
    expect(el.hasAttribute('id')).toBe(true);
    setProp(el, 'id', undefined);
    expect(el.hasAttribute('id')).toBe(false);

    const img = document.createElement('img');
    setProp(img, 'width', '');
    setProp(img, 'width', 0);
    expect(img.hasAttribute('width')).toBe(true);
    setProp(img, 'width', null);
    expect(img.hasAttribute('width')).toBe(false);
  });

  test('form attribute', () => {
    const el = document.createElement('input');
    setDynamicProps(el, [{ form: 'foo' }]);
    expect(el.form).toBe(null);
    expect(el.getAttribute('form')).toBe('foo');
    setDynamicProps(el, [{ form: null }]);
    expect(el.getAttribute('form')).toBe(null);
  });

  test('readonly type prop on textarea', () => {
    const el = document.createElement('textarea');
    setDynamicProps(el, [{ type: null }]);
    expect(el.hasAttribute('type')).toBe(false);
  });

  test('input with size (number property)', () => {
    const el = document.createElement('input');
    setProp(el, 'size', 100);
    expect(el.size).toBe(100);
    setProp(el, 'size', null);
    expect(el.getAttribute('size')).toBe(null);
  });

  test('embedded tag with width and height', () => {
    for (const tag of ['img', 'video', 'canvas', 'source']) {
      const el = document.createElement(tag);
      setDynamicProps(el, [{ width: '24px', height: '10px' }]);
      expect(el.getAttribute('width')).toBe('24px');
      expect(el.getAttribute('height')).toBe('10px');
    }
  });

  test('width and height on custom elements', () => {
    const el = document.createElement('foobar');
    setDynamicProps(el, [{ width: '24px' }]);
    expect(el.getAttribute('width')).toBe('24px');
  });

  test('translate attribute', () => {
    const el = document.createElement('div');
    setDynamicProps(el, [{ translate: 'no' }]);
    expect(el.translate).toBeFalsy();
    expect(el.getAttribute('translate')).toBe('no');
  });

  test('enumerated, list and form-owner keys are attributes', () => {
    const el = document.createElement('input');
    setDynamicProps(el, [
      { spellcheck: 'false', draggable: 'true', autocorrect: 'off', list: 'l' },
    ]);
    expect(el.getAttribute('spellcheck')).toBe('false');
    expect(el.getAttribute('draggable')).toBe('true');
    expect(el.getAttribute('autocorrect')).toBe('off');
    expect(el.getAttribute('list')).toBe('l');
  });
});

describe('runtime-dom: events patching through setDynamicProps', () => {
  it('should assign event handler', () => {
    const el = document.createElement('div');
    const fn = vi.fn<(e: Event) => void>();
    setDynamicProps(el, [{ onClick: fn }]);
    el.dispatchEvent(new Event('click'));
    el.dispatchEvent(new Event('click'));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should update event handler', () => {
    const el = document.createElement('div');
    const prevFn = vi.fn<(e: Event) => void>();
    const nextFn = vi.fn<(e: Event) => void>();
    const add = vi.spyOn(el, 'addEventListener');
    setDynamicProps(el, [{ onClick: prevFn }]);
    el.dispatchEvent(new Event('click'));
    setDynamicProps(el, [{ onClick: nextFn }]);
    el.dispatchEvent(new Event('click'));
    el.dispatchEvent(new Event('click'));
    expect(prevFn).toHaveBeenCalledTimes(1);
    expect(nextFn).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('should unassign event handler', () => {
    const el = document.createElement('div');
    const fn = vi.fn<(e: Event) => void>();
    setDynamicProps(el, [{ onClick: fn }]);
    setDynamicProps(el, [{}]);
    el.dispatchEvent(new Event('click'));
    expect(fn).not.toHaveBeenCalled();
  });

  it('should support native onclick', () => {
    const el = document.createElement('div');
    setDynamicProps(el, [{ onclick: 'this.dataset.clicked = 1' }]);
    expect(el.getAttribute('onclick')).toBe('this.dataset.clicked = 1');
    const fn2 = vi.fn<(e: Event) => void>();
    setDynamicProps(el, [{ onclick: fn2 }]);
    const event = new Event('click');
    el.dispatchEvent(event);
    expect(fn2).toHaveBeenCalledWith(event);
  });

  test('should support preserved-case and hyphenated event names', () => {
    const el = document.createElement('div');
    const onOnce = vi.fn<(e: Event) => void>();
    const onMyEvent = vi.fn<(e: Event) => void>();
    setDynamicProps(el, [{ 'on:Once': onOnce, onMyEvent }]);
    el.dispatchEvent(new Event('Once'));
    el.dispatchEvent(new Event('my-event'));
    expect(onOnce).toHaveBeenCalledTimes(1);
    expect(onMyEvent).toHaveBeenCalledTimes(1);
  });

  test('ignores component model listeners', () => {
    const el = document.createElement('div');
    const add = vi.spyOn(el, 'addEventListener');
    setDynamicProps(el, [{ 'onUpdate:modelValue': () => {} }]);
    expect(add).not.toHaveBeenCalled();
  });

  test('svg takes native function handlers as props', () => {
    const el = document.createElementNS(svgNS, 'svg');
    const fn = vi.fn<() => void>();
    setDynamicProps(el, [{ onclick: fn, viewBox: '0 0 1 1' }]);
    expect(Reflect.get(el, 'onclick')).toBe(fn);
    expect(el.getAttribute('viewBox')).toBe('0 0 1 1');
  });
});

describe('setDynamicProps', () => {
  test('merges sources with the last winning and routes each key', () => {
    const el = document.createElement('input');
    setDynamicProps(el, [
      { id: 'a', class: 'x', style: { color: 'red' }, 'data-a': 1 },
      { id: 'b', 'aria-label': 'L' },
    ]);
    expect(el.id).toBe('b');
    expect(el.className).toBe('x');
    expect(el.style.color).toBe('red');
    expect(el.getAttribute('data-a')).toBe('1');
    expect(el.getAttribute('aria-label')).toBe('L');
  });

  test('removes keys that are no longer present, per channel', () => {
    const el = document.createElement('div');
    setDynamicProps(el, [{ title: 'own', 'data-own': 1, class: 'own' }]);
    setDynamicProps(el, [{ 'data-in': 2, class: 'in', style: 'color: red' }], true);
    expect(el.outerHTML).toBe(
      '<div title="own" data-own="1" class="own in" data-in="2" style="color: red;"></div>',
    );
    setDynamicProps(el, [{}], true);
    expect(el.outerHTML).toBe('<div title="own" data-own="1" class="own"></div>');
    setDynamicProps(el, []);
    expect(el.outerHTML).toBe('<div class=""></div>');
  });

  test('keeps an own and an inherited listener for the same event', () => {
    const el = document.createElement('div');
    const own = vi.fn<(e: Event) => void>();
    const inherited = vi.fn<(e: Event) => void>();
    setDynamicProps(el, [{ onClick: own }]);
    setDynamicProps(el, [{ onClick: inherited }], true);
    el.dispatchEvent(new Event('click'));
    expect([own.mock.calls.length, inherited.mock.calls.length]).toEqual([1, 1]);
  });
});

describe('toDisplayString', () => {
  test('nullish values', () => {
    expect(toDisplayString(null)).toBe('');
    expect(toDisplayString(undefined)).toBe('');
  });

  test('primitive values', () => {
    expect(toDisplayString(0)).toBe('0');
    expect(toDisplayString(1)).toBe('1');
    expect(toDisplayString(Number.NaN)).toBe('NaN');
    expect(toDisplayString(true)).toBe('true');
    expect(toDisplayString(false)).toBe('false');
    expect(toDisplayString('hello')).toBe('hello');
  });

  test('primitive values in refs', () => {
    expect(toDisplayString(ref(0))).toBe('0');
    expect(toDisplayString(ref(1))).toBe('1');
    expect(toDisplayString(ref(Number.NaN))).toBe('NaN');
    expect(toDisplayString(ref(true))).toBe('true');
    expect(toDisplayString(ref(false))).toBe('false');
    expect(toDisplayString(ref('hello'))).toBe('hello');
  });

  test('symbol values', () => {
    expect(toDisplayString(Symbol('hello'))).toBe('Symbol(hello)');
    expect(toDisplayString(ref(Symbol('hello')))).toBe('Symbol(hello)');
  });

  test('Object and Arrays', () => {
    const obj = { foo: 123 };
    expect(toDisplayString(obj)).toBe(JSON.stringify(obj, null, 2));
    const arr = [obj];
    expect(toDisplayString(arr)).toBe(JSON.stringify(arr, null, 2));

    const objWithToStringOverride = {
      foo: 555,
      toString() {
        return 'override';
      },
    };
    expect(toDisplayString(objWithToStringOverride)).toBe('override');

    const objWithNonInvokableToString = { foo: 555, toString: null };
    expect(toDisplayString(objWithNonInvokableToString)).toBe(
      JSON.stringify(objWithNonInvokableToString, null, 2),
    );

    // object created from null does not have .toString in its prototype
    const nullObjectWithoutToString: Record<string, unknown> = Object.create(null);
    nullObjectWithoutToString.bar = 1;
    expect(toDisplayString(nullObjectWithoutToString)).toBe('{\n  "bar": 1\n}');

    // array toString override is ignored
    const arrWithToStringOverride = [1, 2, 3];
    arrWithToStringOverride.toString = () => 'override for array is not supported';
    expect(toDisplayString(arrWithToStringOverride)).toBe('[\n  1,\n  2,\n  3\n]');
  });

  test('refs', () => {
    const n = ref(1);
    const np = computed(() => n.value + 1);
    expect(toDisplayString({ n, np })).toBe(JSON.stringify({ n: 1, np: 2 }, null, 2));
  });

  test('objects with custom toString', () => {
    class TestClass {
      toString() {
        return 'foo';
      }
    }
    expect(toDisplayString(new TestClass())).toBe('foo');
    expect(toDisplayString({ toString: () => 'bar' })).toBe('bar');
  });

  test('native objects', () => {
    const div = document.createElement('div');
    expect(toDisplayString(div)).toBe('[object HTMLDivElement]');
    expect(toDisplayString({ div })).toBe('{\n  "div": "[object HTMLDivElement]"\n}');
  });

  test('Map and Set', () => {
    const m = new Map<unknown, unknown>([
      [1, 'foo'],
      [{ baz: 1 }, { foo: 'bar', qux: 2 }],
    ]);
    const s = new Set<unknown>([1, { foo: 'bar' }, m]);
    const map = { 'Map(2)': { '1 =>': 'foo', '[object Object] =>': { foo: 'bar', qux: 2 } } };
    const set = { 'Set(3)': [1, { foo: 'bar' }, map] };
    expect(toDisplayString(m)).toBe(JSON.stringify(map, null, 2));
    expect(toDisplayString(s)).toBe(JSON.stringify(set, null, 2));
    expect(toDisplayString({ m, s })).toBe(JSON.stringify({ m: map, s: set }, null, 2));
    expect(toDisplayString(reactive(new Map([['k', 1]])))).toBe(
      JSON.stringify({ 'Map(1)': { 'k =>': 1 } }, null, 2),
    );
  });

  test('Map with Symbol keys', () => {
    const m = new Map<unknown, unknown>([
      [Symbol(), 'foo'],
      [Symbol(), 'bar'],
      [Symbol('baz'), 'baz'],
    ]);
    expect(toDisplayString(m)).toBe(
      JSON.stringify(
        { 'Map(3)': { 'Symbol(0) =>': 'foo', 'Symbol(1) =>': 'bar', 'Symbol(baz) =>': 'baz' } },
        null,
        2,
      ),
    );
  });

  test('Set with Symbol values', () => {
    const s = new Set([Symbol('foo'), Symbol('bar'), Symbol()]);
    expect(toDisplayString(s)).toBe(
      JSON.stringify({ 'Set(3)': ['Symbol(foo)', 'Symbol(bar)', 'Symbol()'] }, null, 2),
    );
  });

  test('Object with Symbol values', () => {
    expect(toDisplayString({ foo: Symbol('x'), bar: Symbol() })).toBe(
      JSON.stringify({ foo: 'Symbol(x)', bar: 'Symbol()' }, null, 2),
    );
  });

  test('tracks the reads of a reactive object', () => {
    const state = reactive({ list: [1] });
    let text = '';
    renderEffect(() => {
      text = toDisplayString(state);
    });
    state.list.push(2);
    return nextTick().then(() => {
      expect(JSON.parse(text)).toEqual({ list: [1, 2] });
    });
  });

  test('cycles print as [Circular] and shared references print in full', () => {
    const shared = { a: 1 };
    const obj: Record<string, unknown> = { shared, again: shared };
    obj.self = obj;
    const list: unknown[] = [obj];
    const map = new Map<string, unknown>();
    map.set('me', map);
    obj.map = map;
    obj.ref = ref(obj);
    expect(JSON.parse(toDisplayString(list))).toEqual([
      {
        shared: { a: 1 },
        again: { a: 1 },
        self: '[Circular]',
        map: { 'Map(1)': { 'me =>': '[Circular]' } },
        ref: '[Circular]',
      },
    ]);
  });
});
