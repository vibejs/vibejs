import { parse } from '@vibejs-org/compiler';
import { expect, it } from 'vitest';
import { CodeBuilder } from './builder.ts';
import { children } from './template.ts';

function emit(
  template: string,
  setup: string[] = [],
  refs = new Map<string, string>(),
  imports = new Set<string>(),
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
  const w = { b, names, source, depth: 0, self: () => false, imports, handles: 0, refs, loops: 0 };
  children(descriptor.template!.ast.children, w, new Set());
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
  expect(emit('<template v-if="a" #x /><p v-else-if="b" /><slot v-else />')).toEqual([
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

it('emits components with handles, and leaves v-slot content untyped with unknown refs', () => {
  const refs = new Map<string, string>();
  expect(emit('<C v-slot="{ x }"><p ref="a">{{ x }}</p></C><C ref="c" />', ['C'], refs)).toEqual([
    'var __vibe_c0 = __vibe.component(C)({ });',
    'var __vibe_c1 = __vibe.component(C)({ });',
  ]);
  expect([...refs]).toEqual([
    ['a', 'unknown'],
    ['c', 'typeof __vibe_c1.exposed'],
  ]);
});

it('types the ref of an imported component from its tag, and of <component :is> as unknown', () => {
  const refs = new Map<string, string>();
  emit('<C ref="c" /><component :is="C" ref="d" />', ['C'], refs, new Set(['C']));
  expect([...refs]).toEqual([
    [
      'c',
      "typeof C extends infer __VibeC extends Parameters<typeof __vibe.component>[0] ? ReturnType<ReturnType<typeof __vibe.component<__VibeC>>>['exposed'] : unknown",
    ],
    ['d', 'unknown'],
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
