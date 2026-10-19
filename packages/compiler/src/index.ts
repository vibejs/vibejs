export { formatDiagnostic } from './diagnostics.ts';
export type { Diagnostic, Position } from './diagnostics.ts';
export { compileStyle } from './style/compileStyle.ts';
export type { SourceMapV3 } from './style/compileStyle.ts';
export { parse } from './sfc/parse.ts';
export type { SFCBlock, SFCDescriptor, StyleLang } from './sfc/parse.ts';
export { ElementTypes, NodeTypes } from './template/ast.ts';
export type {
  AttributeNode,
  CommentNode,
  DirectiveNode,
  ElementNode,
  ForParseResult,
  InterpolationNode,
  RootNode,
  SimpleExpressionNode,
  SourceLocation,
  TemplateChildNode,
  TextNode,
} from './template/ast.ts';
