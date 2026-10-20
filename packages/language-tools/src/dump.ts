import { Preset, SpanKind } from './builder.ts';
import type { GeneratedFile } from './generate.ts';

const KINDS = Object.fromEntries(Object.entries(SpanKind).map(([name, kind]) => [kind, name]));
const PRESETS = new Map<number, string>(
  Object.entries(Preset).map(([name, features]) => [features, name]),
);

/**
 * One line per span: `#7 Verbatim EXPR o[210,219) "user.name" → v[1302,1311) "user.name"`, then
 * one per directive: `@vibe-expect-error o[30,56) → v[1290,1340) "…"`.
 */
export function formatSpans(file: GeneratedFile, original: string): string {
  const spans = file.spans.map(([v, vLength, o, oLength, kind, features], i) => {
    const preset = PRESETS.get(features)!;
    const from = JSON.stringify(original.slice(o, o + oLength));
    const to = JSON.stringify(file.text.slice(v, v + vLength));
    return `#${i} ${KINDS[kind]} ${preset} o[${o},${o + oLength}) ${from} → v[${v},${v + vLength}) ${to}`;
  });
  const directives = file.directives.map(({ start, length, virtualStart, virtualEnd }) => {
    const to = JSON.stringify(file.text.slice(virtualStart, virtualEnd));
    return `@vibe-expect-error o[${start},${start + length}) → v[${virtualStart},${virtualEnd}) ${to}`;
  });
  return [...spans, ...directives].join('\n');
}
