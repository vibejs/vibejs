import { forEachIdentifier } from '@vibejs-org/compiler';
import { expect, it } from 'vitest';
import { CodeBuilder, Preset, SpanKind } from './builder.ts';
import { aliasNames, expression, pathRef, primeWalks, type Names } from './expression.ts';

const names = (): Names => ({
  setup: new Map([['count', [0, 5]]]),
  ctx: new Map([['limit', [6, 11]]]),
  usedSetup: new Set(),
  usedCtx: new Set(),
  unknown: false,
  writes: false,
});

function emit(source: string, locals: string[] = []) {
  const b = new CodeBuilder(source);
  const n = names();
  expression(b, n, source, [0, source.length], new Set(locals));
  return { text: b.text, spans: b.spans, n };
}

it('keeps reads verbatim with BOUND spans on setup and ctx names', () => {
  const { text, spans, n } = emit('count + limit + Math.PI');
  expect(text).toBe('count + limit + Math.PI');
  expect(spans.map(([, , o, l, , f]) => [o, l, f])).toEqual([
    [0, 5, Preset.BOUND],
    [5, 3, Preset.EXPR],
    [8, 5, Preset.BOUND],
    [13, 10, Preset.EXPR],
  ]);
  expect([...n.usedSetup, ...n.usedCtx]).toEqual(['count', 'limit']);
  expect(n.writes).toBe(false);
  expect(n.unknown).toBe(false);
});

it('reads an unknown name from __vibe_unknown at each use, so the error lands there', () => {
  const { text, spans, n } = emit('other + other');
  expect(text).toBe('__vibe_unknown.other + __vibe_unknown.other');
  expect(spans.slice(0, 2)).toEqual([
    [0, 15, 0, 0, SpanKind.Atom, Preset.NONE],
    [15, 5, 0, 5, SpanKind.Verbatim, Preset.EXPR],
  ]);
  expect(n.unknown).toBe(true);
});

it.each([
  ['{ count, other }', '{ count, other: __vibe_unknown.other }'],
  ['f({ other })', '__vibe_unknown.f({ other: __vibe_unknown.other })'],
  ['if (count) { other }', 'if (count) { __vibe_unknown.other }'],
  ['count; { other }', 'count; { __vibe_unknown.other }'],
  ['[count, other]', '[count, __vibe_unknown.other]'],
])('expands a shorthand property with an unknown name only: %s', (source, expected) => {
  expect(emit(source).text).toBe(expected);
});

it('writes setup bindings through __vibe_w and props through __vibe_ctx', () => {
  const { text, spans, n } = emit('count++; limit = 1');
  expect(text).toBe('__vibe_w.count++; __vibe_ctx.limit = 1');
  // The prefixes stand for the empty range before the name, so assignment errors land on it.
  expect(spans.filter(([, , , , kind]) => kind === SpanKind.Atom)).toEqual([
    [0, 9, 0, 0, SpanKind.Atom, Preset.NONE],
    [18, 11, 9, 0, SpanKind.Atom, Preset.NONE],
  ]);
  expect(n.writes).toBe(true);
});

it('leaves template locals, arrow parameters and unparseable text alone', () => {
  expect(emit('count = 1', ['count']).text).toBe('count = 1');
  expect(emit('(count) => count++').text).toBe('(count) => count++');
  expect(emit('count.').spans).toEqual([[0, 6, 0, 6, SpanKind.Verbatim, Preset.EXPR]]);
});

it('lists the names a v-for alias declares', () => {
  const source = '(x, { a, b: [c] = d, ...e })';
  expect(aliasNames(source, [4, 27])).toEqual(['a', 'c', 'e']);
  expect(aliasNames(source, [1, 2])).toEqual(['x']);
});

it.each([
  'a',
  ' $event ',
  'item.id',
  'a.b.c',
  '(a.b) = 0',
  '( x ) = 0',
  '[row] = []',
  '[a.b] = []',
])('reads the member path %j without the parser, as the parser does', (text) => {
  const refs: unknown[] = [];
  forEachIdentifier(text, 0, (...ref) => refs.push(ref));
  expect([pathRef(text)]).toEqual(refs);
});

it.each(['this.a', 'true', 'private', 'a.b()', 'a[0]', 'a .b', '(a) = 1', 'a.0'])(
  'leaves %j to the parser',
  (text) => {
    expect(pathRef(text)).toBeUndefined();
  },
);

it.each([
  'count + limit',
  'count.value',
  '{ count, other }',
  'count++; limit = 1',
  'items.map((x) => x + other)',
  'count +',
])('emits %j the same from the primed cache and on demand', (source) => {
  const forms = [source, `(${source}) = 0`, `[${source}] = []`];
  const modes = [{}, { target: true }, { pattern: true }];
  const all = () =>
    modes.map((mode) => {
      const b = new CodeBuilder(source);
      expression(b, names(), source, [0, source.length], new Set(), mode);
      return [b.text, b.spans];
    });
  primeWalks([]);
  const onDemand = all();
  primeWalks(forms);
  expect(all()).toStrictEqual(onDemand);
});
