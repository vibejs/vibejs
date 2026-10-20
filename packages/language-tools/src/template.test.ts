import { NodeTypes, parse, type ElementNode } from '@vibejs-org/compiler';
import { expect, it } from 'vitest';
import { CodeBuilder } from './builder.ts';
import { generate } from './generate.ts';
import { children, expectErrors } from './template.ts';

function emit(
  template: string,
  setup: string[] = [],
  refs = new Map<string, string>(),
  locals = new Set<string>(),
) {
  const source = `<template>${template}</template>`;
  const { descriptor } = parse(source, { filename: 'A.vibe' });
  const b = new CodeBuilder(source);
  const names = {
    setup: new Map(setup.map((name) => [name, [0, 0] as [number, number]])),
    ctx: new Map(),
    usedSetup: new Set<string>(),
    usedCtx: new Set<string>(),
    unknown: new Map(),
    writes: false,
  };
  const w = {
    b,
    names,
    source,
    depth: 0,
    own: undefined,
    ownUsed: false,
    handles: 0,
    outlets: new Map(),
    slots: 0,
    exposes: false,
    inSelf: 0,
    forwarded: new Set<number>(),
    refs,
    loops: 0,
    targets: new Map(),
    expecting: false,
  };
  children(descriptor.template!.ast.children, w, locals);
  return b.text
    .trim()
    .split('\n')
    .map((line) => line.trim());
}

it('chains v-if, v-else-if and v-else across whitespace and comments', () => {
  expect(emit('<p v-if="a" />\n<!-- c -->\n<p v-else-if="b" />\n<p v-else />')).toEqual([
    'if (a) {',
    '__vibe.el(__vibe.tags.p)({ });',
    '}',
    'else if (b) {',
    '__vibe.el(__vibe.tags.p)({ });',
    '}',
    'else {',
    '__vibe.el(__vibe.tags.p)({ });',
    '}',
  ]);
});

it('breaks a chain at text and interpolations', () => {
  const orphan = ['if (b) {', '__vibe.el(__vibe.tags.p)({ });', '}'];
  const first = ['if (a) {', '__vibe.el(__vibe.tags.p)({ });', '}'];
  expect(emit('<p v-if="a" />x<p v-else-if="b" />')).toEqual([...first, ...orphan]);
  expect(emit('<p v-if="a" />{{ a }}<p v-else-if="b" />')).toEqual([...first, '(a);', ...orphan]);
});

it('keeps the condition of an untyped branch, so the chain still narrows', () => {
  expect(emit('<template v-if="a" #x /><p v-else-if="b" /><template v-else />')).toEqual([
    'if (a) {',
    '}',
    'else if (b) {',
    '__vibe.el(__vibe.tags.p)({ });',
    '}',
    'else {',
    '}',
  ]);
});

it('loops v-for inside v-if and binds its aliases as locals', () => {
  expect(emit('<i v-for="(x, i) in xs" v-if="ok" @click="x = i" />', ['x', 'xs', 'ok'])).toEqual([
    'if (ok) {',
    'for (const [x, i] of __vibe.vFor(xs)) {',
    '__vibe.el(__vibe.tags.i)({ onClick: () => { x = i } });',
    '}',
    '}',
  ]);
});

it('emits nothing for a v-for without aliases or an empty interpolation', () => {
  expect(emit('<i v-for="xs" />{{ }}')).toEqual(['']);
});

it('quotes static values on one line', () => {
  expect(emit(`<p title="it's\n\\" />`)).toEqual([
    "__vibe.el(__vibe.tags.p)({ title: 'it\\u0027s\\u000a\\u005c' });",
  ]);
});

it('walks a v-if or v-for fragment, not a slot wrapper', () => {
  expect(
    emit('<template v-for="x in xs" :key="x">{{ x }}</template><template #a>{{ a }}</template>'),
  ).toEqual(['for (const [x] of __vibe.vFor(xs)) {', '(x);', '(x);', '}']);
});

