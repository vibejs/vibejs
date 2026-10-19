import { GenMapping } from '@jridgewell/gen-mapping';
import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';
import { ir, sfc } from '../test/transform.ts';
import { generate } from './codegen.ts';

/** The generated templates and `_render` of `<template>${template}</template>`; they must parse. */
function gen(template: string, dev = false): string {
  const source = sfc(template);
  const code = generate(
    ir(template),
    { filename: 'src/List.vibe', source, dev },
    new GenMapping(),
    0,
  );
  expect(parseSync('render.ts', code, { lang: 'ts' }).errors).toStrictEqual([]);
  return code;
}

/** The `_render` function alone. */
const render = (template: string, dev = false): string => {
  const code = gen(template, dev);
  return code.slice(code.indexOf('function _render'));
};

describe('generate', () => {
  it('declares the render parameters and uses the C3 identifier shape', () => {
    const code = render(
      '<p :a="label" :b="sz" :c="text" :d="$attrs.id" :e="Form.x" :f="Math.max(1, 2)"></p>',
    );
    expect(code).toMatch(
      /^function _render\(\$setup: any, \$props: any, \$ctx: any\) \{\n {2}const _n0 = _t0\(\)\n/,
    );
    expect(code).toContain('_setAttr(_n0, "a", $props.label)');
    expect(code).toContain('_setAttr(_n0, "b", $props.size)');
    expect(code).toContain('_setAttr(_n0, "c", $setup.text)');
    expect(code).toContain('_setAttr(_n0, "d", $ctx.attrs.id)');
    expect(code).toContain('_setAttr(_n0, "e", Form.x)');
    // A comma keeps an argument whole in parentheses.
    expect(code).toContain('_setAttr(_n0, "f", (Math.max(1, 2)))');
  });

  it('hoists each template, with the namespace of a foreign root', () => {
    expect(gen('<svg></svg><p></p>')).toMatch(
      /^const _t0 = _template\("<svg><\/svg>", "svg"\)\nconst _t1 = _template\("<p><\/p>"\)\n/,
    );
  });

  it('walks with child, next, txt and nthChild chains', () => {
    const code = render(
      '<div><p><b :a="text"></b></p><i :a="text"></i><a>{{ text }}</a><u></u><s :a="text"></s></div>',
    );
    expect(code).toContain('const _n0 = _child(_child(_n4))');
    expect(code).toContain('const _n1 = _nthChild(_n4, 1)');
    expect(code).toContain('const _n2 = _txt(_next(_n1))');
    expect(code).toContain('const _n3 = _next(_next(_next(_n1)))');
  });

  it('adds the source position of an effect in dev only', () => {
    expect(render('<p>{{ text }}</p>', true)).toContain(
      '_renderEffect(() => _setText(_n0, _toDisplayString($setup.text)), "src/List.vibe:1:14")',
    );
    expect(render('<p>{{ text }}</p>')).not.toContain('src/List.vibe');
  });

  it('returns one node, an array of roots, or an empty array', () => {
    expect(render('<p></p>')).toContain('return _n0\n}');
    expect(render('<p></p>text')).toContain('return [_n0, _n1]\n}');
    expect(render('')).toContain('return []\n}');
  });

  it('nests createIf for v-else-if and v-else', () => {
    const code = render(
      '<p v-if="text"></p><b v-else-if="count"></b><i v-else></i><u v-if="sz"></u>',
    );
    expect(code).toContain('const _n1 = _createIf(() => $setup.text, () => {');
    expect(code).toContain('}, () => _createIf(() => $setup.count, () => {');
    expect(code).toContain(
      'const _n5 = _createIf(() => $props.size, () => {\n    const _n4 = _t3()\n    return _n4\n  })',
    );
  });

  it('always passes getKey to createFor, with the identity for a numeric source', () => {
    expect(render('<p v-for="n in 3">{{ n }}</p>')).toContain('}, (v) => v)');
    const code = render('<p v-for="(item, key, i) in items" :key="key">{{ i }}</p>');
    expect(code).toContain('_createFor(() => $setup.items, (_for0, _for0k, _for0i) => {');
    expect(code).toContain('}, (item, key, i) => key)');
    // A blank alias keeps the position of the next one.
    expect(render('<p v-for="(item, , i) in items" :key="i">{{ item }}</p>')).toContain(
      '}, (item, _for0k, i) => i)',
    );
  });

  it('compiles :key outside v-for to createKeyed', () => {
    expect(render('<p :key="text"></p>')).toContain(
      'const _n1 = _createKeyed(() => $setup.text, () => {',
    );
  });

  it('passes component props as getters', () => {
    const code = render('<div><Item a="x" done :b="{ x: 1 }" @pick="text = $event" /></div>');
    expect(code).toContain(
      [
        'const _n0 = _createComponent(Item, {',
        '    a: () => "x",',
        '    done: () => true,',
        '    b: () => ({ x: 1 }),',
        '    onPick: () => ($event) => { $setup.text = $event },',
        '  })',
        '  _insert(_n0, _n1, _n2)',
      ].join('\n'),
    );
  });

  it('moves every prop into RawProps.$ with a spread, in source order', () => {
    expect(render('<Item a="x" v-bind="fixed" :b="text" :[text]="count" />')).toContain(
      '_createComponent(Item, { $: [() => ({ a: "x" }), () => $setup.fixed, () => ({ b: $setup.text }), () => ({ [$setup.text]: ($setup.count) })] }, {}, true)',
    );
  });

  it('passes conditional slots in RawSlots.$', () => {
    const code = render(
      '<div><Item><template #a v-if="text">A</template><template #b>B</template></Item></div>',
    );
    expect(code).toContain('_createComponent(Item, {}, {\n    b: () => {');
    expect(code).toContain('    $: [\n      () => ($setup.text ? { name: "a", fn: () => {');
  });

  it('passes isSingleRoot only for the only root, and _sfc for the file itself', () => {
    expect(render('<List />')).toContain('_createComponent(_sfc, {}, {}, true)');
    expect(render('<List /><p></p>')).toContain('_createComponent(_sfc)');
    expect(render('<component :is="Local" />')).toContain(
      '_createDynamicComponent(() => $setup.Local, {}, {}, true)',
    );
  });

  it('compiles <slot> to createSlot with props and a fallback', () => {
    expect(render('<div><slot name="x" :a="text">no</slot></div>')).toContain(
      '_createSlot("x", {\n    a: () => $setup.text,\n  }, () => {',
    );
    expect(render('<div><slot>no</slot></div>')).toContain('_createSlot("default", {}, () => {');
    expect(render('<div><slot v-bind="fixed" /></div>')).toContain(
      '_createSlot("default", { $: [() => $setup.fixed] })',
    );
  });

  it('compiles handlers by kind, with modifiers, keys and options', () => {
    const code = render(
      '<p @click="(e) => text.at(e)" @a="fixed.a" @b="count++" @c.stop.prevent="count++" @keydown.enter="count++" @d.once.capture="count++"></p>',
    );
    expect(code).toContain('_on(_n0, "click", (e) => $setup.text.at(e))');
    expect(code).toContain('_on(_n0, "a", (...args) => $setup.fixed.a(...args))');
    expect(code).toContain('_on(_n0, "b", ($event) => { $setup.count++ })');
    expect(code).toContain(
      '_on(_n0, "c", _withModifiers(($event) => { $setup.count++ }, ["stop", "prevent"]))',
    );
    expect(code).toContain(
      '_on(_n0, "keydown", _withKeys(($event) => { $setup.count++ }, ["enter"]))',
    );
    expect(code).toContain(
      '_on(_n0, "d", ($event) => { $setup.count++ }, { once: true, capture: true })',
    );
  });

  it('starts each closure with the preludes of its scopes, outer to inner', () => {
    const code = render(
      '<Item v-for="{ id, rows } in items" :key="id" #default="{ cell }"><p v-for="(row, i) in rows" :key="id + i" @click="items.push(row)" @a="row.go" :x="[id, row, cell]"></p></Item>',
    );
    expect(code).toContain('}, ({ id, rows }) => id)');
    expect(code).toContain(
      '_createFor(() => { const { id, rows } = _for0.value; return rows }, (_for1, _for1k) => {',
    );
    expect(code).toContain(
      '_on(_n1, "click", ($event) => { const row = _for1.value; const i = _for1k.value; $setup.items.push(row) })',
    );
    expect(code).toContain(
      '_on(_n1, "a", (...args) => { const row = _for1.value; const i = _for1k.value; return row.go(...args) })',
    );
    expect(code).toContain(
      '_renderEffect(() => { const { id, rows } = _for0.value; const { cell } = _slot0; const row = _for1.value; const i = _for1k.value; _setAttr(_n1, "x", ([id, row, cell])) })',
    );
    expect(code).toContain('}, (row, i) => { const { id, rows } = _for0.value; return id + i })');
    expect(code).toContain('default: (_slot0) => {');
  });

  it('calls a function handler that reads a template local through a prelude', () => {
    expect(render('<p v-for="item in items" :key="item.id" @click="() => item"></p>')).toContain(
      '_on(_n0, "click", (...args) => { const item = _for0.value; return (() => item)(...args) })',
    );
  });
});
