// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/compiler-core/src/parser.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/compiler-dom/src/parserOptions.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/compiler-core/src/utils.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Edits to re-apply on an upgrade:
// - this header; `forAliasRE`, `isAllWhitespace` and `isVPre` are copied from utils.ts, and
//   `getNamespace` from the compiler-dom parser options;
// - the options are folded to the SFC configuration: `parseMode: 'sfc'` (the tokenizer has no
//   other mode), `{{ }}` delimiters, `whitespace: 'condense'`, comments always kept, root
//   namespace HTML, the compiler-dom `isVoidTag`, `isPreTag` and `isIgnoreNewlineTag`, no
//   `isCustomElement`, `isNativeTag`, `isBuiltInComponent` or `ns`; `ParserOptions`,
//   `defaultParserOptions`, `currentOptions` and the option warnings are deleted;
// - `isComponent` is `component`, an uppercase first letter or a `.` in the tag (a hyphenated tag
//   is a custom element; core and built-in component names are plain tags);
// - deleted compat, browser and Babel code: `__COMPAT__` (v-bind .sync, the v-if/v-for and native
//   template checks, inline-template, `is` casting including `is="vue:…"`), `__BROWSER__`
//   `decodeEntities`, `createExp` with `prefixIdentifiers`, `expressionPlugins` and
//   `ExpParseMode` (expressions are plain `createSimpleExpression` nodes), `ConstantTypes`;
// - errors: `baseParse(input, onError)` reports each catalog error with its start and end
//   positions; the throwing `defaultOnError` is deleted. Each code is `VIBE1100 + <upstream
//   ordinal>`. VIBE1102 spans the attribute and is reported at its end; VIBE1123 spans the end
//   tag; VIBE1124 spans the unclosed start tag, whose end `endOpenTag` records until the element
//   closes, and is reported before the EOF close;
// - a comment's loc runs from its `<` to its `>` or the end of the file, because bogus comments
//   (`</1>`) and comments cut by the end of the file have no `<!--` and `-->`; `dirToAttr`
//   updates the `source` of the value loc it widens to the quotes;
// - `cloneLoc` is deleted, `extend` is `Object.assign`, and imports use `.ts` extensions.
import type { VibeError } from '@vibejs-org/errors'
import { decodeHTML } from 'entities/decode'
import type { Position } from '../diagnostics.ts'
import { vibeError } from '../errors.gen.ts'
import {
  type AttributeNode,
  type DirectiveNode,
  type ElementNode,
  ElementTypes,
  type ForParseResult,
  Namespaces,
  NodeTypes,
  type RootNode,
  type SimpleExpressionNode,
  type SourceLocation,
  type TemplateChildNode,
  createRoot,
  createSimpleExpression,
} from './ast.ts'
import { isVoidTag } from './tags.ts'
import {
  CharCodes,
  QuoteType,
  Sequences,
  State,
  Tokenizer,
  isWhitespace,
  toCharCodes,
} from './tokenizer.ts'

type OnError = (error: VibeError, start: Position, end: Position) => void

let currentOnError: OnError
let currentRoot: RootNode | null = null

// parser state
let currentInput = ''
let currentOpenTag: ElementNode | null = null
let currentProp: AttributeNode | DirectiveNode | null = null
let currentAttrValue = ''
let currentAttrStartIndex = -1
let currentAttrEndIndex = -1
let currentAttrDuplicate: string | null = null
let inPre = 0
let inVPre = false
let currentVPreBoundary: ElementNode | null = null
const stack: ElementNode[] = []

