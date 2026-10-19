import { expect, it } from 'vitest';
import { Preset, SpanKind } from './builder.ts';
import { formatSpans } from './dump.ts';

it('prints one line per span with kind, preset and both texts', () => {
  const file = {
    text: 'onClick(user.name)',
    spans: [
      [0, 7, 1, 5, SpanKind.Alias, Preset.ALIAS],
      [8, 9, 8, 9, SpanKind.Verbatim, Preset.EXPR],
    ] satisfies [number, number, number, number, SpanKind, number][],
    diagnostics: [],
  };
  expect(formatSpans(file, '@click="user.name"')).toBe(
    [
      '#0 Alias ALIAS o[1,6) "click" → v[0,7) "onClick"',
      '#1 Verbatim EXPR o[8,17) "user.name" → v[8,17) "user.name"',
    ].join('\n'),
  );
});
