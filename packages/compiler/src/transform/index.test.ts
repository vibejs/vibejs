import { describe, expect, it } from 'vitest';
import { dump, ir } from '../../test/transform.ts';
import { analyze } from '../script/analyze.ts';
import { parse } from '../sfc/parse.ts';
import { transform } from './index.ts';

/** `[rule, template, style, IR]`: the IR as `dump` prints it, then the sorted ABI helpers. */
const cases: [string, string, string, string][] = [
  [
    'text run with interpolation (txt)',
    '<p>a {{ text }} b</p>',
    '',
    't0 = <p> </p>\nn1 = t0\nn0 = n1.txt\neffect setText(n0, "a " + _toDisplayString($setup.text) + " b")\nreturn n1\nABI renderEffect setText template toDisplayString txt',
  ],
  [
    'interpolation root',
    '{{ text }}',
    '',
    't0 =  \nn0 = t0\neffect setText(n0, _toDisplayString($setup.text))\nreturn n0\nABI renderEffect setText template toDisplayString',
  ],
  ['static text root', 'hi', '', 't0 = hi\nn0 = t0\nreturn n0\nABI template'],
  [
    'attribute and property bindings, .attr .prop .camel',
    '<a :href="text" :title.attr="text" .foo="text" :value="text" :view-box.camel="text"></a>',
    '',
    't0 = <a></a>\nn0 = t0\neffect setAttr(n0, "href", $setup.text)\neffect setAttr(n0, "title", $setup.text)\neffect setProp(n0, "foo", $setup.text)\neffect setProp(n0, "value", $setup.text)\neffect setAttr(n0, "viewBox", $setup.text)\nreturn n0\nABI renderEffect setAttr setProp template',
  ],
  [
    'static class and style merged into the setters',
    '<p class="a" :class="{ b: text }" style="color: red" :style="fixed"></p>',
    '',
    't0 = <p></p>\nn0 = t0\neffect setClass(n0, ["a", ({ b: $setup.text })])\neffect setStyle(n0, ["color: red", ($setup.fixed)])\nreturn n0\nABI renderEffect setClass setStyle template',
  ],
  [
    'class binding without static part',
    '<p :class="text"></p>',
    '',
    't0 = <p></p>\nn0 = t0\neffect setClass(n0, $setup.text)\nreturn n0\nABI renderEffect setClass template',
  ],
  [
    'v-bind object and dynamic key fold into setDynamicProps',
    '<p id="x" :title="text" v-bind="fixed" :[text]="count" class="c" disabled @click="count++"></p>',
    '',
    't0 = <p></p>\nn0 = t0\non(n0, "click", statements($setup.count++))\neffect setDynamicProps(n0, [{ "id": ("x"), "title": ($setup.text) }, ($setup.fixed), { [$setup.text]: ($setup.count), "class": ("c"), "disabled": ("") }])\nreturn n0\nABI on renderEffect setDynamicProps template',
  ],
  [
    'same-name shorthand',
    '<p :label></p>',
    '',
    't0 = <p></p>\nn0 = t0\neffect setAttr(n0, "label", $props.label)\nreturn n0\nABI renderEffect setAttr template',
  ],
  [
    'events: options, modifiers, keys, empty handler',
    '<button @click.stop.prevent.once="count++" @keyup.enter.page-down="Form.submit" @input.capture.passive="(e) => count++" @submit.prevent></button>',
    '',
    't0 = <button></button>\nn0 = t0\non(n0, "click", statements($setup.count++) mods=stop,prevent options=once)\non(n0, "keyup", path(Form.submit) keys=enter,page-down)\non(n0, "input", function((e) => $setup.count++) options=capture,passive)\non(n0, "submit", function(() => {}) mods=prevent)\nreturn n0\nABI on template withKeys withModifiers',
  ],
  [
    'v-if chain across whitespace',
    '<p v-if="text">a</p> <p v-else-if="count">b</p><p v-else>c</p>',
    '',
    't0 = <p>a</p>\nt1 = <p>b</p>\nt2 = <p>c</p>\nn1 = if\n  if $setup.text\n    n0 = t0\n    return n0\n  if $setup.count\n    n2 = t1\n    return n2\n  else\n    n3 = t2\n    return n3\nreturn n1\nABI createIf template',
  ],
  [
    'template v-if',
    '<template v-if="text"><p>a</p>{{ text }}</template>',
    '',
    't0 = <p>a</p>\nt1 =  \nn2 = if\n  if $setup.text\n    n0 = t0\n    n1 = t1\n    effect setText(n1, _toDisplayString($setup.text))\n    return n0, n1\nreturn n2\nABI createIf renderEffect setText template toDisplayString',
  ],
  [
    'v-for with key and index',
    '<li v-for="(item, i) in items" :key="item.id">{{ item.id }} {{ i }}</li>',
    '',
    't0 = <li> </li>\nn2 = for $setup.items as item,i,- key item.id @item,i\n  n1 = t0\n  n0 = n1.txt\n  effect setText(n0, _toDisplayString(item.id) + " " + _toDisplayString(i) @item,i)\n  return n1\nreturn n2\nABI createFor renderEffect setText template toDisplayString txt',
  ],
  [
    'v-for over a numeric literal',
    '<li v-for="n in 3">{{ n }}</li>',
    '',
    't0 = <li> </li>\nn2 = for 3 as n,-,- key -\n  n1 = t0\n  n0 = n1.txt\n  effect setText(n0, _toDisplayString(n) @n)\n  return n1\nreturn n2\nABI createFor renderEffect setText template toDisplayString txt',
  ],
  [
    'template v-for',
    '<template v-for="item in items" :key="item.id"><p>{{ item.id }}</p><p></p></template>',
    '',
    't0 = <p> </p>\nt1 = <p></p>\nn3 = for $setup.items as item,-,- key item.id @item\n  n1 = t0\n  n0 = n1.txt\n  effect setText(n0, _toDisplayString(item.id) @item)\n  n2 = t1\n  return n1, n2\nreturn n3\nABI createFor renderEffect setText template toDisplayString txt',
  ],
  [
    'key outside v-for',
    '<p :key="text">x</p>',
    '',
    't0 = <p>x</p>\nn1 = keyed $setup.text\n  n0 = t0\n  return n0\nreturn n1\nABI createKeyed template',
  ],
  [
    'component props, events and models',
    '<Item a="x" done :n="count" @pick="count++" @update:model-value="count++" v-model:title.trim="text" v-model="text" :b.camel="count" />',
    '',
    'n0 = component Item single a="x" done n=$setup.count onPick=statements($setup.count++) onUpdate:modelValue=statements($setup.count++) title=$setup.text onUpdate:title=statements($setup.text = $event) titleModifiers={ "trim": true } modelValue=$setup.text onUpdate:modelValue=statements($setup.text = $event) b=$setup.count\nreturn n0\nABI createComponent',
  ],
  [
    'component spread groups in source order',
    '<Item a="x" v-bind="fixed" :b="count" :[text]="count" />',
    '',
    'n0 = component Item single spread [a="x"] ($setup.fixed) [b=$setup.count] ({ [$setup.text]: ($setup.count) })\nreturn n0\nABI createComponent',
  ],
  [
    'component references',
    '<div><Local /><Form.Input /><Other /><Aliased /><List /></div>',
    '',
    't0 = <div><!><!><!><!><!></div>\nn5 = t0\nn6 = n5.child\nn7 = n6.next\nn8 = n7.next\nn9 = n8.next\nn10 = n9.next\nn0 = component $setup.Local in n5 before n6\nn1 = component Form.Input in n5 before n7\nn2 = component $props.Other in n5 before n8\nn3 = component $props.Slot in n5 before n9\nn4 = component _sfc in n5 before n10\nreturn n5\nABI child createComponent insert next template',
  ],
  [
    'dynamic component',
    '<component :is="Local" />',
    '',
    'n0 = component ($setup.Local) single\nreturn n0\nABI createDynamicComponent',
  ],
  [
    'named, scoped and conditional slots with implicit default',
    '<Item><template #a="{ id }">{{ id }}</template><template #b v-if="text">b</template><template #b v-else-if="count">c</template><template #c v-else>d</template>x</Item>',
    '',
    't0 =  \nt1 = b\nt2 = c\nt3 = d\nt4 = x\nn0 = component Item single\n  #a({ id })\n    n1 = t0\n    effect setText(n1, _toDisplayString(id) @id)\n    return n1\n  #b() if $setup.text\n    n2 = t1\n    return n2\n  #b() if !($setup.text) && ($setup.count)\n    n3 = t2\n    return n3\n  #c() if !($setup.text) && !($setup.count)\n    n4 = t3\n    return n4\n  #default()\n    n5 = t4\n    return n5\nreturn n0\nABI createComponent renderEffect setText template toDisplayString',
  ],
  [
    'v-slot on the component',
    '<Item v-slot="p">{{ p }}</Item><Item v-slot:named>y</Item><Item></Item>',
    '',
    't0 =  \nt1 = y\nn0 = component Item\n  #default(p)\n    n1 = t0\n    effect setText(n1, _toDisplayString(p) @p)\n    return n1\nn2 = component Item\n  #named()\n    n3 = t1\n    return n3\nn4 = component Item\nreturn n0, n2, n4\nABI createComponent renderEffect setText template toDisplayString',
  ],
  [
    'slot outlets with fallback and spread',
    '<slot name="x" :p="text" a b="c">fb</slot><slot v-bind="fixed" :q="text" :[text]="count" />',
    '',
    't0 = fb\nn1 = slot x p=$setup.text a b="c"\n  n0 = t0\n  return n0\nn2 = slot default spread ($setup.fixed) [q=$setup.text] ({ [$setup.text]: ($setup.count) })\nreturn n1, n2\nABI createSlot template',
  ],
  [
    'native v-model kinds',
    '<input v-model.lazy.number.trim="text"><textarea v-model="text"></textarea><input type="checkbox" v-model="text" true-value="yes" :false-value="count"><input type="radio" v-model="text"><select v-model.number="text"></select><input type="checkbox" v-model="text">',
    '',
    't0 = <input>\nt1 = <textarea></textarea>\nt2 = <input type="checkbox">\nt3 = <input type="radio">\nt4 = <select></select>\nt5 = <input type="checkbox">\nn0 = t0\napplyTextModel(n0, () => $setup.text, statements($setup.text = $event), {"lazy":true,"number":true,"trim":true})\nn1 = t1\napplyTextModel(n1, () => $setup.text, statements($setup.text = $event))\nn2 = t2\napplyCheckboxModel(n2, () => $setup.text, statements($setup.text = $event), { true: () => "yes", false: () => $setup.count })\nn3 = t3\napplyRadioModel(n3, () => $setup.text, statements($setup.text = $event))\nn4 = t4\napplySelectModel(n4, () => $setup.text, statements($setup.text = $event), {"number":true})\nn5 = t5\napplyCheckboxModel(n5, () => $setup.text, statements($setup.text = $event))\nreturn n0, n1, n2, n3, n4, n5\nABI applyCheckboxModel applyRadioModel applySelectModel applyTextModel template',
  ],
  [
    'v-show, v-html and v-text',
    '<div v-show="text"></div><div v-html="text"></div><div v-text="text"></div>',
    '',
    't0 = <div></div>\nt1 = <div></div>\nt2 = <div></div>\nn0 = t0\napplyVShow(n0, () => $setup.text)\nn1 = t1\neffect setHtml(n1, $setup.text)\nn2 = t2\neffect setText(n2, _toDisplayString($setup.text))\nreturn n0, n1, n2\nABI applyVShow renderEffect setHtml setText template toDisplayString',
  ],
  [
    'string and function refs',
    '<div ref="box"></div><div v-for="i in items" :key="i.id" :ref="(el) => count++"></div><Item ref="box" /><Item :ref="Form.set" />',
    '',
    't0 = <div></div>\nt1 = <div></div>\nn4 = t1\nsetRef(n4, "box", false)\nn1 = for $setup.items as i,-,- key i.id @i\n  n0 = t0\n  setRef(n0, function((el) => $setup.count++), true)\n  return n0\nn2 = component Item\nsetRef(n2, "box", false)\nn3 = component Item\nsetRef(n3, path(Form.set), false)\nreturn n4, n1, n2, n3\nABI createComponent createFor setRef template',
  ],
  [
    'v-pre',
    '<div v-pre :a="x">{{ raw }}<Comp/></div>',
    '',
    't0 = <div :a="x">{{ raw }}<Comp></Comp></div>\nn0 = t0\nreturn n0\nABI template',
  ],
  [
    'svg and math roots',
    '<svg><circle r="1"/></svg><math><mi>x</mi></math>',
    '',
    't0 (svg) = <svg><circle r="1"></circle></svg>\nt1 (math) = <math><mi>x</mi></math>\nn0 = t0\nn1 = t1\nreturn n0, n1\nABI template',
  ],
  [
    'svg namespace of a branch template',
    '<svg><g v-if="text"><circle /></g></svg>',
    '',
    't0 (svg) = <g><circle></circle></g>\nt1 (svg) = <svg><!></svg>\nn2 = t1\nn3 = n2.child\nn1 = if in n2 before n3\n  if $setup.text\n    n0 = t0\n    return n0\nreturn n2\nABI child createIf insert template',
  ],
  [
    'table nesting split',
    '<table><tr><td>{{ text }}</td></tr></table>',
    '',
    't0 = <tr><td> </td></tr>\nt1 = <table><!></table>\nn2 = t1\nn3 = n2.child\nn1 = t0\nn0 = n1.child.txt\neffect setText(n0, _toDisplayString($setup.text))\ninsert n1 into n2 before n3\nreturn n2\nABI child insert renderEffect setText template toDisplayString txt',
  ],
  [
    'p and a nesting splits',
    '<p><div></div></p><a><a></a></a>',
    '',
    't0 = <div></div>\nt1 = <p><!></p>\nt2 = <a></a>\nt3 = <a><!></a>\nn1 = t1\nn2 = n1.child\nn0 = t0\ninsert n0 into n1 before n2\nn4 = t3\nn5 = n4.child\nn3 = t2\ninsert n3 into n4 before n5\nreturn n1, n4\nABI child insert template',
  ],
  [
    'multiple roots',
    '<p>a</p><p>b</p>',
    '',
    't0 = <p>a</p>\nt1 = <p>b</p>\nn0 = t0\nn1 = t1\nreturn n0, n1\nABI template',
  ],
  [
    'scope attribute, never on components',
    '<div class="x"><Item /></div>',
    '<style scoped>.x{}</style>',
    't0 = <div class="x" data-vb-0a1b2c3d><!></div>\nn1 = t0\nn2 = n1.child\nn0 = component Item in n1 before n2\nreturn n1\nABI child createComponent insert template',
  ],
  [
    'leading newline of pre',
    '<pre>\n\nx</pre>',
    '',
    't0 = <pre>\n\nx</pre>\nn0 = t0\nreturn n0\nABI template',
  ],
  [
    'nthChild and next walks',
    '<div><p></p><p></p><p :id="text"></p><p :id="text"></p></div>',
    '',
    't0 = <div><p></p><p></p><p></p><p></p></div>\nn2 = t0\nn0 = n2.2\nn1 = n0.next\neffect setAttr(n0, "id", $setup.text)\neffect setAttr(n1, "id", $setup.text)\nreturn n2\nABI next nthChild renderEffect setAttr template',
  ],
  [
    'chained walks',
    '<div><p><span>{{ text }}</span></p><i>{{ text }}</i></div>',
    '',
    't0 = <div><p><span> </span></p><i> </i></div>\nn2 = t0\nn0 = n2.child.child.txt\nn1 = n2.1.txt\neffect setText(n0, _toDisplayString($setup.text))\neffect setText(n1, _toDisplayString($setup.text))\nreturn n2\nABI child nthChild renderEffect setText template toDisplayString txt',
  ],
  [
    'single component root',
    '<Item />',
    '',
    'n0 = component Item single\nreturn n0\nABI createComponent',
  ],
];

