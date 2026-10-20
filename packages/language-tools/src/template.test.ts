import { parse } from '@vibejs-org/compiler';
import { expect, it } from 'vitest';
import { CodeBuilder } from './builder.ts';
import { children } from './template.ts';

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
    '(($event: unknown) => { g($event) });',
  ]);
  expect(emit('<p v-text="a" v-text.x="b" />')).toEqual([
    '__vibe.el(__vibe.tags.p)({ textContent: a });',
    '(b);',
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
