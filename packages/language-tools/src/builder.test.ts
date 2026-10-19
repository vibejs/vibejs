import { expect, it } from 'vitest';
import { CodeBuilder, Feature, Preset, SpanKind } from './builder.ts';

it('appends text and records verbatim, atom and alias spans', () => {
  const b = new CodeBuilder('<p @click="go">')
    .add('x(')
    .verbatim(11, 13, Preset.EXPR)
    .verbatim(5, 5, Preset.EXPR)
    .add(', ')
    .alias('onClick', 4, 9, Preset.ALIAS)
    .atom('true', 1, 2, Preset.BOUND);
  expect(b.text).toBe('x(go, onClicktrue');
  expect(b.spans).toEqual([
    [2, 2, 11, 2, SpanKind.Verbatim, Preset.EXPR],
    [6, 7, 4, 5, SpanKind.Alias, Preset.ALIAS],
    [13, 4, 1, 1, SpanKind.Atom, Preset.BOUND],
  ]);
});

it('shifts the spans of an appended builder', () => {
  const inner = new CodeBuilder('abc').verbatim(1, 2, Preset.EXPR);
  const outer = new CodeBuilder('abc').add('12').append(inner);
  expect(outer.text).toBe('12b');
  expect(outer.spans).toEqual([[2, 1, 1, 1, SpanKind.Verbatim, Preset.EXPR]]);
});

it('keeps the TypeScript feature bits and presets without formatting', () => {
  expect(Feature.All).toBe((1 << 20) - 1);
  expect(Feature.CodeLens).toBe(1 << 19);
  for (const features of Object.values(Preset)) expect(features & Feature.Formatting).toBe(0);
  expect(Preset.BOUND & (Feature.Rename | Feature.LinkedEditing)).toBe(0);
  expect(Preset.ANCHOR).toBe(Feature.Definition);
});