const tokenizer = new Tokenizer(stack, {
  onerr: emitError,

  ontext(start, end) {
    onText(getSlice(start, end), start, end)
  },

  ontextentity(char, start, end) {
    onText(char, start, end)
  },

  oninterpolation(start, end) {
    /* v8 ignore if -- @preserve upstream-defensive: the tokenizer reads no interpolation in v-pre */
    if (inVPre) {
      return onText(getSlice(start, end), start, end)
    }
    let innerStart = start + tokenizer.delimiterOpen.length
    let innerEnd = end - tokenizer.delimiterClose.length
    while (isWhitespace(currentInput.charCodeAt(innerStart))) {
      innerStart++
    }
    while (isWhitespace(currentInput.charCodeAt(innerEnd - 1))) {
      innerEnd--
    }
    let exp = getSlice(innerStart, innerEnd)
    // decode entities for backwards compat
    if (exp.includes('&')) {
      exp = decodeHTML(exp)
    }
    addNode({
      type: NodeTypes.INTERPOLATION,
      content: createSimpleExpression(exp, false, getLoc(innerStart, innerEnd)),
      loc: getLoc(start, end),
    })
  },

  onopentagname(start, end) {
    const name = getSlice(start, end)
    currentOpenTag = {
      type: NodeTypes.ELEMENT,
      tag: name,
      ns: getNamespace(name, stack[0], Namespaces.HTML),
      tagType: ElementTypes.ELEMENT, // will be refined on tag close
      props: [],
      children: [],
      loc: getLoc(start - 1, end),
    }
  },

  onopentagend(end) {
    endOpenTag(end)
  },

  onclosetag(start, end) {
    const name = getSlice(start, end)
    if (!isVoidTag(name)) {
      let found = false
      for (let i = 0; i < stack.length; i++) {
        const e = stack[i]
        if (e.tag.toLowerCase() === name.toLowerCase()) {
          found = true
          if (i > 0) {
            emitError(
              vibeError('VIBE1124', { tag: stack[0].tag }),
              stack[0].loc.start.offset,
              stack[0].loc.end.offset,
            )
          }
          for (let j = 0; j <= i; j++) {
            const el = stack.shift()!
            onCloseTag(el, end, j < i)
          }
          break
        }
      }
      if (!found) {
        emitError(
          vibeError('VIBE1123', { tag: name }),
          backTrack(start, CharCodes.Lt),
          lookAhead(end, CharCodes.Gt) + 1,
        )
      }
    }
  },

  onselfclosingtag(end) {
    const name = currentOpenTag!.tag
    currentOpenTag!.isSelfClosing = true
    endOpenTag(end)
    if (stack[0] && stack[0].tag === name) {
      onCloseTag(stack.shift()!, end)
    }
  },

  onattribname(start, end) {
    // plain attribute
    currentProp = {
      type: NodeTypes.ATTRIBUTE,
      name: getSlice(start, end),
      nameLoc: getLoc(start, end),
      value: undefined,
      loc: getLoc(start),
    }
  },

  ondirname(start, end) {
    const raw = getSlice(start, end)
    const name =
      raw === '.' || raw === ':'
        ? 'bind'
        : raw === '@'
          ? 'on'
          : raw === '#'
            ? 'slot'
            : raw.slice(2)

    if (!inVPre && name === '') {
      emitError(vibeError('VIBE1126', { name: raw }), start)
    }

    if (inVPre || name === '') {
      currentProp = {
        type: NodeTypes.ATTRIBUTE,
        name: raw,
        nameLoc: getLoc(start, end),
        value: undefined,
        loc: getLoc(start),
      }
    } else {
      currentProp = {
        type: NodeTypes.DIRECTIVE,
        name,
        rawName: raw,
        exp: undefined,
        arg: undefined,
        modifiers: raw === '.' ? [createSimpleExpression('prop')] : [],
        loc: getLoc(start),
      }
      if (name === 'pre') {
        inVPre = tokenizer.inVPre = true
        currentVPreBoundary = currentOpenTag
        // convert dirs before this one to attributes
        const props = currentOpenTag!.props
        for (let i = 0; i < props.length; i++) {
          if (props[i].type === NodeTypes.DIRECTIVE) {
            props[i] = dirToAttr(props[i] as DirectiveNode)
          }
        }
      }
    }
  },

  ondirarg(start, end) {
    if (start === end) return
    const arg = getSlice(start, end)
    if (inVPre && !isVPre(currentProp!)) {
      ;(currentProp as AttributeNode).name += arg
      setLocEnd((currentProp as AttributeNode).nameLoc, end)
    } else {
      const isStatic = arg[0] !== `[`
      ;(currentProp as DirectiveNode).arg = createSimpleExpression(
        isStatic ? arg : arg.slice(1, -1),
        isStatic,
        getLoc(start, end),
      )
    }
  },

  ondirmodifier(start, end) {
    const mod = getSlice(start, end)
    if (inVPre && !isVPre(currentProp!)) {
      ;(currentProp as AttributeNode).name += '.' + mod
      setLocEnd((currentProp as AttributeNode).nameLoc, end)
    } else if ((currentProp as DirectiveNode).name === 'slot') {
      // slot has no modifiers, special case for edge cases like
      // https://github.com/vuejs/language-tools/issues/2710
      const arg = (currentProp as DirectiveNode).arg
      if (arg) {
        ;(arg as SimpleExpressionNode).content += '.' + mod
        setLocEnd(arg.loc, end)
      }
    } else {
      const exp = createSimpleExpression(mod, true, getLoc(start, end))
      ;(currentProp as DirectiveNode).modifiers.push(exp)
    }
  },

  onattribdata(start, end) {
    currentAttrValue += getSlice(start, end)
    if (currentAttrStartIndex < 0) currentAttrStartIndex = start
    currentAttrEndIndex = end
  },

  onattribentity(char, start, end) {
    currentAttrValue += char
    if (currentAttrStartIndex < 0) currentAttrStartIndex = start
    currentAttrEndIndex = end
  },

  onattribnameend(end) {
    const start = currentProp!.loc.start.offset
    const name = getSlice(start, end)
    if (currentProp!.type === NodeTypes.DIRECTIVE) {
      currentProp!.rawName = name
    }
    // check duplicate attrs
    if (
      currentOpenTag!.props.some(
        p => (p.type === NodeTypes.DIRECTIVE ? p.rawName : p.name) === name,
      )
    ) {
      currentAttrDuplicate = name
    }
  },

  onattribend(quote, end) {
    /* v8 ignore else -- @preserve upstream-defensive: attributes end only inside an open tag */
    if (currentOpenTag && currentProp) {
      // finalize end pos
      setLocEnd(currentProp.loc, end)

      if (currentAttrDuplicate !== null) {
        emitError(
          vibeError('VIBE1102', { name: currentAttrDuplicate }),
          currentProp.loc.start.offset,
          end,
        )
      }

      if (quote !== QuoteType.NoValue) {
        if (currentProp.type === NodeTypes.ATTRIBUTE) {
          // assign value

          // condense whitespaces in class
          if (currentProp!.name === 'class') {
            currentAttrValue = condense(currentAttrValue).trim()
          }

          if (quote === QuoteType.Unquoted && !currentAttrValue) {
            emitError(vibeError('VIBE1113', { name: currentProp.name }), end)
          }

          currentProp!.value = {
            type: NodeTypes.TEXT,
            content: currentAttrValue,
            loc:
              quote === QuoteType.Unquoted
                ? getLoc(currentAttrStartIndex, currentAttrEndIndex)
                : getLoc(currentAttrStartIndex - 1, currentAttrEndIndex + 1),
          }
          if (
            tokenizer.inSFCRoot &&
            currentOpenTag.tag === 'template' &&
            currentProp.name === 'lang' &&
            currentAttrValue &&
            currentAttrValue !== 'html'
          ) {
            // SFC root template with preprocessor lang, force tokenizer to
            // RCDATA mode
            tokenizer.enterRCDATA(toCharCodes(`</template`), 0)
          }
        } else {
          // directive
          currentProp.exp = createSimpleExpression(
            currentAttrValue,
            false,
            getLoc(currentAttrStartIndex, currentAttrEndIndex),
          )
          if (currentProp.name === 'for') {
            currentProp.forParseResult = parseForExpression(currentProp.exp)
          }
        }
      }
      if (
        currentProp.type !== NodeTypes.DIRECTIVE ||
        currentProp.name !== 'pre'
      ) {
        currentOpenTag.props.push(currentProp)
      }
    }
    currentAttrValue = ''
    currentAttrStartIndex = currentAttrEndIndex = -1
    currentAttrDuplicate = null
  },

  oncomment(start, end) {
    addNode({
      type: NodeTypes.COMMENT,
      content: getSlice(start, end),
      loc: getLoc(
        backTrack(start - 1, CharCodes.Lt),
        Math.min(lookAhead(end, CharCodes.Gt) + 1, currentInput.length),
      ),
    })
  },

  onend() {
    const end = currentInput.length
    // EOF ERRORS
    if (tokenizer.state !== State.Text) {
      switch (tokenizer.state) {
        case State.BeforeTagName:
        case State.BeforeClosingTagName:
          emitError(vibeError('VIBE1105'), end)
          break
        case State.Interpolation:
        case State.InterpolationClose:
          emitError(vibeError('VIBE1125'), tokenizer.sectionStart)
          break
        case State.InCommentLike:
          if (tokenizer.currentSequence === Sequences.CdataEnd) {
            emitError(vibeError('VIBE1106'), end)
          } else {
            emitError(vibeError('VIBE1107'), end)
          }
          break
        case State.InTagName:
        case State.InSelfClosingTag:
        case State.InClosingTagName:
        case State.BeforeAttrName:
        case State.InAttrName:
        case State.InDirName:
        case State.InDirArg:
        case State.InDirDynamicArg:
        case State.InDirModifier:
        case State.AfterAttrName:
        case State.BeforeAttrValue:
        case State.InAttrValueDq: // "
        case State.InAttrValueSq: // '
        case State.InAttrValueNq:
          emitError(vibeError('VIBE1109'), end)
          break
        default:
          // console.log(tokenizer.state)
          break
      }
    }
    for (let index = 0; index < stack.length; index++) {
      emitError(
        vibeError('VIBE1124', { tag: stack[index].tag }),
        stack[index].loc.start.offset,
        stack[index].loc.end.offset,
      )
      onCloseTag(stack[index], end - 1)
    }
  },

  oncdata(start, end) {
    if ((stack[0] ? stack[0].ns : Namespaces.HTML) !== Namespaces.HTML) {
      onText(getSlice(start, end), start, end)
    } else {
      emitError(vibeError('VIBE1101'), start - 9)
    }
  },

  onprocessinginstruction(start) {
    // ignore as we do not have runtime handling for this, only check error
    if ((stack[0] ? stack[0].ns : Namespaces.HTML) === Namespaces.HTML) {
      emitError(vibeError('VIBE1121'), start - 1)
    }
  },
})

