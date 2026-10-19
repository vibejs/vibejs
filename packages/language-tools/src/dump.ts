import { Preset, SpanKind } from './builder.ts';
import type { GeneratedFile } from './generate.ts';

const KINDS = Object.fromEntries(Object.entries(SpanKind).map(([name, kind]) => [kind, name]));
const PRESETS = new Map<number, string>(
  Object.entries(Preset).map(([name, features]) => [features, name]),
);

/** One line per span: `#7 Verbatim EXPR o[210,219) "user.name" → v[1302,1311) "user.name"`. */
export function formatSpans(file: GeneratedFile, original: string): string {
  return file.spans
    .map(([v, vLength, o, oLength, kind, features], i) => {
      const preset = PRESETS.get(features)!;
      const from = JSON.stringify(original.slice(o, o + oLength));
      const to = JSON.stringify(file.text.slice(v, v + vLength));
      return `#${i} ${KINDS[kind]} ${preset} o[${o},${o + oLength}) ${from} → v[${v},${v + vLength}) ${to}`;
    })
    .join('\n');
}
