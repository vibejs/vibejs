import {
  analyzeScript,
  ElementTypes,
  NodeTypes,
  type ElementNode,
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

const directive = (el: ElementNode, name: string) =>
  el.props.some((p) => p.type === NodeTypes.DIRECTIVE && p.name === name);

/** Walked into: elements, components and fragments; not slots, slot wrappers or the file's own tag. */
const typed = (el: ElementNode, self: string) =>
  el.tagType === ElementTypes.TEMPLATE
    ? !directive(el, 'slot')
    : el.tagType !== ElementTypes.SLOT && el.tag !== 'template' && el.tag !== self;

/**
 * The template expressions the generator supports, as original ranges: interpolations, `v-for`,
 * and `v-show`, `v-bind`, `v-on` and `v-model` on typed elements, `v-html` and `v-text` on
 * intrinsic elements, and every `v-if`/`v-else-if`.
 */
function expressions(nodes: TemplateChildNode[], self: string): [number, number][] {
  return nodes.flatMap((node): [number, number][] => {
    if (node.type === NodeTypes.INTERPOLATION) return [range(node.content)];
    if (node.type !== NodeTypes.ELEMENT) return [];
    const walked = typed(node, self);
    const intrinsic = node.tagType === ElementTypes.ELEMENT && !node.tag.includes('-');
    const own = node.props.flatMap((p) => {
      if (p.type !== NodeTypes.DIRECTIVE || !p.exp?.content.trim()) return [];
      if (p.name === 'if' || p.name === 'else-if') return [range(p.exp)];
      if (!walked) return [];
      const f = p.forParseResult;
      if (f) return [f.source, f.value, f.key, f.index].filter((e) => e !== undefined).map(range);
      if (p.name === 'model' && p.arg && !p.arg.isStatic) return [];
      if (node.tagType === ElementTypes.TEMPLATE && p.name !== 'bind') return [];
      const html = p.name === 'html' || p.name === 'text';
      return ['show', 'bind', 'on', 'model'].includes(p.name) || (html && intrinsic)
        ? [range(p.exp)]
        : [];
    });
    // The children of a component with `v-slot` read slot props.
    const inner = walked && !(node.tagType === ElementTypes.COMPONENT && directive(node, 'slot'));
    return inner ? [...own, ...expressions(node.children, self)] : own;
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
    const self = /[^/]*$/.exec(name)![0].replace(/\.vibe$/, '');
    const missing = expressions(descriptor.template?.ast.children ?? [], self).filter(
      ([start, end]) => visible(start, end).some((i) => !covered.has(i)),
    );
    expect(missing).toEqual([]);
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
