import { expectTypeOf } from 'vitest';
import type {
  analyzeScript,
  AttributeNode,
  BindingKind,
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
  ScriptAnalysis,
  SFCBlock,
  SFCDescriptor,
  SimpleExpressionNode,
  SourceLocation,
  SourceMapV3,
  StyleLang,
  TemplateChildNode,
  TextNode,
  camelize,
  capitalize,
  compileStyle,
  forEachIdentifier,
  hyphenate,
  isAllowedGlobal,
  isSimpleHandler,
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

expectTypeOf<typeof forEachIdentifier>().toEqualTypeOf<
  (
    expr: string,
    offset: number,
    cb: (
      name: string,
      start: number,
      end: number,
      info: { local: boolean; writeRoot: boolean },
    ) => void,
  ) => void
>();
expectTypeOf<typeof isAllowedGlobal>().toEqualTypeOf<(name: string) => boolean>();
expectTypeOf<typeof isSimpleHandler>().toEqualTypeOf<(expr: string) => boolean>();
expectTypeOf<typeof camelize>().toEqualTypeOf<(s: string) => string>();
expectTypeOf<typeof hyphenate>().toEqualTypeOf<(s: string) => string>();
expectTypeOf<typeof capitalize>().toEqualTypeOf<(s: string) => string>();

// The analysis of C5.
interface C5ScriptAnalysis {
  bindings: Map<
    string,
    {
      kind: 'prop' | 'prop-alias' | 'const' | 'maybe-ref' | 'let' | 'import';
      decl: [number, number];
    }
  >;
  propKeys: { name: string; decl: [number, number] }[];
  macros: {
    props?: { typeArg: [number, number] };
    emits?: { typeArg: [number, number] };
    slots?: { typeArg: [number, number] };
    models: { name: string; binding: string; required: boolean }[];
    expose?: { callStart: number };
  };
  templateRefs: { key: string; keyLoc: [number, number]; typeArgInsertAt: number | null }[];
  importRanges: [number, number][];
  diagnostics: Diagnostic[];
}

expectTypeOf<ScriptAnalysis>().toEqualTypeOf<C5ScriptAnalysis>();
expectTypeOf<C5ScriptAnalysis>().toExtend<ScriptAnalysis>();
expectTypeOf<ScriptAnalysis>().toExtend<C5ScriptAnalysis>();
expectTypeOf<BindingKind>().toEqualTypeOf<
  'prop' | 'prop-alias' | 'const' | 'maybe-ref' | 'let' | 'import'
>();
expectTypeOf<typeof analyzeScript>().toEqualTypeOf<(d: SFCDescriptor) => ScriptAnalysis>();