const forAliasRE: RegExp = /([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/

// This regex doesn't cover the case if key or index aliases have destructuring,
// but those do not make sense in the first place, so this works in practice.
const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
const stripParensRE = /^\(|\)$/g

function parseForExpression(
  input: SimpleExpressionNode,
): ForParseResult | undefined {
  const loc = input.loc
  const exp = input.content
  const inMatch = exp.match(forAliasRE)
  if (!inMatch) return

  const [, LHS, RHS] = inMatch

  const createAliasExpression = (content: string, offset: number) => {
    const start = loc.start.offset + offset
    const end = start + content.length
    return createSimpleExpression(content, false, getLoc(start, end))
  }

  const result: ForParseResult = {
    source: createAliasExpression(RHS.trim(), exp.indexOf(RHS, LHS.length)),
    value: undefined,
    key: undefined,
    index: undefined,
    finalized: false,
  }

  let valueContent = LHS.trim().replace(stripParensRE, '').trim()
  const trimmedOffset = LHS.indexOf(valueContent)

  const iteratorMatch = valueContent.match(forIteratorRE)
  if (iteratorMatch) {
    valueContent = valueContent.replace(forIteratorRE, '').trim()

    const keyContent = iteratorMatch[1].trim()
    let keyOffset: number | undefined
    if (keyContent) {
      keyOffset = exp.indexOf(keyContent, trimmedOffset + valueContent.length)
      result.key = createAliasExpression(keyContent, keyOffset)
    }

    if (iteratorMatch[2]) {
      const indexContent = iteratorMatch[2].trim()

      /* v8 ignore else -- @preserve upstream-defensive: a non-empty index alias is never blank */
      if (indexContent) {
        result.index = createAliasExpression(
          indexContent,
          exp.indexOf(
            indexContent,
            result.key
              ? keyOffset! + keyContent.length
              : trimmedOffset + valueContent.length,
          ),
        )
      }
    }
  }

  if (valueContent) {
    result.value = createAliasExpression(valueContent, trimmedOffset)
  }

  return result
}

function getSlice(start: number, end: number) {
  return currentInput.slice(start, end)
}

function endOpenTag(end: number) {
  if (tokenizer.inSFCRoot) {
    // in SFC mode, generate locations for root-level tags' inner content.
    currentOpenTag!.innerLoc = getLoc(end + 1, end + 1)
  }
  // the start tag's end, read by VIBE1124 until the element closes
  setLocEnd(
    currentOpenTag!.loc,
    currentInput.charCodeAt(end) === CharCodes.Gt ? end + 1 : end,
  )
  addNode(currentOpenTag!)
  const { tag, ns } = currentOpenTag!
  if (ns === Namespaces.HTML && isPreTag(tag)) {
    inPre++
  }
  if (isVoidTag(tag)) {
    onCloseTag(currentOpenTag!, end)
  } else {
    stack.unshift(currentOpenTag!)
    if (ns === Namespaces.SVG || ns === Namespaces.MATH_ML) {
      tokenizer.inXML = true
    }
  }
  currentOpenTag = null
}

function onText(content: string, start: number, end: number) {
  const parent = stack[0] || currentRoot
  const lastNode = parent.children[parent.children.length - 1]
  if (lastNode && lastNode.type === NodeTypes.TEXT) {
    // merge
    lastNode.content += content
    setLocEnd(lastNode.loc, end)
  } else {
    parent.children.push({
      type: NodeTypes.TEXT,
      content,
      loc: getLoc(start, end),
    })
  }
}

function onCloseTag(el: ElementNode, end: number, isImplied = false) {
  // attach end position
  if (isImplied) {
    // implied close, end should be backtracked to close
    setLocEnd(el.loc, backTrack(end, CharCodes.Lt))
  } else {
    setLocEnd(el.loc, lookAhead(end, CharCodes.Gt) + 1)
  }

  if (tokenizer.inSFCRoot) {
    // SFC root tag, resolve inner end
    if (el.children.length) {
      el.innerLoc!.end = Object.assign(
        {},
        el.children[el.children.length - 1].loc.end,
      )
    } else {
      el.innerLoc!.end = Object.assign({}, el.innerLoc!.start)
    }
    el.innerLoc!.source = getSlice(
      el.innerLoc!.start.offset,
      el.innerLoc!.end.offset,
    )
  }

  // refine element type
  const { tag, ns, children } = el
  if (!inVPre) {
    if (tag === 'slot') {
      el.tagType = ElementTypes.SLOT
    } else if (isFragmentTemplate(el)) {
      el.tagType = ElementTypes.TEMPLATE
    } else if (isComponent(el)) {
      el.tagType = ElementTypes.COMPONENT
    }
  }

  // whitespace management
  if (!tokenizer.inRCDATA) {
    el.children = condenseWhitespace(children)
  }

  if (ns === Namespaces.HTML && isIgnoreNewlineTag(tag)) {
    // remove leading newline for <textarea> and <pre> per html spec
    // https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inbody
    const first = children[0]
    if (first && first.type === NodeTypes.TEXT) {
      first.content = first.content.replace(/^\r?\n/, '')
    }
  }

  if (ns === Namespaces.HTML && isPreTag(tag)) {
    inPre--
  }
  if (currentVPreBoundary === el) {
    inVPre = tokenizer.inVPre = false
    currentVPreBoundary = null
  }
  if (
    tokenizer.inXML &&
    (stack[0] ? stack[0].ns : Namespaces.HTML) === Namespaces.HTML
  ) {
    tokenizer.inXML = false
  }
}

function lookAhead(index: number, c: number) {
  let i = index
  while (currentInput.charCodeAt(i) !== c && i < currentInput.length - 1) i++
  return i
}

function backTrack(index: number, c: number) {
  let i = index
  while (currentInput.charCodeAt(i) !== c && i >= 0) i--
  return i
}

const specialTemplateDir = new Set(['if', 'else', 'else-if', 'for', 'slot'])
function isFragmentTemplate({ tag, props }: ElementNode): boolean {
  if (tag === 'template') {
    for (let i = 0; i < props.length; i++) {
      if (
        props[i].type === NodeTypes.DIRECTIVE &&
        specialTemplateDir.has((props[i] as DirectiveNode).name)
      ) {
        return true
      }
    }
  }
  return false
}

function isComponent({ tag }: ElementNode): boolean {
  return (
    tag === 'component' || isUpperCase(tag.charCodeAt(0)) || tag.includes('.')
  )
}

function isUpperCase(c: number) {
  return c > 64 && c < 91
}

function isPreTag(tag: string) {
  return tag === 'pre'
}

function isIgnoreNewlineTag(tag: string) {
  return tag === 'pre' || tag === 'textarea'
}

function isVPre(p: ElementNode['props'][0]): p is DirectiveNode {
  return p.type === NodeTypes.DIRECTIVE && p.name === 'pre'
}

function isAllWhitespace(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (!isWhitespace(str.charCodeAt(i))) {
      return false
    }
  }
  return true
}

// https://html.spec.whatwg.org/multipage/parsing.html#tree-construction-dispatcher
function getNamespace(
  tag: string,
  parent: ElementNode | undefined,
  rootNamespace: Namespaces,
): Namespaces {
  let ns = parent ? parent.ns : rootNamespace
  if (parent && ns === Namespaces.MATH_ML) {
    if (parent.tag === 'annotation-xml') {
      if (tag === 'svg') {
        return Namespaces.SVG
      }
      if (
        parent.props.some(
          a =>
            a.type === NodeTypes.ATTRIBUTE &&
            a.name === 'encoding' &&
            a.value != null &&
            (a.value.content === 'text/html' ||
              a.value.content === 'application/xhtml+xml'),
        )
      ) {
        ns = Namespaces.HTML
      }
    } else if (
      /^m(?:[ions]|text)$/.test(parent.tag) &&
      tag !== 'mglyph' &&
      tag !== 'malignmark'
    ) {
      ns = Namespaces.HTML
    }
  } else if (parent && ns === Namespaces.SVG) {
    if (
      parent.tag === 'foreignObject' ||
      parent.tag === 'desc' ||
      parent.tag === 'title'
    ) {
      ns = Namespaces.HTML
    }
  }

  if (ns === Namespaces.HTML) {
    if (tag === 'svg') {
      return Namespaces.SVG
    }
    if (tag === 'math') {
      return Namespaces.MATH_ML
    }
  }
  return ns
}

const windowsNewlineRE = /\r\n/g
function condenseWhitespace(nodes: TemplateChildNode[]): TemplateChildNode[] {
  let removedWhitespace = false
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.type === NodeTypes.TEXT) {
      if (!inPre) {
        if (isAllWhitespace(node.content)) {
          const prev = nodes[i - 1] && nodes[i - 1].type
          const next = nodes[i + 1] && nodes[i + 1].type
          // Remove if:
          // - the whitespace is the first or last node, or:
          // - (condense mode) the whitespace is between two comments, or:
          // - (condense mode) the whitespace is between comment and element, or:
          // - (condense mode) the whitespace is between two elements AND contains newline
          if (
            !prev ||
            !next ||
            (prev === NodeTypes.COMMENT &&
              (next === NodeTypes.COMMENT || next === NodeTypes.ELEMENT)) ||
            (prev === NodeTypes.ELEMENT &&
              (next === NodeTypes.COMMENT ||
                (next === NodeTypes.ELEMENT && hasNewlineChar(node.content))))
          ) {
            removedWhitespace = true
            nodes[i] = null as any
          } else {
            // Otherwise, the whitespace is condensed into a single space
            node.content = ' '
          }
        } else {
          // in condense mode, consecutive whitespaces in text are condensed
          // down to a single space.
          node.content = condense(node.content)
        }
      } else {
        // #6410 normalize windows newlines in <pre>:
        // in SSR, browsers normalize server-rendered \r\n into a single \n
        // in the DOM
        node.content = node.content.replace(windowsNewlineRE, '\n')
      }
    }
  }
  return removedWhitespace ? nodes.filter(Boolean) : nodes
}

