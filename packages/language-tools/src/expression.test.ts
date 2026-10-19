import { expect, it } from 'vitest';
import { CodeBuilder, Preset, SpanKind } from './builder.ts';
import { aliasNames, expression, type Names } from './expression.ts';

const names = (): Names => ({
  setup: new Map([['count', [0, 5]]]),
  ctx: new Map([['limit', [6, 11]]]),
  usedSetup: new Set(),
  usedCtx: new Set(),
  unknown: new Map(),
  writes: false,
});

function emit(source: string, locals: string[] = []) {
  const b = new CodeBuilder(source);
  const n = names();
  expression(b, n, source, [0, source.length], new Set(locals));
  return { text: b.text, spans: b.spans, n };
}

it('keeps reads verbatim with BOUND spans on setup and ctx names', () => {
  const { text, spans, n } = emit('count + limit + Math.PI + other');
  expect(text).toBe('count + limit + Math.PI + other');
  expect(spans.map(([, , o, l, , f]) => [o, l, f])).toEqual([
    [0, 5, Preset.BOUND],
    [5, 3, Preset.EXPR],
    [8, 5, Preset.BOUND],
    [13, 18, Preset.EXPR],
  ]);
  expect([...n.usedSetup, ...n.usedCtx]).toEqual(['count', 'limit']);
  expect(n.writes).toBe(false);
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