it('checks a value whose key is taken as a statement, and camelizes .camel', () => {
  expect(
    emit('<svg :id="a" :view-box.camel="v" @click="f" @click.once="g($event)" v-text="a" />'),
  ).toEqual([
    '__vibe.el(__vibe.tags.svg)({ id: a, viewBox: v, onClick: f, textContent: a });',
    '({ onClick: ($event) => { g($event) } } satisfies Partial<typeof __vibe.tags.svg>);',
  ]);
  expect(emit('<p v-text="a" v-text.x="b" />')).toEqual([
    '__vibe.el(__vibe.tags.p)({ textContent: a });',
    '(b);',
  ]);
});

it('types a handler whose key is taken by that key of the props, or as unknown when loose', () => {
  expect(emit('<x-a @e="f" @e.once="g($event)" />')).toEqual([
    '__vibe.customElement({ onE: f });',
    '({ onE: ($event) => { g($event) } } satisfies Parameters<typeof __vibe.customElement>[0]);',
  ]);
  expect(emit('<C.D v-model="m" @update:model-value="m = $event" />', ['C', 'm'])).toEqual([
    "var __vibe_c0 = __vibe.component(C.D)({ modelValue: m, 'onUpdate:modelValue': ($event = undefined as never) => { __vibe_w.m = $event } });",
    "({ 'onUpdate:modelValue': ($event) => { __vibe_w.m = $event } } satisfies Partial<Parameters<ReturnType<typeof __vibe.component<typeof C.D>>>[0]>);",
  ]);
  expect(emit('<component :is="C" @e="f" @e.once="g($event)" />', ['C'])).toEqual([
    'var __vibe_c0 = __vibe.dynamicComponent(C)({ onE: f });',
    '(($event: unknown) => { g($event) });',
  ]);
});

const el = (tag: string) => `HTMLElementTagNameMap extends Record<'${tag}', infer E> ? E : Element`;

it('types a repeated ref key as the union of its targets, unknown when one is untyped', () => {
  const refs = new Map<string, string>();
  emit(
    '<input v-if="a" ref="r"><textarea v-else ref="r" /><p ref="u" /><template><i ref="u" /></template><template><i ref="v" /></template><p ref="v" />',
    [],
    refs,
  );
  expect([...refs]).toEqual([
    ['r', `(${el('input')}) | (${el('textarea')})`],
    ['u', 'unknown'],
    ['v', 'unknown'],
  ]);
});

it('binds the names read by a v-for alias default, not the ones it declares', () => {
  expect(emit('<i v-for="{ a = d, b: [c] } in xs" />', ['a', 'c', 'd'])).toEqual([
    'for (const [{ a = d, b: [c] }] of __vibe.vFor(xs)) {',
    '__vibe.el(__vibe.tags.i)({ });',
    '}',
  ]);
});

it('emits components with handles, and types v-slot content with its params as locals', () => {
  const refs = new Map<string, string>();
  expect(
    emit('<C v-slot="{ x }"><p ref="a">{{ x }}</p></C><L ref="c" />', ['C'], refs, new Set(['L'])),
  ).toEqual([
    'var __vibe_c0 = __vibe.component(C)({ });',
    '{',
    'const [{ x }] = __vibe.slotParams(__vibe_c0.slots.default);',
    '__vibe.el(__vibe.tags.p)({ });',
    '(x);',
    '}',
    'var __vibe_c1 = __vibe.component(L)({ });',
  ]);
  expect([...refs]).toEqual([
    ['a', "HTMLElementTagNameMap extends Record<'p', infer E> ? E : Element"],
    ['c', 'typeof __vibe_c1.exposed'],
  ]);
});

it('emits slot templates of a component in v-if chains, then the implicit default children', () => {
  expect(
    emit(
      '<C><template v-if="a" #x="p">{{ p }}</template><template v-else #y />\n<!-- c -->\n</C>',
      ['C'],
    ),
  ).toEqual([
    'var __vibe_c0 = __vibe.component(C)({ });',
    'if (a) {',
    '{',
    'const [p] = __vibe.slotParams(__vibe_c0.slots.x);',
    '(p);',
    '}',
    '}',
    'else {',
    '{',
    '__vibe.slotParams(__vibe_c0.slots.y);',
    '}',
    '}',
  ]);
  expect(emit('<C>text<template #[k] /><template v-slot:a-b /></C>', ['C'])).toEqual([
    'var __vibe_c0 = __vibe.component(C)({ });',
    '{',
    "__vibe.slotParams(__vibe_c0.slots['a-b']);",
    '}',
    '{',
    '__vibe.slotParams(__vibe_c0.slots.default);',
    '}',
  ]);
});

