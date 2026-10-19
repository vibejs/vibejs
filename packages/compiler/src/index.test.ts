import * as compiler from '@vibejs-org/compiler';
import {
  ElementTypes,
  NodeTypes,
  parse,
  type AttributeNode,
  type DirectiveNode,
  type ElementNode,
  type RootNode,
  type SimpleExpressionNode,
  type SourceLocation,
  type TemplateChildNode,
} from '@vibejs-org/compiler';
import { describe, expect, it } from 'vitest';
import { fixtures, objects } from '../test/walk.ts';
import { formatDiagnostic } from './diagnostics.ts';

type TemplateNode =
  | RootNode
  | TemplateChildNode
  | AttributeNode
  | DirectiveNode
  | SimpleExpressionNode;

describe('@vibejs-org/compiler', () => {
  it('exports formatDiagnostic, parse, NodeTypes and ElementTypes at runtime', () => {
    expect(Object.keys(compiler).toSorted()).toStrictEqual([
      'ElementTypes',
      'NodeTypes',
      'formatDiagnostic',
      'parse',
    ]);
    expect(compiler.formatDiagnostic).toBe(formatDiagnostic);
  });

  it('gives language tools what they walk in a template', () => {
    const source = fixtures.find(([name]) => name === 'sfc/tooling')![1];
    const { descriptor, diagnostics } = parse(source, { filename: 'Todos.vibe' });
    expect(diagnostics).toStrictEqual([]);
    const all = [...objects(descriptor.template!.ast)].filter(
      (n): n is TemplateNode => 'type' in n,
    );
    const at = (node: { loc: SourceLocation } | undefined) =>
      source.slice(node!.loc.start.offset, node!.loc.end.offset);

    expect(all.find((n) => n.type === NodeTypes.COMMENT)).toMatchObject({
      content: ' @vibe-expect-error ',
    });

    const elements = all.filter((n): n is ElementNode => n.type === NodeTypes.ELEMENT);
    expect(elements.map((e) => [e.tag, e.tagType])).toStrictEqual([
      ['ul', ElementTypes.ELEMENT],
      ['TodoItem', ElementTypes.COMPONENT],
      ['todo-counter', ElementTypes.ELEMENT],
    ]);

    const directives = all.filter((n): n is DirectiveNode => n.type === NodeTypes.DIRECTIVE);
    const {
      source: list,
      value,
      key,
      index,
    } = directives.find((d) => d.name === 'for')!.forParseResult!;
    expect([list, value, key, index].map(at)).toStrictEqual(['todos', 'todo', 'id', 'index']);

    const on = directives.find((d) => d.name === 'on')!;
    expect([on.arg, ...on.modifiers].map(at)).toStrictEqual(['remove', 'stop', 'prevent']);
    const bind = directives.find((d) => d.rawName === ':todo.camel')!;
    expect([bind.arg, ...bind.modifiers].map(at)).toStrictEqual(['todo', 'camel']);
  });
});
