import { Feature, SpanKind } from '../src/builder.ts';
import type { GeneratedFile } from '../src/generate.ts';

/**
 * The broken invariants of `generate()` output, empty when all hold: spans and directive ranges
 * are sorted, non-overlapping and in bounds; verbatim spans copy the original exactly; one ANCHOR
 * on the default export; no synthesized `@ts-ignore` or `@ts-expect-error`.
 */
export function invariantErrors(
  source: string,
  { text, spans, directives }: GeneratedFile,
): string[] {
  const errors: string[] = [];
  let end = 0;
  spans.forEach(([v, vLength, o, oLength, kind], i) => {
    if (v < end || v + vLength > text.length || o + oLength > source.length) {
      errors.push(`span #${i} overlaps or is out of bounds`);
    }
    end = v + vLength;
    const copied = text.slice(v, v + vLength) === source.slice(o, o + oLength);
    if (kind === SpanKind.Verbatim && (vLength !== oLength || !copied)) {
      errors.push(`verbatim span #${i} differs from the original`);
    }
  });

  // tsc rejects overlapping directive ranges.
  end = 0;
  const byVirtual = directives.toSorted((a, b) => a.virtualStart - b.virtualStart);
  for (const { start, virtualStart, virtualEnd } of byVirtual) {
    if (virtualStart < end || virtualEnd < virtualStart || virtualEnd > text.length) {
      errors.push(`directive at ${start} overlaps or is out of bounds`);
    }
    if (!source.startsWith('<!--', start)) errors.push(`directive at ${start} is not a comment`);
    end = virtualEnd;
  }

  const anchors = spans.filter(
    ([, , , , kind, features]) => features === Feature.Definition && kind === SpanKind.Atom,
  );
  const [anchor, anchorLength, o, oLength] = anchors[0] ?? [];
  const exported = text.slice(anchor, anchor + anchorLength).startsWith('export default ');
  if (anchors.length !== 1 || o !== 0 || oLength !== 0 || !exported) {
    errors.push('no single ANCHOR on the default export');
  }

  let synthesized = text;
  for (const [v, vLength, , , kind] of spans) {
    if (kind === SpanKind.Verbatim) {
      synthesized = synthesized.slice(0, v) + ' '.repeat(vLength) + synthesized.slice(v + vLength);
    }
  }
  if (/@ts-(?:ignore|expect-error)/.test(synthesized)) errors.push('synthesized ts directive');
  return errors;
}
