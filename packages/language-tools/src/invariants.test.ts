import {
  analyzeScript,
  NodeTypes,
  parse,
  type SimpleExpressionNode,
  type TemplateChildNode,
} from '@vibejs-org/compiler';
import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';
import { codegen, compiler, typecheck } from '../test/fixtures.ts';
import { Feature, SpanKind } from './builder.ts';
import { generate } from './generate.ts';

const range = (e: SimpleExpressionNode): [number, number] => [e.loc.start.offset, e.loc.end.offset];

/** The template expressions of a parsed file, as original ranges. */
function expressions(nodes: TemplateChildNode[]): [number, number][] {
  return nodes.flatMap((node): [number, number][] => {
    if (node.type === NodeTypes.INTERPOLATION) return [range(node.content)];
    if (node.type !== NodeTypes.ELEMENT) return [];
    const own = node.props.flatMap((p) => {
      if (p.type !== NodeTypes.DIRECTIVE) return [];
      const f = p.forParseResult;
      if (f) return [f.source, f.value, f.key, f.index].filter((e) => e !== undefined).map(range);
      return p.exp ? [range(p.exp)] : [];
    });
    return [...own, ...expressions(node.children)];
  });
}

const all = [
  ...codegen.map(
    ([name, source]) => [`codegen/${name}`, source, !name.includes('_fail_')] as const,
  ),
  ...typecheck.map(
    ([name, source]) => [`typecheck/${name}`, source, !name.includes('_fail_')] as const,
  ),
  ...compiler.map(([name, source]) => {
    const { descriptor, diagnostics } = parse(source, { filename: name });
    const clean = diagnostics.length + analyzeScript(descriptor).diagnostics.length === 0;
    return [`compiler/${name}`, source, clean] as const;
  }),
];

describe.each(all)('%s', (name, source, clean) => {
  const file = generate(name, source);
  const { text, spans } = file;

  it('has sorted, non-overlapping spans within bounds', () => {
    let end = 0;
    for (const [v, vLength, o, oLength] of spans) {
      expect(v).toBeGreaterThanOrEqual(end);
      end = v + vLength;
      expect(end).toBeLessThanOrEqual(text.length);
      expect(o + oLength).toBeLessThanOrEqual(source.length);
    }
  });

  it('copies verbatim spans exactly', () => {
    for (const [v, vLength, o, oLength, kind] of spans) {
      if (kind !== SpanKind.Verbatim) continue;
      expect(vLength).toBe(oLength);
      expect(text.slice(v, v + vLength)).toBe(source.slice(o, o + oLength));
    }
  });

  it('covers the script and every emitted template expression with verbatim spans', () => {
    const covered = new Set<number>();
    for (const [, , o, oLength, kind] of spans) {
      if (kind === SpanKind.Verbatim) for (let i = o; i < o + oLength; i++) covered.add(i);
    }
    const { descriptor } = parse(source, { filename: name });
    const visible = (start: number, end: number) =>
      Array.from({ length: end - start }, (_, i) => start + i).filter((i) => source[i].trim());
    const script = descriptor.scriptSetup?.loc;
    const scriptOffsets = script ? visible(script.start.offset, script.end.offset) : [];
    expect(scriptOffsets.filter((i) => !covered.has(i))).toEqual([]);
    // An expression that is emitted at all is emitted whole; unsupported ones are not emitted.
    const partial = expressions(descriptor.template?.ast.children ?? [])
      .map(([start, end]) => visible(start, end))
      .filter(
        (offsets) => offsets.some((i) => covered.has(i)) && !offsets.every((i) => covered.has(i)),
      );
    expect(partial).toEqual([]);
  });

  it('has exactly one ANCHOR, on the default export', () => {
    const anchors = spans.filter(
      ([, , , , kind, features]) => features === Feature.Definition && kind === SpanKind.Atom,
    );
    expect(anchors).toHaveLength(1);
    const [[v, vLength, o, oLength]] = anchors;
    expect([o, oLength]).toEqual([0, 0]);
    expect(text.slice(v, v + vLength)).toMatch(/^export default /);
  });

  it('synthesizes no ts-ignore or ts-expect-error', () => {
    let synthesized = text;
    for (const [v, vLength, , , kind] of spans) {
      if (kind === SpanKind.Verbatim) {
        synthesized =
          synthesized.slice(0, v) + ' '.repeat(vLength) + synthesized.slice(v + vLength);
      }
    }
    expect(synthesized).not.toMatch(/@ts-(?:ignore|expect-error)/);
  });

  it.runIf(clean)('parses without errors', () => {
    expect(parseSync('virtual.ts', text, { lang: 'ts' }).errors).toEqual([]);
  });
});
