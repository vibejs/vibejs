export { compile } from './compile.ts';
export type { CompileOptions, CompileResult } from './compile.ts';
export { formatDiagnostic } from './diagnostics.ts';
export {
  camelize,
  capitalize,
  forEachIdentifier,
  hyphenate,
  identifiersOf,
  isAllowedGlobal,
  isSimpleHandler,
} from './expr/index.ts';
export type { Diagnostic, Position } from './diagnostics.ts';
export { compileStyle } from './style/compileStyle.ts';
export type { SourceMapV3 } from './style/compileStyle.ts';
export { analyzeScript } from './script/analyze.ts';
export type { BindingKind, ScriptAnalysis } from './script/analyze.ts';
export { parse } from './sfc/parse.ts';
export type { SFCBlock, SFCDescriptor, StyleLang } from './sfc/parse.ts';
export { ElementTypes, NodeTypes } from './template/ast.ts';
export { resolveComponentTag } from './transform/resolve.ts';
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
