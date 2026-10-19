import { parse } from '@vibejs-org/compiler';
import { expect, it } from 'vitest';
import { CodeBuilder } from './builder.ts';
import { children } from './template.ts';

function emit(template: string, setup: string[] = []) {
  const source = `<template>${template}</template>`;
  const { descriptor } = parse(source, { filename: 'A.vibe' });
  const b = new CodeBuilder(source);
  const names = {
    setup: new Map(setup.map((name) => [name, [0, 0] as [number, number]])),
    ctx: new Map(),
    usedSetup: new Set<string>(),
    usedCtx: new Set<string>(),
    writes: false,
  };
  children(descriptor.template!.ast.children, { b, names, source, depth: 0 }, new Set());
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
  expect(emit('<C v-if="a" /><p v-else-if="b" /><template v-else>x</template>')).toEqual([
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
    '__vibe.el(__vibe.tags.i)({ onClick: ($event) => { x = i } });',
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
