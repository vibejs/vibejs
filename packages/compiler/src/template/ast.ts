// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/compiler-core/src/ast.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Only the template node part. Edits to re-apply on an upgrade:
// - this header; `Position` is the compiler's own (`../diagnostics.ts`);
// - `Namespaces`, `NodeTypes` and `ElementTypes` are `as const` objects plus same-name union
//   types (erasableSyntaxOnly), with upstream's numeric values; `NodeTypes` keeps only the parse
//   node types, `ElementNode.ns` is `Namespaces` and the `Namespace` alias is dropped;
// - codegen and transform nodes and fields are removed: compound, if, for, text call, VNode, JS*
//   and cache nodes, `ConstantTypes`, `codegenNode`, `ssrCodegenNode`, `constType`, `hoisted`,
//   `identifiers`, `isHandlerKey`, `ast`, and the root's helper, hoist and import fields;
// - `ElementNode` is one interface (its per-tagType variants differed only in codegen fields);
// - `exp`, `arg`, `value`, `key` and `index` are optional keys; only `createRoot`,
//   `createSimpleExpression` and a module-local `locStub` are kept, with explicit return types.
import type { Position } from '../diagnostics.ts'

export const Namespaces = {
  HTML: 0,
  SVG: 1,
  MATH_ML: 2,
} as const
export type Namespaces = (typeof Namespaces)[keyof typeof Namespaces]

export const NodeTypes = {
  ROOT: 0,
  ELEMENT: 1,
  TEXT: 2,
  COMMENT: 3,
  SIMPLE_EXPRESSION: 4,
  INTERPOLATION: 5,
  ATTRIBUTE: 6,
  DIRECTIVE: 7,
} as const
export type NodeTypes = (typeof NodeTypes)[keyof typeof NodeTypes]

export const ElementTypes = {
  ELEMENT: 0,
  COMPONENT: 1,
  SLOT: 2,
  TEMPLATE: 3,
} as const
export type ElementTypes = (typeof ElementTypes)[keyof typeof ElementTypes]

interface Node {
  type: NodeTypes
  loc: SourceLocation
}

// The node's range. The `start` is inclusive and `end` is exclusive.
// [start, end)
export interface SourceLocation {
  start: Position
  end: Position
  source: string
}

export type TemplateChildNode =
  | ElementNode
  | InterpolationNode
  | TextNode
  | CommentNode

export interface RootNode extends Node {
  type: typeof NodeTypes.ROOT
  source: string
  children: TemplateChildNode[]
}

export interface ElementNode extends Node {
  type: typeof NodeTypes.ELEMENT
  ns: Namespaces
  tag: string
  tagType: ElementTypes
  props: Array<AttributeNode | DirectiveNode>
  children: TemplateChildNode[]
  isSelfClosing?: boolean
  innerLoc?: SourceLocation // only for SFC root level elements
}

export interface TextNode extends Node {
  type: typeof NodeTypes.TEXT
  content: string
}

export interface CommentNode extends Node {
  type: typeof NodeTypes.COMMENT
  content: string
}

export interface AttributeNode extends Node {
  type: typeof NodeTypes.ATTRIBUTE
  name: string
  nameLoc: SourceLocation
  value?: TextNode
}

export interface DirectiveNode extends Node {
  type: typeof NodeTypes.DIRECTIVE
  /**
   * the normalized name without prefix or shorthands, e.g. "bind", "on"
   */
  name: string
  /**
   * the raw attribute name, preserving shorthand, and including arg & modifiers
   * this is only used during parse.
   */
  rawName?: string
  exp?: SimpleExpressionNode
  arg?: SimpleExpressionNode
  modifiers: SimpleExpressionNode[]
  /**
   * optional property to cache the expression parse result for v-for
   */
  forParseResult?: ForParseResult
}

export interface SimpleExpressionNode extends Node {
  type: typeof NodeTypes.SIMPLE_EXPRESSION
  content: string
  isStatic: boolean
}

export interface InterpolationNode extends Node {
  type: typeof NodeTypes.INTERPOLATION
  content: SimpleExpressionNode
}

export interface ForParseResult {
  source: SimpleExpressionNode
  value?: SimpleExpressionNode
  key?: SimpleExpressionNode
  index?: SimpleExpressionNode
  finalized: boolean
}

const locStub: SourceLocation = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
  source: '',
}

export function createRoot(
  children: TemplateChildNode[],
  source = '',
): RootNode {
  return {
    type: NodeTypes.ROOT,
    source,
    children,
    loc: locStub,
  }
}

export function createSimpleExpression(
  content: SimpleExpressionNode['content'],
  isStatic: SimpleExpressionNode['isStatic'] = false,
  loc: SourceLocation = locStub,
): SimpleExpressionNode {
  return {
    type: NodeTypes.SIMPLE_EXPRESSION,
    loc,
    content,
    isStatic,
  }
}