describe('transform', () => {
  it.each(cases)('%s', (_, template, style, expected) => {
    const root = ir(template, style);
    expect(`${dump(root)}\nABI ${[...root.abi].toSorted().join(' ')}`).toBe(expected);
  });
});

describe('transform edge cases', () => {
  it('renders nothing without a template', () => {
    const { descriptor } = parse('<script setup lang="ts"></script>', { filename: 'A.vibe' });
    const out = transform(descriptor, analyze(descriptor), { id: '0a1b2c3d' });
    expect(out).toStrictEqual({
      ir: { templates: [], block: { ops: [], returns: [] }, abi: new Set() },
      diagnostics: [],
    });
  });

  it.each([
    ['<template v-for="i in items" :key="i.id">a<p></p></template>', 't0 = a'],
    ['<div v-pre hidden v-x></div>', 't0 = <div hidden v-x></div>'],
    [
      '<input type="checkbox" v-model="fixed.a" true-value>',
      'applyCheckboxModel(n0, () => $setup.fixed.a, statements($setup.fixed.a = $event), { true: () => "" })',
    ],
    ['<slot name v-if="text" />', 'n0 = slot\n'],
    ['<slot v-for="i in items" :key="i.id" :i="i" :j.camel="i" />', '= slot default i=i @i j=i @i'],
    [
      '<Item><template #a></template> <b>x</b> <template #c></template></Item>',
      '#default()\n    n1 = t0',
    ],
    ['<component :is="1" />', 'n0 = component (1) single'],
    ['<Item><template #a="{ b = &quot;x&quot; }">{{ b }}</template></Item>', '#a({ b = "x" })'],
  ])('%s', (template, line) => {
    expect(dump(ir(template))).toContain(line);
  });
});
