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
import { invariantErrors } from '../test/invariants.ts';
import { SpanKind } from './builder.ts';
import { generate } from './generate.ts';

const range = (e: SimpleExpressionNode): [number, number] => [e.loc.start.offset, e.loc.end.offset];

const directive = (el: ElementNode, name: string) =>
  el.props.some((p) => p.type === NodeTypes.DIRECTIVE && p.name === name);

/**
 * Walked into: elements, components, outlets and fragments, and the slot templates with a static
 * name and no `v-for` directly inside a component; not a plain `<template>`. A component whose own
 * `v-slot` has a dynamic name is `'tag'`: its props are walked, its content is not.
 */
const typed = (el: ElementNode, inComponent: boolean) => {
  const slot = el.props.find((p) => p.type === NodeTypes.DIRECTIVE && p.name === 'slot');
  const name = slot?.type === NodeTypes.DIRECTIVE && slot.arg?.isStatic !== false;
  if (el.tagType === ElementTypes.TEMPLATE && slot) {
    return inComponent && name && !directive(el, 'for');
  }
  if (el.tagType === ElementTypes.COMPONENT && slot && !name) return 'tag';
  return el.tagType !== ElementTypes.ELEMENT || el.tag !== 'template';
};

/**
 * The template expressions the generator supports, as original ranges: interpolations, `v-for`,
 * and `v-show`, `v-bind`, `v-on` and `v-model` on typed elements, `v-html` and `v-text` on
 * intrinsic elements, and every `v-if`/`v-else-if`.
 */
function expressions(nodes: TemplateChildNode[], inComponent = false): [number, number][] {
  return nodes.flatMap((node): [number, number][] => {
    if (node.type === NodeTypes.INTERPOLATION) return [range(node.content)];
    if (node.type !== NodeTypes.ELEMENT) return [];
    const walked = typed(node, inComponent);
    const intrinsic = node.tagType === ElementTypes.ELEMENT && !node.tag.includes('-');
    const own = node.props.flatMap((p) => {
      if (p.type !== NodeTypes.DIRECTIVE || !p.exp?.content.trim()) return [];
      if (p.name === 'if' || p.name === 'else-if') return [range(p.exp)];
      if (!walked) return [];
      const f = p.forParseResult;
      if (f) return [f.source, f.value, f.key, f.index].filter((e) => e !== undefined).map(range);
      if (p.name === 'model' && p.arg && !p.arg.isStatic) return [];
      if (node.tagType === ElementTypes.TEMPLATE && p.name !== 'bind' && p.name !== 'slot') {
        return [];
      }
      if (p.name === 'slot') return walked === true ? [range(p.exp)] : [];
      const html = p.name === 'html' || p.name === 'text';
      return ['show', 'bind', 'on', 'model'].includes(p.name) || (html && intrinsic)
        ? [range(p.exp)]
        : [];
    });
    const inner =
      walked === true ? expressions(node.children, node.tagType === ElementTypes.COMPONENT) : [];
    return [...own, ...inner];
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

  it('keeps the span and directive invariants', () => {
    expect(invariantErrors(source, file)).toEqual([]);
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
    const missing = expressions(descriptor.template?.ast.children ?? []).filter(([start, end]) =>
      visible(start, end).some((i) => !covered.has(i)),
    );
    expect(missing).toEqual([]);
  });

  it.runIf(clean)('parses without errors', () => {
    expect(parseSync('virtual.ts', text, { lang: 'ts' }).errors).toEqual([]);
  });
});
