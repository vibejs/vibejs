import { expectTypeOf } from 'vitest';
import type {
  AttributeNode,
  CommentNode,
  Diagnostic,
  DirectiveNode,
  ElementNode,
  ElementTypes,
  ForParseResult,
  InterpolationNode,
  NodeTypes,
  Position,
  RootNode,
  SFCBlock,
  SFCDescriptor,
  SimpleExpressionNode,
  SourceLocation,
  SourceMapV3,
  StyleLang,
  TemplateChildNode,
  TextNode,
  compileStyle,
  parse,
} from './index.ts';

expectTypeOf<SourceLocation>().toEqualTypeOf<{ start: Position; end: Position; source: string }>();
expectTypeOf<SFCBlock>().toEqualTypeOf<{
  content: string;
  loc: SourceLocation;
  attrs: Record<string, string | true>;
}>();
expectTypeOf<StyleLang>().toEqualTypeOf<
  'css' | 'scss' | 'sass' | 'less' | 'styl' | 'stylus' | 'postcss'
>();
expectTypeOf<SFCDescriptor['template']>().toEqualTypeOf<(SFCBlock & { ast: RootNode }) | null>();
expectTypeOf<SFCDescriptor['scriptSetup']>().toEqualTypeOf<SFCBlock | null>();
expectTypeOf<NonNullable<SFCDescriptor['scriptSetup']>>().not.toHaveProperty('generic');
expectTypeOf<SFCDescriptor['styles'][number]>().toEqualTypeOf<
  SFCBlock & { scoped: boolean; lang: StyleLang }
>();
expectTypeOf<typeof parse>().toEqualTypeOf<
  (
    source: string,
    options: { filename: string },
  ) => { descriptor: SFCDescriptor; diagnostics: Diagnostic[] }
>();

expectTypeOf<NodeTypes>().toEqualTypeOf<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7>();
expectTypeOf<ElementTypes>().toEqualTypeOf<0 | 1 | 2 | 3>();
expectTypeOf<TemplateChildNode>().toEqualTypeOf<
  ElementNode | InterpolationNode | TextNode | CommentNode
>();
expectTypeOf<RootNode['children']>().toEqualTypeOf<TemplateChildNode[]>();
expectTypeOf<ElementNode['props']>().toEqualTypeOf<(AttributeNode | DirectiveNode)[]>();
expectTypeOf<ElementNode>().toHaveProperty('innerLoc').toEqualTypeOf<SourceLocation | undefined>();
expectTypeOf<ElementNode['tagType']>().toEqualTypeOf<ElementTypes>();
expectTypeOf<SimpleExpressionNode>().toEqualTypeOf<{
  type: 4;
  content: string;
  isStatic: boolean;
  loc: SourceLocation;
}>();
expectTypeOf<ForParseResult>().toEqualTypeOf<{
  source: SimpleExpressionNode;
  value?: SimpleExpressionNode;
  key?: SimpleExpressionNode;
  index?: SimpleExpressionNode;
  finalized: boolean;
}>();
expectTypeOf<DirectiveNode>().toEqualTypeOf<{
  type: 7;
  name: string;
  rawName?: string;
  exp?: SimpleExpressionNode;
  arg?: SimpleExpressionNode;
  modifiers: SimpleExpressionNode[];
  forParseResult?: ForParseResult;
  loc: SourceLocation;
}>();
expectTypeOf<InterpolationNode['content']>().toEqualTypeOf<SimpleExpressionNode>();
expectTypeOf<AttributeNode['value']>().toEqualTypeOf<TextNode | undefined>();
expectTypeOf<CommentNode['content']>().toEqualTypeOf<string>();

// The signature and map shape of the CV6 spec.
interface SpecSourceMapV3 {
  version: 3;
  file?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string;
}

expectTypeOf<SourceMapV3>().toEqualTypeOf<SpecSourceMapV3>();
expectTypeOf<typeof compileStyle>().toEqualTypeOf<
  (
    css: string,
    options: { filename: string; id: string },
  ) => { code: string; map: SourceMapV3 | null; diagnostics: Diagnostic[] }
>();