it('leaves a slot template outside a component untyped', () => {
  const refs = new Map<string, string>();
  expect(emit('<div><template #a><p ref="r" /></template></div>', [], refs)).toEqual([
    '__vibe.el(__vibe.tags.div)({ });',
  ]);
  expect([...refs]).toEqual([['r', 'unknown']]);
  expect(emit('<C><template #a v-for="x in xs">{{ x }}</template></C>', ['C'])).toEqual([
    'var __vibe_c0 = __vibe.component(C)({ });',
  ]);
});

it('collects inferred outlets with raw keys, without the name or :key, and their refs as unknown', () => {
  const refs = new Map<string, string>();
  expect(emit('<slot name="n" :item-id="a" :key="a" ref="r" /><slot />', [], refs)).toEqual([
    "var __vibe_s0 = ({ 'item-id': a });",
    '(a);',
    'var __vibe_s1 = ({ });',
  ]);
  expect([...refs]).toEqual([['r', 'unknown']]);
});

const exposed = (tag: string) =>
  `${tag} extends infer __VibeC extends Parameters<typeof __vibe.component>[0] ? ReturnType<ReturnType<typeof __vibe.component<__VibeC>>>['exposed'] : unknown`;

it('types a component ref from its tag binding, and the ref of <component :is> as unknown', () => {
  const refs = new Map<string, string>();
  emit('<C.D ref="c" /><component :is="C" ref="d" /><U ref="u" />', ['C'], refs);
  expect([...refs]).toEqual([
    ['c', exposed("ReturnType<typeof __vibe.unrefs<{ c: typeof C }>>['c']['D']")],
    ['d', 'unknown'],
    ['u', 'typeof __vibe_c2.exposed'],
  ]);
});

it('writes a component model through its update handler, with modifiers', () => {
  expect(emit('<C v-model:x.trim="m" />', ['C', 'm'])).toEqual([
    "var __vibe_c0 = __vibe.component(C)({ x: m, 'onUpdate:x': ($event = undefined as never) => { __vibe_w.m = $event }, xModifiers: { trim: true } });",
  ]);
});

it('camelizes a kebab model name on a component', () => {
  expect(emit('<C v-model:first-name="m" />', ['C', 'm'])).toEqual([
    "var __vibe_c0 = __vibe.component(C)({ firstName: m, 'onUpdate:firstName': ($event = undefined as never) => { __vibe_w.m = $event } });",
  ]);
});

it('finds every @vibe-expect-error comment and its target', () => {
  const template = [
    '<!-- @vibe-expect-error --> <!-- c --><p />',
    '<div><!--@vibe-expect-error-->{{ a }}</div>',
    '<!-- @vibe-expect-error -->text',
    '<!-- @vibe-expect-error: reason --><p />',
    '<!-- @vibe-expect-error -->',
  ].join('');
  const source = `<template>${template}</template>`;
  const nodes = parse(source, { filename: 'A.vibe' }).descriptor.template!.ast.children;
  const [list, targets] = expectErrors(nodes);
  const comments = [...source.matchAll(/<!--\s*@vibe-expect-error\s*-->/g)];
  expect(list).toEqual(comments.map((m) => ({ start: m.index, length: m[0].length })));
  const [p, div] = nodes.filter((n): n is ElementNode => n.type === NodeTypes.ELEMENT);
  expect(targets).toEqual(
    new Map([
      [p, list[0]],
      [div.children[1], list[1]],
    ]),
  );
});

it('covers all code of the target; a directive inside it stays unplaced', () => {
  const file = generate(
    'A.vibe',
    '<template><!-- @vibe-expect-error --><ul><!-- @vibe-expect-error --><li /></ul></template>',
  );
  const [outer, inner] = file.directives;
  const covered = file.text.slice(outer.virtualStart, outer.virtualEnd);
  expect(covered.split('\n').map((line) => line.trim())).toEqual([
    '',
    '__vibe.el(__vibe.tags.ul)({ });',
    '__vibe.el(__vibe.tags.li)({ });',
  ]);
  expect([inner.virtualStart, inner.virtualEnd]).toEqual([file.text.length, file.text.length]);
});