function hasNewlineChar(str: string) {
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    if (c === CharCodes.NewLine || c === CharCodes.CarriageReturn) {
      return true
    }
  }
  return false
}

function condense(str: string) {
  let ret = ''
  let prevCharIsWhitespace = false
  for (let i = 0; i < str.length; i++) {
    if (isWhitespace(str.charCodeAt(i))) {
      if (!prevCharIsWhitespace) {
        ret += ' '
        prevCharIsWhitespace = true
      }
    } else {
      ret += str[i]
      prevCharIsWhitespace = false
    }
  }
  return ret
}

function addNode(node: TemplateChildNode) {
  ;(stack[0] || currentRoot).children.push(node)
}

function getLoc(start: number, end?: number): SourceLocation {
  return {
    start: tokenizer.getPos(start),
    // @ts-expect-error allow late attachment
    end: end == null ? end : tokenizer.getPos(end),
    // @ts-expect-error allow late attachment
    source: end == null ? end : getSlice(start, end),
  }
}

function setLocEnd(loc: SourceLocation, end: number) {
  loc.end = tokenizer.getPos(end)
  loc.source = getSlice(loc.start.offset, end)
}

function dirToAttr(dir: DirectiveNode): AttributeNode {
  const attr: AttributeNode = {
    type: NodeTypes.ATTRIBUTE,
    name: dir.rawName!,
    nameLoc: getLoc(
      dir.loc.start.offset,
      dir.loc.start.offset + dir.rawName!.length,
    ),
    value: undefined,
    loc: dir.loc,
  }
  if (dir.exp) {
    // account for quotes
    const loc = dir.exp.loc
    if (loc.end.offset < dir.loc.end.offset) {
      loc.start.offset--
      loc.start.column--
      loc.end.offset++
      loc.end.column++
      loc.source = getSlice(loc.start.offset, loc.end.offset)
    }
    attr.value = {
      type: NodeTypes.TEXT,
      content: (dir.exp as SimpleExpressionNode).content,
      loc,
    }
  }
  return attr
}

function emitError(error: VibeError, index: number, end: number = index) {
  currentOnError(error, tokenizer.getPos(index), tokenizer.getPos(end))
}

function reset() {
  tokenizer.reset()
  currentOpenTag = null
  currentProp = null
  currentAttrValue = ''
  currentAttrStartIndex = -1
  currentAttrEndIndex = -1
  currentAttrDuplicate = null
  stack.length = 0
}

export function baseParse(input: string, onError: OnError): RootNode {
  reset()
  currentInput = input
  currentOnError = onError

  tokenizer.inXML = false

  const root = (currentRoot = createRoot([], input))
  tokenizer.parse(currentInput)
  root.loc = getLoc(0, input.length)
  root.children = condenseWhitespace(root.children)
  currentRoot = null
  return root
}
