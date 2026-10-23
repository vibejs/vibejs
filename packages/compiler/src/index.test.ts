import * as compiler from '@usevibejs/compiler';
import {
  analyzeScript,
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
} from '@usevibejs/compiler';
import { describe, expect, it } from 'vitest';
import { fixtures, objects } from '../test/walk.ts';
import { formatDiagnostic } from './diagnostics.ts';
import { compileStyle } from './style/compileStyle.ts';
import { resolveComponentTag } from './transform/resolve.ts';

type TemplateNode =
  | RootNode
  | TemplateChildNode
  | AttributeNode
  | DirectiveNode
  | SimpleExpressionNode;

describe('@usevibejs/compiler', () => {
  it('exports compile, formatDiagnostic, compileStyle, parse, analyzeScript, the AST enums, the expression helpers and resolveComponentTag at runtime', () => {
    expect(Object.keys(compiler).toSorted()).toStrictEqual([
      'ElementTypes',
      'NodeTypes',
      'analyzeScript',
      'camelize',
      'capitalize',
      'compile',
      'compileStyle',
      'forEachIdentifier',
      'formatDiagnostic',
      'hyphenate',
      'identifiersOf',
      'isAllowedGlobal',
      'isSimpleHandler',
      'parse',
      'resolveComponentTag',
    ]);
    expect(compiler.formatDiagnostic).toBe(formatDiagnostic);
    expect(compiler.resolveComponentTag).toBe(resolveComponentTag);
    expect(compiler.compileStyle).toBe(compileStyle);
  });

  it('scopes CSS through the package entry', () => {
    const { code } = compiler.compileStyle('.a {}', { filename: 'A.vibe', id: '7a1c2e3f' });
    expect(code).toBe('.a[data-vb-7a1c2e3f] {}');
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

  it('analyzes a full script for language tools', () => {
    const source = fixtures.find(([name]) => name === 'script/full')![1];
    const { descriptor } = parse(source, { filename: 'ItemList.vibe' });
    const a = analyzeScript(descriptor);
    const at = ([start, end]: [number, number]) => {
      expect(0 <= start && start <= end && end <= source.length).toBe(true);
      return source.slice(start, end);
    };
    expect(a.diagnostics).toStrictEqual([]);
    expect([...a.bindings].map(([name, b]) => [name, b.kind, at(b.decl)])).toStrictEqual([
      ['computed', 'import', 'computed'],
      ['ref', 'import', 'ref'],
      ['useTemplateRef', 'import', 'useTemplateRef'],
      ['Child', 'import', 'Child'],
      ['title', 'prop', 'title'],
      ['items', 'prop', 'items'],
      ['variant', 'prop-alias', 'variant'],
      ['emit', 'const', 'emit'],
      ['slots', 'const', 'slots'],
      ['query', 'maybe-ref', 'query'],
      ['queryModifiers', 'maybe-ref', 'queryModifiers'],
      ['checked', 'maybe-ref', 'checked'],
      ['clicks', 'let', 'clicks'],
      ['label', 'maybe-ref', 'label'],
      ['list', 'maybe-ref', 'list'],
      ['input', 'maybe-ref', 'input'],
      ['pick', 'const', 'pick'],
    ]);
    expect(a.propKeys.map((k) => [k.name, at(k.decl)])).toStrictEqual([
      ['title', 'title'],
      ['items', 'items'],
      ['size', 'size'],
      ['query', "'query'"],
      ['queryModifiers', "'query'"],
      ['modelValue', 'defineModel'],
      ['modelValueModifiers', 'defineModel'],
    ]);
    const { props, emits, slots, models, expose } = a.macros;
    expect([props, emits, slots].map((m) => at(m!.typeArg))).toStrictEqual([
      'Props',
      '{ pick: [id: number]; close: [] }',
      '{ default?: (props: { item: Item }) => unknown }',
    ]);
    expect(models).toStrictEqual([
      { name: 'query', binding: 'query', required: false },
      { name: 'modelValue', binding: 'checked', required: true },
    ]);
    expect(source.slice(expose!.callStart).startsWith('defineExpose(')).toBe(true);
    expect(
      a.templateRefs.map((r) => [
        r.key,
        at(r.keyLoc),
        r.typeArgInsertAt === null ? null : source.slice(r.typeArgInsertAt, r.typeArgInsertAt + 2),
      ]),
    ).toStrictEqual([
      ['list', "'list'", null],
      ['input', "'input'", "('"],
    ]);
    expect(a.importRanges.map(at)).toStrictEqual([
      "import { computed, ref, useTemplateRef } from '@usevibejs/ui';",
      "import type { Item } from './types';",
      "import Child from './Child.vibe';",
    ]);
  });
});
