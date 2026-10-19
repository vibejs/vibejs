// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/compiler-core/__tests__/parse.spec.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Edits: error codes are VIBE strings (`VIBE1100 + <upstream ordinal>`); `constType` and
// `codegenNode` are dropped from the expected nodes; the `baseParse` below wraps the input in an
// unclosed `<template>` (the fork parses SFC files only) and shifts the locations back, so the
// upstream positions hold; `parseMode: 'sfc'` cases parse the input as a whole file. The Errors
// table checks codes and start positions without the upstream AST snapshots.
//
// Dropped cases, by category:
// - deleted options: custom delimiters, `comments: false` (comments option, and the second half
//   of comments in <pre>), `isNativeTag`, `isCustomElement`, `isBuiltInComponent`, `isVoidTag`
//   and `isPreTag` arguments (the HTML defaults apply), whitespace `preserve` (whole describe);
// - deleted compat: `is="vue:…"` casting with and without `isNativeTag`;
// - deleted browser and Babel code: the non-browser `decodeEntities` warning, expression parsing
//   (whole describe: interpolation, v-bind, v-on statements, v-slot and v-for ASTs);
// - commented-out upstream patterns of codes that the parser never emits.
import { describe, expect, test, vi } from 'vitest';
import type { Position } from '../diagnostics.ts';
import {
  type AttributeNode,
  type CommentNode,
  type DirectiveNode,
  type ElementNode,
  ElementTypes,
  type InterpolationNode,
  Namespaces,
  NodeTypes,
  type RootNode,
  type TextNode,
} from './ast.ts';
import { baseParse as parseFile } from './parser.ts';

interface ParseError {
  code: string;
  loc: { start: Position; end: Position };
}

const WRAPPER = '<template>';

/** Parses `input` as template content, or as a whole file with `parseMode: 'sfc'`. */
function baseParse(
  input: string,
  options: { parseMode?: 'sfc'; onError?: (error: ParseError) => void } = {},
): RootNode {
  const errors: ParseError[] = [];
  const report = (error: ParseError) => {
    errors.push(error);
  };
  if (options.parseMode === 'sfc') {
    const root = parseFile(input, (error, start, end) =>
      report({ code: error.code, loc: { start, end } }),
    );
    errors.forEach((e) => options.onError?.(e));
    return root;
  }
  const root = parseFile(WRAPPER + input, (error, start, end) => {
    // the wrapper's own missing end tag
    if (start.offset > 0) report({ code: error.code, loc: { start, end } });
  });
  const seen = new WeakSet<object>();
  const shift = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) return;
    seen.add(value);
    if ('offset' in value && 'line' in value && 'column' in value) {
      const pos = value as Position;
      if (pos.line === 1) pos.column -= WRAPPER.length;
      pos.offset -= WRAPPER.length;
      return;
    }
    for (const v of Object.values(value)) shift(v);
  };
  const { children } = root.children[0] as ElementNode;
  shift(children);
  shift(errors);
  errors.forEach((e) => options.onError?.(e));
  return {
    type: NodeTypes.ROOT,
    source: input,
    children,
    loc: {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: input.length, line: 1, column: input.length + 1 },
      source: input,
    },
  };
}

describe('compiler: parse', () => {
  describe('Text', () => {
    test('simple text', () => {
      const ast = baseParse('some text');
      const text = ast.children[0] as TextNode;

      expect(text).toStrictEqual({
        type: NodeTypes.TEXT,
        content: 'some text',
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 9, line: 1, column: 10 },
          source: 'some text',
        },
      });
    });

    test('simple text with invalid end tag', () => {
      const onError = vi.fn();
      const ast = baseParse('some text</div>', { onError });
      const text = ast.children[0] as TextNode;

      expect(onError.mock.calls).toMatchObject([
        [
          {
            code: 'VIBE1123',
            loc: {
              start: { column: 10, line: 1, offset: 9 },
              end: { column: 16, line: 1, offset: 15 },
            },
          },
        ],
      ]);

      expect(text).toStrictEqual({
        type: NodeTypes.TEXT,
        content: 'some text',
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 9, line: 1, column: 10 },
          source: 'some text',
        },
      });
    });

    test('text with interpolation', () => {
      const ast = baseParse('some {{ foo + bar }} text');
      const text1 = ast.children[0] as TextNode;
      const text2 = ast.children[2] as TextNode;

      expect(text1).toStrictEqual({
        type: NodeTypes.TEXT,
        content: 'some ',
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 5, line: 1, column: 6 },
          source: 'some ',
        },
      });
      expect(text2).toStrictEqual({
        type: NodeTypes.TEXT,
        content: ' text',
        loc: {
          start: { offset: 20, line: 1, column: 21 },
          end: { offset: 25, line: 1, column: 26 },
          source: ' text',
        },
      });
    });

    test('text with interpolation which has `<`', () => {
      const ast = baseParse('some {{ a<b && c>d }} text');
      const text1 = ast.children[0] as TextNode;
      const text2 = ast.children[2] as TextNode;

      expect(text1).toStrictEqual({
        type: NodeTypes.TEXT,
        content: 'some ',
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 5, line: 1, column: 6 },
          source: 'some ',
        },
      });
      expect(text2).toStrictEqual({
        type: NodeTypes.TEXT,
        content: ' text',
        loc: {
          start: { offset: 21, line: 1, column: 22 },
          end: { offset: 26, line: 1, column: 27 },
          source: ' text',
        },
      });
    });

    test('text with mix of tags and interpolations', () => {
      const ast = baseParse('some <span>{{ foo < bar + foo }} text</span>');
      const text1 = ast.children[0] as TextNode;
      const text2 = (ast.children[1] as ElementNode).children![1] as TextNode;

      expect(text1).toStrictEqual({
        type: NodeTypes.TEXT,
        content: 'some ',
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 5, line: 1, column: 6 },
          source: 'some ',
        },
      });
      expect(text2).toStrictEqual({
        type: NodeTypes.TEXT,
        content: ' text',
        loc: {
          start: { offset: 32, line: 1, column: 33 },
          end: { offset: 37, line: 1, column: 38 },
          source: ' text',
        },
      });
    });

    test('lonely "<" doesn\'t separate nodes', () => {
      const ast = baseParse('a < b', {
        onError: (err) => {
          if (err.code !== 'VIBE1112') {
            throw err;
          }
        },
      });
      const text = ast.children[0] as TextNode;

      expect(text).toStrictEqual({
        type: NodeTypes.TEXT,
        content: 'a < b',
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 5, line: 1, column: 6 },
          source: 'a < b',
        },
      });
    });

    test('lonely "{{" doesn\'t separate nodes', () => {
      const ast = baseParse('a {{ b', {
        onError: (error) => {
          if (error.code !== 'VIBE1125') {
            throw error;
          }
        },
      });
      const text = ast.children[0] as TextNode;

      expect(text).toStrictEqual({
        type: NodeTypes.TEXT,
        content: 'a {{ b',
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 6, line: 1, column: 7 },
          source: 'a {{ b',
        },
      });
    });
  });

  describe('Interpolation', () => {
    test('simple interpolation', () => {
      const ast = baseParse('{{message}}');
      const interpolation = ast.children[0] as InterpolationNode;

      expect(interpolation).toStrictEqual({
        type: NodeTypes.INTERPOLATION,
        content: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: `message`,
          isStatic: false,
          loc: {
            start: { offset: 2, line: 1, column: 3 },
            end: { offset: 9, line: 1, column: 10 },
            source: 'message',
          },
        },
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 11, line: 1, column: 12 },
          source: '{{message}}',
        },
      });
    });

    test('it can have tag-like notation', () => {
      const ast = baseParse('{{ a<b }}');
      const interpolation = ast.children[0] as InterpolationNode;

      expect(interpolation).toStrictEqual({
        type: NodeTypes.INTERPOLATION,
        content: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: `a<b`,
          isStatic: false,
          loc: {
            start: { offset: 3, line: 1, column: 4 },
            end: { offset: 6, line: 1, column: 7 },
            source: 'a<b',
          },
        },
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 9, line: 1, column: 10 },
          source: '{{ a<b }}',
        },
      });
    });

    test('it can have tag-like notation (2)', () => {
      const ast = baseParse('{{ a<b }}{{ c>d }}');
      const interpolation1 = ast.children[0] as InterpolationNode;
      const interpolation2 = ast.children[1] as InterpolationNode;

      expect(interpolation1).toStrictEqual({
        type: NodeTypes.INTERPOLATION,
        content: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: `a<b`,
          isStatic: false,
          loc: {
            start: { offset: 3, line: 1, column: 4 },
            end: { offset: 6, line: 1, column: 7 },
            source: 'a<b',
          },
        },
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 9, line: 1, column: 10 },
          source: '{{ a<b }}',
        },
      });

      expect(interpolation2).toStrictEqual({
        type: NodeTypes.INTERPOLATION,
        content: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          isStatic: false,
          content: 'c>d',
          loc: {
            start: { offset: 12, line: 1, column: 13 },
            end: { offset: 15, line: 1, column: 16 },
            source: 'c>d',
          },
        },
        loc: {
          start: { offset: 9, line: 1, column: 10 },
          end: { offset: 18, line: 1, column: 19 },
          source: '{{ c>d }}',
        },
      });
    });

    test('it can have tag-like notation (3)', () => {
      const ast = baseParse('<div>{{ "</div>" }}</div>');
      const element = ast.children[0] as ElementNode;
      const interpolation = element.children[0] as InterpolationNode;

      expect(interpolation).toStrictEqual({
        type: NodeTypes.INTERPOLATION,
        content: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          isStatic: false,
          // The `constType` is the default value and will be determined in `transformExpression`.
          content: '"</div>"',
          loc: {
            start: { offset: 8, line: 1, column: 9 },
            end: { offset: 16, line: 1, column: 17 },
            source: '"</div>"',
          },
        },
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 19, line: 1, column: 20 },
          source: '{{ "</div>" }}',
        },
      });
    });
  });

  describe('Comment', () => {
    test('empty comment', () => {
      const ast = baseParse('<!---->');
      const comment = ast.children[0] as CommentNode;

      expect(comment).toStrictEqual({
        type: NodeTypes.COMMENT,
        content: '',
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 7, line: 1, column: 8 },
          source: '<!---->',
        },
      });
    });

    test('simple comment', () => {
      const ast = baseParse('<!--abc-->');
      const comment = ast.children[0] as CommentNode;

      expect(comment).toStrictEqual({
        type: NodeTypes.COMMENT,
        content: 'abc',
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 10, line: 1, column: 11 },
          source: '<!--abc-->',
        },
      });
    });

    test('two comments', () => {
      const ast = baseParse('<!--abc--><!--def-->');
      const comment1 = ast.children[0] as CommentNode;
      const comment2 = ast.children[1] as CommentNode;

      expect(comment1).toStrictEqual({
        type: NodeTypes.COMMENT,
        content: 'abc',
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 10, line: 1, column: 11 },
          source: '<!--abc-->',
        },
      });
      expect(comment2).toStrictEqual({
        type: NodeTypes.COMMENT,
        content: 'def',
        loc: {
          start: { offset: 10, line: 1, column: 11 },
          end: { offset: 20, line: 1, column: 21 },
          source: '<!--def-->',
        },
      });
    });

    // #2217
    test('comments in the <pre> tag should be removed when comments option requires it', () => {
      const rawText = `<p/><!-- foo --><p/>`;

      const astWithComments = baseParse(`<pre>${rawText}</pre>`);
      expect((astWithComments.children[0] as ElementNode).children).toMatchObject([
        {
          type: NodeTypes.ELEMENT,
          tag: 'p',
        },
        {
          type: NodeTypes.COMMENT,
        },
        {
          type: NodeTypes.ELEMENT,
          tag: 'p',
        },
      ]);
    });
  });

  describe('Element', () => {
    test('simple div', () => {
      const ast = baseParse('<div>hello</div>');
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
        props: [],
        children: [
          {
            type: NodeTypes.TEXT,
            content: 'hello',
            loc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 10, line: 1, column: 11 },
              source: 'hello',
            },
          },
        ],
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 16, line: 1, column: 17 },
          source: '<div>hello</div>',
        },
      });
    });

    test('empty', () => {
      const ast = baseParse('<div></div>');
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
        props: [],
        children: [],
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 11, line: 1, column: 12 },
          source: '<div></div>',
        },
      });
    });

    test('self closing', () => {
      const ast = baseParse('<div/>after');
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
        props: [],
        children: [],
        isSelfClosing: true,
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 6, line: 1, column: 7 },
          source: '<div/>',
        },
      });
    });

    test('void element', () => {
      const ast = baseParse('<img>after');
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'img',
        tagType: ElementTypes.ELEMENT,
        props: [],
        children: [],
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 5, line: 1, column: 6 },
          source: '<img>',
        },
      });
    });

    test('self-closing void element', () => {
      const ast = baseParse('<img/>after');
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'img',
        tagType: ElementTypes.ELEMENT,
        props: [],
        children: [],
        isSelfClosing: true,
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 6, line: 1, column: 7 },
          source: '<img/>',
        },
      });
    });

    test('template element with directives', () => {
      const ast = baseParse('<template v-if="ok"></template>');
      const element = ast.children[0];
      expect(element).toMatchObject({
        type: NodeTypes.ELEMENT,
        tagType: ElementTypes.TEMPLATE,
      });
    });

    test('template element without directives', () => {
      const ast = baseParse('<template></template>');
      const element = ast.children[0];
      expect(element).toMatchObject({
        type: NodeTypes.ELEMENT,
        tagType: ElementTypes.ELEMENT,
      });
    });

    test('native element without `isNativeTag`', () => {
      const ast = baseParse('<div></div><comp></comp><Comp></Comp>');

      expect(ast.children[0]).toMatchObject({
        type: NodeTypes.ELEMENT,
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
      });

      expect(ast.children[1]).toMatchObject({
        type: NodeTypes.ELEMENT,
        tag: 'comp',
        tagType: ElementTypes.ELEMENT,
      });

      expect(ast.children[2]).toMatchObject({
        type: NodeTypes.ELEMENT,
        tag: 'Comp',
        tagType: ElementTypes.COMPONENT,
      });
    });

    test('slot element', () => {
      const ast = baseParse('<slot></slot><Comp></Comp>');

      expect(ast.children[0]).toMatchObject({
        type: NodeTypes.ELEMENT,
        tag: 'slot',
        tagType: ElementTypes.SLOT,
      });

      expect(ast.children[1]).toMatchObject({
        type: NodeTypes.ELEMENT,
        tag: 'Comp',
        tagType: ElementTypes.COMPONENT,
      });
    });

    test('attribute with no value', () => {
      const ast = baseParse('<div id></div>');
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
        props: [
          {
            type: NodeTypes.ATTRIBUTE,
            name: 'id',
            nameLoc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 7, line: 1, column: 8 },
              source: 'id',
            },
            value: undefined,
            loc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 7, line: 1, column: 8 },
              source: 'id',
            },
          },
        ],

        children: [],
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 14, line: 1, column: 15 },
          source: '<div id></div>',
        },
      });
    });

    test('attribute with empty value, double quote', () => {
      const ast = baseParse('<div id=""></div>');
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
        props: [
          {
            type: NodeTypes.ATTRIBUTE,
            name: 'id',
            nameLoc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 7, line: 1, column: 8 },
              source: 'id',
            },
            value: {
              type: NodeTypes.TEXT,
              content: '',
              loc: {
                start: { offset: 8, line: 1, column: 9 },
                end: { offset: 10, line: 1, column: 11 },
                source: '""',
              },
            },
            loc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 10, line: 1, column: 11 },
              source: 'id=""',
            },
          },
        ],

        children: [],
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 17, line: 1, column: 18 },
          source: '<div id=""></div>',
        },
      });
    });

    test('attribute with empty value, single quote', () => {
      const ast = baseParse("<div id=''></div>");
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
        props: [
          {
            type: NodeTypes.ATTRIBUTE,
            name: 'id',
            nameLoc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 7, line: 1, column: 8 },
              source: 'id',
            },
            value: {
              type: NodeTypes.TEXT,
              content: '',
              loc: {
                start: { offset: 8, line: 1, column: 9 },
                end: { offset: 10, line: 1, column: 11 },
                source: "''",
              },
            },
            loc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 10, line: 1, column: 11 },
              source: "id=''",
            },
          },
        ],

        children: [],
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 17, line: 1, column: 18 },
          source: "<div id=''></div>",
        },
      });
    });

    test('attribute with value, double quote', () => {
      const ast = baseParse('<div id=">\'"></div>');
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
        props: [
          {
            type: NodeTypes.ATTRIBUTE,
            name: 'id',
            nameLoc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 7, line: 1, column: 8 },
              source: 'id',
            },
            value: {
              type: NodeTypes.TEXT,
              content: ">'",
              loc: {
                start: { offset: 8, line: 1, column: 9 },
                end: { offset: 12, line: 1, column: 13 },
                source: '">\'"',
              },
            },
            loc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 12, line: 1, column: 13 },
              source: 'id=">\'"',
            },
          },
        ],

        children: [],
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 19, line: 1, column: 20 },
          source: '<div id=">\'"></div>',
        },
      });
    });

    test('attribute with value, single quote', () => {
      const ast = baseParse("<div id='>\"'></div>");
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
        props: [
          {
            type: NodeTypes.ATTRIBUTE,
            name: 'id',
            nameLoc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 7, line: 1, column: 8 },
              source: 'id',
            },
            value: {
              type: NodeTypes.TEXT,
              content: '>"',
              loc: {
                start: { offset: 8, line: 1, column: 9 },
                end: { offset: 12, line: 1, column: 13 },
                source: "'>\"'",
              },
            },
            loc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 12, line: 1, column: 13 },
              source: "id='>\"'",
            },
          },
        ],

        children: [],
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 19, line: 1, column: 20 },
          source: "<div id='>\"'></div>",
        },
      });
    });

    test('attribute with value, unquoted', () => {
      const ast = baseParse('<div id=a/></div>');
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
        props: [
          {
            type: NodeTypes.ATTRIBUTE,
            name: 'id',
            nameLoc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 7, line: 1, column: 8 },
              source: 'id',
            },
            value: {
              type: NodeTypes.TEXT,
              content: 'a/',
              loc: {
                start: { offset: 8, line: 1, column: 9 },
                end: { offset: 10, line: 1, column: 11 },
                source: 'a/',
              },
            },
            loc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 10, line: 1, column: 11 },
              source: 'id=a/',
            },
          },
        ],

        children: [],
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 17, line: 1, column: 18 },
          source: '<div id=a/></div>',
        },
      });
    });

    test('attribute value with >', () => {
      const ast = baseParse(
        '<script setup lang="ts" generic="T extends Record<string,string>"></script>',
        { parseMode: 'sfc' },
      );
      const element = ast.children[0] as ElementNode;
      expect(element).toMatchObject({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'script',
        tagType: ElementTypes.ELEMENT,
        children: [],
        innerLoc: {
          start: { column: 67, line: 1, offset: 66 },
          end: { column: 67, line: 1, offset: 66 },
        },
        props: [
          {
            loc: {
              source: 'setup',
              end: { column: 14, line: 1, offset: 13 },
              start: { column: 9, line: 1, offset: 8 },
            },
            name: 'setup',
            nameLoc: {
              source: 'setup',
              end: { column: 14, line: 1, offset: 13 },
              start: { column: 9, line: 1, offset: 8 },
            },
            type: NodeTypes.ATTRIBUTE,
            value: undefined,
          },
          {
            loc: {
              source: 'lang="ts"',
              end: { column: 24, line: 1, offset: 23 },
              start: { column: 15, line: 1, offset: 14 },
            },
            name: 'lang',
            nameLoc: {
              source: 'lang',
              end: { column: 19, line: 1, offset: 18 },
              start: { column: 15, line: 1, offset: 14 },
            },
            type: NodeTypes.ATTRIBUTE,
            value: {
              content: 'ts',
              loc: {
                source: '"ts"',
                end: { column: 24, line: 1, offset: 23 },
                start: { column: 20, line: 1, offset: 19 },
              },
              type: NodeTypes.TEXT,
            },
          },
          {
            loc: {
              source: 'generic="T extends Record<string,string>"',
              end: { column: 66, line: 1, offset: 65 },
              start: { column: 25, line: 1, offset: 24 },
            },
            name: 'generic',
            nameLoc: {
              source: 'generic',
              end: { column: 32, line: 1, offset: 31 },
              start: { column: 25, line: 1, offset: 24 },
            },
            type: NodeTypes.ATTRIBUTE,
            value: {
              content: 'T extends Record<string,string>',
              loc: {
                source: '"T extends Record<string,string>"',
                end: { column: 66, line: 1, offset: 65 },
                start: { column: 33, line: 1, offset: 32 },
              },
              type: NodeTypes.TEXT,
            },
          },
        ],
      });
    });

    test('multiple attributes', () => {
      const ast = baseParse('<div id=a class="c" inert style=\'\'></div>');
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        type: NodeTypes.ELEMENT,
        ns: Namespaces.HTML,
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
        props: [
          {
            type: NodeTypes.ATTRIBUTE,
            name: 'id',
            nameLoc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 7, line: 1, column: 8 },
              source: 'id',
            },
            value: {
              type: NodeTypes.TEXT,
              content: 'a',
              loc: {
                start: { offset: 8, line: 1, column: 9 },
                end: { offset: 9, line: 1, column: 10 },
                source: 'a',
              },
            },
            loc: {
              start: { offset: 5, line: 1, column: 6 },
              end: { offset: 9, line: 1, column: 10 },
              source: 'id=a',
            },
          },
          {
            type: NodeTypes.ATTRIBUTE,
            name: 'class',
            nameLoc: {
              start: { offset: 10, line: 1, column: 11 },
              end: { offset: 15, line: 1, column: 16 },
              source: 'class',
            },
            value: {
              type: NodeTypes.TEXT,
              content: 'c',
              loc: {
                start: { offset: 16, line: 1, column: 17 },
                end: { offset: 19, line: 1, column: 20 },
                source: '"c"',
              },
            },
            loc: {
              start: { offset: 10, line: 1, column: 11 },
              end: { offset: 19, line: 1, column: 20 },
              source: 'class="c"',
            },
          },
          {
            type: NodeTypes.ATTRIBUTE,
            name: 'inert',
            nameLoc: {
              start: { offset: 20, line: 1, column: 21 },
              end: { offset: 25, line: 1, column: 26 },
              source: 'inert',
            },
            value: undefined,
            loc: {
              start: { offset: 20, line: 1, column: 21 },
              end: { offset: 25, line: 1, column: 26 },
              source: 'inert',
            },
          },
          {
            type: NodeTypes.ATTRIBUTE,
            name: 'style',
            nameLoc: {
              start: { offset: 26, line: 1, column: 27 },
              end: { offset: 31, line: 1, column: 32 },
              source: 'style',
            },
            value: {
              type: NodeTypes.TEXT,
              content: '',
              loc: {
                start: { offset: 32, line: 1, column: 33 },
                end: { offset: 34, line: 1, column: 35 },
                source: "''",
              },
            },
            loc: {
              start: { offset: 26, line: 1, column: 27 },
              end: { offset: 34, line: 1, column: 35 },
              source: "style=''",
            },
          },
        ],

        children: [],
        loc: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 41, line: 1, column: 42 },
          source: '<div id=a class="c" inert style=\'\'></div>',
        },
      });
    });

    // https://github.com/vuejs/core/issues/4251
    test('class attribute should ignore whitespace when parsed', () => {
      const ast = baseParse('<div class=" \n\t c \t\n "></div>');
      const element = ast.children[0] as ElementNode;

      expect(element).toStrictEqual({
        children: [],
        loc: {
          start: { column: 1, line: 1, offset: 0 },
          end: { column: 10, line: 3, offset: 29 },
          source: '<div class=" \n\t c \t\n "></div>',
        },
        ns: Namespaces.HTML,
        props: [
          {
            name: 'class',
            nameLoc: {
              start: { column: 6, line: 1, offset: 5 },
              end: { column: 11, line: 1, offset: 10 },
              source: 'class',
            },
            type: NodeTypes.ATTRIBUTE,
            value: {
              content: 'c',
              loc: {
                start: { column: 12, line: 1, offset: 11 },
                end: { column: 3, line: 3, offset: 22 },
                source: '" \n\t c \t\n "',
              },
              type: NodeTypes.TEXT,
            },
            loc: {
              start: { column: 6, line: 1, offset: 5 },
              end: { column: 3, line: 3, offset: 22 },
              source: 'class=" \n\t c \t\n "',
            },
          },
        ],
        tag: 'div',
        tagType: ElementTypes.ELEMENT,
        type: NodeTypes.ELEMENT,
      });
    });

    test('directive with no value', () => {
      const ast = baseParse('<div v-if/>');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'if',
        rawName: 'v-if',
        arg: undefined,
        modifiers: [],
        exp: undefined,
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 9, line: 1, column: 10 },
          source: 'v-if',
        },
      });
    });

    test('directive with value', () => {
      const ast = baseParse('<div v-if="a"/>');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'if',
        rawName: 'v-if',
        arg: undefined,
        modifiers: [],
        exp: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'a',
          isStatic: false,
          loc: {
            start: { offset: 11, line: 1, column: 12 },
            end: { offset: 12, line: 1, column: 13 },
            source: 'a',
          },
        },
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 13, line: 1, column: 14 },
          source: 'v-if="a"',
        },
      });
    });

    test('directive with argument', () => {
      const ast = baseParse('<div v-on:click/>');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'on',
        rawName: 'v-on:click',
        arg: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'click',
          isStatic: true,
          loc: {
            start: { column: 11, line: 1, offset: 10 },
            end: { column: 16, line: 1, offset: 15 },
            source: 'click',
          },
        },
        modifiers: [],
        exp: undefined,
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 15, line: 1, column: 16 },
          source: 'v-on:click',
        },
      });
    });

    // #3494
    test('directive argument edge case', () => {
      const ast = baseParse('<div v-slot:slot />');
      const directive = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
      expect(directive.arg).toMatchObject({
        loc: {
          start: { offset: 12, line: 1, column: 13 },
          end: { offset: 16, line: 1, column: 17 },
        },
      });
    });

    // https://github.com/vuejs/language-tools/issues/2710
    test('directive argument edge case (2)', () => {
      const ast = baseParse('<div #item.item />');
      const directive = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
      expect(directive.arg).toMatchObject({
        content: 'item.item',
        loc: {
          start: { offset: 6, line: 1, column: 7 },
          end: { offset: 15, line: 1, column: 16 },
        },
      });
    });

    test('directive with dynamic argument', () => {
      const ast = baseParse('<div v-on:[event]/>');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'on',
        rawName: 'v-on:[event]',
        arg: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'event',
          isStatic: false,
          loc: {
            start: { column: 11, line: 1, offset: 10 },
            end: { column: 18, line: 1, offset: 17 },
            source: '[event]',
          },
        },
        modifiers: [],
        exp: undefined,
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 17, line: 1, column: 18 },
          source: 'v-on:[event]',
        },
      });
    });

    test('directive with a modifier', () => {
      const ast = baseParse('<div v-on.enter/>');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'on',
        rawName: 'v-on.enter',
        arg: undefined,
        modifiers: [
          {
            content: 'enter',
            isStatic: true,
            loc: {
              end: {
                column: 16,
                line: 1,
                offset: 15,
              },
              source: 'enter',
              start: {
                column: 11,
                line: 1,
                offset: 10,
              },
            },
            type: 4,
          },
        ],
        exp: undefined,
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 15, line: 1, column: 16 },
          source: 'v-on.enter',
        },
      });
    });

    test('directive with two modifiers', () => {
      const ast = baseParse('<div v-on.enter.exact/>');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'on',
        rawName: 'v-on.enter.exact',
        arg: undefined,
        modifiers: [
          {
            content: 'enter',
            isStatic: true,
            loc: {
              end: {
                column: 16,
                line: 1,
                offset: 15,
              },
              source: 'enter',
              start: {
                column: 11,
                line: 1,
                offset: 10,
              },
            },
            type: 4,
          },
          {
            content: 'exact',
            isStatic: true,
            loc: {
              end: {
                column: 22,
                line: 1,
                offset: 21,
              },
              source: 'exact',
              start: {
                column: 17,
                line: 1,
                offset: 16,
              },
            },
            type: 4,
          },
        ],
        exp: undefined,
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 21, line: 1, column: 22 },
          source: 'v-on.enter.exact',
        },
      });
    });

    test('directive with argument and modifiers', () => {
      const ast = baseParse('<div v-on:click.enter.exact/>');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'on',
        rawName: 'v-on:click.enter.exact',
        arg: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'click',
          isStatic: true,
          loc: {
            start: { column: 11, line: 1, offset: 10 },
            end: { column: 16, line: 1, offset: 15 },
            source: 'click',
          },
        },
        modifiers: [
          {
            content: 'enter',
            isStatic: true,
            loc: {
              end: {
                column: 22,
                line: 1,
                offset: 21,
              },
              source: 'enter',
              start: {
                column: 17,
                line: 1,
                offset: 16,
              },
            },
            type: 4,
          },
          {
            content: 'exact',
            isStatic: true,
            loc: {
              end: {
                column: 28,
                line: 1,
                offset: 27,
              },
              source: 'exact',
              start: {
                column: 23,
                line: 1,
                offset: 22,
              },
            },
            type: 4,
          },
        ],
        exp: undefined,
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 27, line: 1, column: 28 },
          source: 'v-on:click.enter.exact',
        },
      });
    });

    test('directive with dynamic argument and modifiers', () => {
      const ast = baseParse('<div v-on:[a.b].camel/>');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'on',
        rawName: 'v-on:[a.b].camel',
        arg: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'a.b',
          isStatic: false,
          loc: {
            start: { column: 11, line: 1, offset: 10 },
            end: { column: 16, line: 1, offset: 15 },
            source: '[a.b]',
          },
        },
        modifiers: [
          {
            content: 'camel',
            isStatic: true,
            loc: {
              end: {
                column: 22,
                line: 1,
                offset: 21,
              },
              source: 'camel',
              start: {
                column: 17,
                line: 1,
                offset: 16,
              },
            },
            type: 4,
          },
        ],
        exp: undefined,
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 21, line: 1, column: 22 },
          source: 'v-on:[a.b].camel',
        },
      });
    });

    test('directive with no name', () => {
      let errorCode = '';
      const ast = baseParse('<div v-/>', {
        onError: (err) => {
          errorCode = err.code;
        },
      });
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(errorCode).toBe('VIBE1126');
      expect(directive).toStrictEqual({
        type: NodeTypes.ATTRIBUTE,
        name: 'v-',
        value: undefined,
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 7, line: 1, column: 8 },
          source: 'v-',
        },
        nameLoc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 7, line: 1, column: 8 },
          source: 'v-',
        },
      });
    });

    test('v-bind shorthand', () => {
      const ast = baseParse('<div :a=b />');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'bind',
        rawName: ':a',
        arg: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'a',
          isStatic: true,
          loc: {
            start: { column: 7, line: 1, offset: 6 },
            end: { column: 8, line: 1, offset: 7 },
            source: 'a',
          },
        },
        modifiers: [],
        exp: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'b',
          isStatic: false,
          loc: {
            start: { offset: 8, line: 1, column: 9 },
            end: { offset: 9, line: 1, column: 10 },
            source: 'b',
          },
        },
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 9, line: 1, column: 10 },
          source: ':a=b',
        },
      });
    });

    test('v-bind .prop shorthand', () => {
      const ast = baseParse('<div .a=b />');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'bind',
        rawName: '.a',
        arg: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'a',
          isStatic: true,
          loc: {
            start: { column: 7, line: 1, offset: 6 },
            end: { column: 8, line: 1, offset: 7 },
            source: 'a',
          },
        },
        modifiers: [
          {
            content: 'prop',
            isStatic: false,
            loc: {
              end: {
                column: 6,
                line: 1,
                offset: 5,
              },
              source: '',
              start: {
                column: 6,
                line: 1,
                offset: 5,
              },
            },
            type: 4,
          },
        ],
        exp: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'b',
          isStatic: false,
          loc: {
            start: { offset: 8, line: 1, column: 9 },
            end: { offset: 9, line: 1, column: 10 },
            source: 'b',
          },
        },
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 9, line: 1, column: 10 },
          source: '.a=b',
        },
      });
    });

    test('v-bind shorthand with modifier', () => {
      const ast = baseParse('<div :a.sync=b />');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'bind',
        rawName: ':a.sync',
        arg: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'a',
          isStatic: true,
          loc: {
            start: { column: 7, line: 1, offset: 6 },
            end: { column: 8, line: 1, offset: 7 },
            source: 'a',
          },
        },
        modifiers: [
          {
            content: 'sync',
            isStatic: true,
            loc: {
              end: {
                column: 13,
                line: 1,
                offset: 12,
              },
              source: 'sync',
              start: {
                column: 9,
                line: 1,
                offset: 8,
              },
            },
            type: 4,
          },
        ],
        exp: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'b',
          isStatic: false,

          loc: {
            start: { offset: 13, line: 1, column: 14 },
            end: { offset: 14, line: 1, column: 15 },
            source: 'b',
          },
        },
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 14, line: 1, column: 15 },
          source: ':a.sync=b',
        },
      });
    });

    test('v-on shorthand', () => {
      const ast = baseParse('<div @a=b />');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'on',
        rawName: '@a',
        arg: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'a',
          isStatic: true,
          loc: {
            start: { column: 7, line: 1, offset: 6 },
            end: { column: 8, line: 1, offset: 7 },
            source: 'a',
          },
        },
        modifiers: [],
        exp: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'b',
          isStatic: false,

          loc: {
            start: { offset: 8, line: 1, column: 9 },
            end: { offset: 9, line: 1, column: 10 },
            source: 'b',
          },
        },
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 9, line: 1, column: 10 },
          source: '@a=b',
        },
      });
    });

    test('v-on shorthand with modifier', () => {
      const ast = baseParse('<div @a.enter=b />');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'on',
        rawName: '@a.enter',
        arg: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'a',
          isStatic: true,
          loc: {
            start: { column: 7, line: 1, offset: 6 },
            end: { column: 8, line: 1, offset: 7 },
            source: 'a',
          },
        },
        modifiers: [
          {
            content: 'enter',
            isStatic: true,
            loc: {
              end: {
                column: 14,
                line: 1,
                offset: 13,
              },
              source: 'enter',
              start: {
                column: 9,
                line: 1,
                offset: 8,
              },
            },
            type: 4,
          },
        ],
        exp: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'b',
          isStatic: false,

          loc: {
            start: { offset: 14, line: 1, column: 15 },
            end: { offset: 15, line: 1, column: 16 },
            source: 'b',
          },
        },
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 15, line: 1, column: 16 },
          source: '@a.enter=b',
        },
      });
    });

    test('v-slot shorthand', () => {
      const ast = baseParse('<Comp #a="{ b }" />');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toStrictEqual({
        type: NodeTypes.DIRECTIVE,
        name: 'slot',
        rawName: '#a',
        arg: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'a',
          isStatic: true,
          loc: {
            start: { column: 8, line: 1, offset: 7 },
            end: { column: 9, line: 1, offset: 8 },
            source: 'a',
          },
        },
        modifiers: [],
        exp: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: '{ b }',
          isStatic: false,
          // The `constType` is the default value and will be determined in transformExpression
          loc: {
            start: { offset: 10, line: 1, column: 11 },
            end: { offset: 15, line: 1, column: 16 },
            source: '{ b }',
          },
        },
        loc: {
          start: { offset: 6, line: 1, column: 7 },
          end: { offset: 16, line: 1, column: 17 },
          source: '#a="{ b }"',
        },
      });
    });

    // #1241 special case for 2.x compat
    test('v-slot arg containing dots', () => {
      const ast = baseParse('<Comp v-slot:foo.bar="{ a }" />');
      const directive = (ast.children[0] as ElementNode).props[0];

      expect(directive).toMatchObject({
        type: NodeTypes.DIRECTIVE,
        name: 'slot',
        rawName: 'v-slot:foo.bar',
        arg: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'foo.bar',
          isStatic: true,
          loc: {
            start: {
              column: 14,
              line: 1,
              offset: 13,
            },
            end: {
              column: 21,
              line: 1,
              offset: 20,
            },
          },
        },
      });
    });

    test('v-pre', () => {
      const ast = baseParse(
        `<div v-pre :id="foo"><Comp/>{{ bar }}</div>\n` + `<div :id="foo"><Comp/>{{ bar }}</div>`,
      );

      const divWithPre = ast.children[0] as ElementNode;
      expect(divWithPre.props).toMatchObject([
        {
          type: NodeTypes.ATTRIBUTE,
          name: `:id`,
          value: {
            type: NodeTypes.TEXT,
            content: `foo`,
          },
          loc: {
            start: { line: 1, column: 12 },
            end: { line: 1, column: 21 },
          },
        },
      ]);
      expect(divWithPre.children[0]).toMatchObject({
        type: NodeTypes.ELEMENT,
        tagType: ElementTypes.ELEMENT,
        tag: `Comp`,
      });
      expect(divWithPre.children[1]).toMatchObject({
        type: NodeTypes.TEXT,
        content: `{{ bar }}`,
      });

      // should not affect siblings after it
      const divWithoutPre = ast.children[1] as ElementNode;
      expect(divWithoutPre.props).toMatchObject([
        {
          type: NodeTypes.DIRECTIVE,
          name: `bind`,
          arg: {
            type: NodeTypes.SIMPLE_EXPRESSION,
            isStatic: true,
            content: `id`,
          },
          exp: {
            type: NodeTypes.SIMPLE_EXPRESSION,
            isStatic: false,
            content: `foo`,
          },
          loc: {
            start: {
              line: 2,
              column: 6,
            },
            end: {
              line: 2,
              column: 15,
            },
          },
        },
      ]);
      expect(divWithoutPre.children[0]).toMatchObject({
        type: NodeTypes.ELEMENT,
        tagType: ElementTypes.COMPONENT,
        tag: `Comp`,
      });
      expect(divWithoutPre.children[1]).toMatchObject({
        type: NodeTypes.INTERPOLATION,
        content: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: `bar`,
          isStatic: false,
        },
      });
    });

    // https://github.com/vuejs/docs/issues/2586
    test('v-pre with half-open interpolation', () => {
      const ast = baseParse(
        `<div v-pre>
          <span>{{ number </span>
          <span>}}</span>
        </div>
        `,
      );
      expect((ast.children[0] as ElementNode).children).toMatchObject([
        {
          type: NodeTypes.ELEMENT,
          children: [{ type: NodeTypes.TEXT, content: `{{ number ` }],
        },
        {
          type: NodeTypes.ELEMENT,
          children: [{ type: NodeTypes.TEXT, content: `}}` }],
        },
      ]);

      const ast2 = baseParse(`<div v-pre><span>{{ number </span></div>`);
      expect((ast2.children[0] as ElementNode).children).toMatchObject([
        {
          type: NodeTypes.ELEMENT,
          children: [{ type: NodeTypes.TEXT, content: `{{ number ` }],
        },
      ]);

      const ast3 = baseParse(`<div v-pre><textarea>{{ foo </textarea></div>`);
      expect((ast3.children[0] as ElementNode).children).toMatchObject([
        {
          type: NodeTypes.ELEMENT,
          children: [
            {
              type: NodeTypes.TEXT,
              content: `{{ foo `,
            },
          ],
        },
      ]);
    });

    test('self-closing v-pre', () => {
      const ast = baseParse(`<div v-pre/>\n<div :id="foo"><Comp/>{{ bar }}</div>`);
      // should not affect siblings after it
      const divWithoutPre = ast.children[1] as ElementNode;
      expect(divWithoutPre.props).toMatchObject([
        {
          type: NodeTypes.DIRECTIVE,
          name: `bind`,
          arg: {
            type: NodeTypes.SIMPLE_EXPRESSION,
            isStatic: true,
            content: `id`,
          },
          exp: {
            type: NodeTypes.SIMPLE_EXPRESSION,
            isStatic: false,
            content: `foo`,
          },
          loc: {
            start: {
              line: 2,
              column: 6,
            },
            end: {
              line: 2,
              column: 15,
            },
          },
        },
      ]);
      expect(divWithoutPre.children[0]).toMatchObject({
        type: NodeTypes.ELEMENT,
        tagType: ElementTypes.COMPONENT,
        tag: `Comp`,
      });
      expect(divWithoutPre.children[1]).toMatchObject({
        type: NodeTypes.INTERPOLATION,
        content: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: `bar`,
          isStatic: false,
        },
      });
    });

    test('end tags are case-insensitive.', () => {
      const ast = baseParse('<div>hello</DIV>after');
      const element = ast.children[0] as ElementNode;
      const text = element.children[0] as TextNode;

      expect(text).toStrictEqual({
        type: NodeTypes.TEXT,
        content: 'hello',
        loc: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 10, line: 1, column: 11 },
          source: 'hello',
        },
      });
    });
  });

  describe('Edge Cases', () => {
    test('self closing single tag', () => {
      const ast = baseParse('<div :class="{ some: condition }" />');

      expect(ast.children).toHaveLength(1);
      expect(ast.children[0]).toMatchObject({ tag: 'div' });
    });

    test('self closing multiple tag', () => {
      const ast = baseParse(
        `<div :class="{ some: condition }" />\n` + `<p v-bind:style="{ color: 'red' }"/>`,
      );

      expect(ast.children).toHaveLength(2);
      expect(ast.children[0]).toMatchObject({ tag: 'div' });
      expect(ast.children[1]).toMatchObject({ tag: 'p' });
    });

    test('valid html', () => {
      const ast = baseParse(
        `<div :class="{ some: condition }">\n` +
          `  <p v-bind:style="{ color: 'red' }"/>\n` +
          `  <!-- a comment with <html> inside it -->\n` +
          `</div>`,
      );

      expect(ast.children).toHaveLength(1);
      const el = ast.children[0] as any;
      expect(el).toMatchObject({
        tag: 'div',
      });
      expect(el.children).toHaveLength(2);
      expect(el.children[0]).toMatchObject({
        tag: 'p',
      });
      expect(el.children[1]).toMatchObject({
        type: NodeTypes.COMMENT,
      });
    });

    test('invalid html', () => {
      const spy = vi.fn();
      const ast = baseParse(`<div>\n<span>\n</div>\n</span>`, {
        onError: spy,
      });

      expect(spy.mock.calls).toMatchObject([
        [
          {
            code: 'VIBE1124',
            loc: {
              start: {
                offset: 6,
                line: 2,
                column: 1,
              },
            },
          },
        ],
        [
          {
            code: 'VIBE1123',
            loc: {
              start: {
                offset: 20,
                line: 4,
                column: 1,
              },
            },
          },
        ],
      ]);
    });

    test('parse with correct location info', () => {
      const fooSrc = `foo\n is `;
      const barSrc = `{{ bar }}`;
      const butSrc = ` but `;
      const bazSrc = `{{ baz }}`;
      const [foo, bar, but, baz] = baseParse(fooSrc + barSrc + butSrc + bazSrc).children;

      let offset = 0;
      expect(foo.loc.start).toEqual({ line: 1, column: 1, offset });
      offset += fooSrc.length;
      expect(foo.loc.end).toEqual({ line: 2, column: 5, offset });

      expect(bar.loc.start).toEqual({ line: 2, column: 5, offset });
      const barInner = (bar as InterpolationNode).content;
      offset += 3;
      expect(barInner.loc.start).toEqual({ line: 2, column: 8, offset });
      offset += 3;
      expect(barInner.loc.end).toEqual({ line: 2, column: 11, offset });
      offset += 3;
      expect(bar.loc.end).toEqual({ line: 2, column: 14, offset });

      expect(but.loc.start).toEqual({ line: 2, column: 14, offset });
      offset += butSrc.length;
      expect(but.loc.end).toEqual({ line: 2, column: 19, offset });

      expect(baz.loc.start).toEqual({ line: 2, column: 19, offset });
      const bazInner = (baz as InterpolationNode).content;
      offset += 3;
      expect(bazInner.loc.start).toEqual({ line: 2, column: 22, offset });
      offset += 3;
      expect(bazInner.loc.end).toEqual({ line: 2, column: 25, offset });
      offset += 3;
      expect(baz.loc.end).toEqual({ line: 2, column: 28, offset });
    });

    // With standard HTML parsing, the following input would ignore the slash
    // and treat "<" and "template" as attributes on the open tag of "Hello",
    // causing `<template>` to fail to close, and `<script>` being parsed as its
    // child. This is would never be intended in actual templates, but is a common
    // intermediate state from user input when parsing for IDE support. We want
    // the `<script>` to be at root-level to keep the SFC structure stable for
    // Volar to do incremental computations.
    test('tag termination handling for IDE', () => {
      const spy = vi.fn();
      const ast = baseParse(`<template><Hello\n</template><script>console.log(1)</script>`, {
        onError: spy,
      });
      //
      expect(ast.children.length).toBe(2);
      expect(ast.children[1]).toMatchObject({
        type: NodeTypes.ELEMENT,
        tag: 'script',
      });
    });

    test('arg should be undefined on shorthand dirs with no arg', () => {
      const ast = baseParse(`<template #></template>`);
      const el = ast.children[0] as ElementNode;
      expect(el.props[0]).toMatchObject({
        type: NodeTypes.DIRECTIVE,
        name: 'slot',
        exp: undefined,
        arg: undefined,
      });
    });

    // edge case found in vue-macros where the input is TS or JSX
    test('should reset inRCDATA state', () => {
      baseParse(`<Foo>`, { parseMode: 'sfc', onError() {} });
      expect(() => baseParse(`{ foo }`)).not.toThrow();
    });

    test('correct loc when the closing > is foarmatted', () => {
      const [span] = baseParse(`<span></span
      
      >`).children;

      expect(span.loc.source).toBe('<span></span\n      \n      >');
      expect(span.loc.start.offset).toBe(0);
      expect(span.loc.end.offset).toBe(27);
    });

    test('correct loc when a line in attribute value ends with &', () => {
      const [span] = baseParse(`<span v-if="foo &&\nbar"></span>`).children;
      expect(span.loc.end.line).toBe(2);
    });
  });

  describe('decodeEntities option', () => {
    test('use decode by default', () => {
      const ast: any = baseParse('&gt;&lt;&amp;&apos;&quot;&foo;');

      expect(ast.children.length).toBe(1);
      expect(ast.children[0].type).toBe(NodeTypes.TEXT);
      expect(ast.children[0].content).toBe('><&\'"&foo;');
    });
  });

  describe('whitespace management when adopting strategy condense', () => {
    const parse = (content: string) => baseParse(content);

    test('should remove whitespaces at start/end inside an element', () => {
      const ast = parse(`<div>   <span/>    </div>`);
      expect((ast.children[0] as ElementNode).children.length).toBe(1);
    });

    test('should remove whitespaces w/ newline between elements', () => {
      const ast = parse(`<div/> \n <div/> \n <div/>`);
      expect(ast.children.length).toBe(3);
      expect(ast.children.every((c) => c.type === NodeTypes.ELEMENT)).toBe(true);
    });

    test('should remove whitespaces adjacent to comments', () => {
      const ast = parse(`<div/> \n <!--foo--> <div/>`);
      expect(ast.children.length).toBe(3);
      expect(ast.children[0].type).toBe(NodeTypes.ELEMENT);
      expect(ast.children[1].type).toBe(NodeTypes.COMMENT);
      expect(ast.children[2].type).toBe(NodeTypes.ELEMENT);
    });

    test('should remove whitespaces w/ newline between comments and elements', () => {
      const ast = parse(`<div/> \n <!--foo--> \n <div/>`);
      expect(ast.children.length).toBe(3);
      expect(ast.children[0].type).toBe(NodeTypes.ELEMENT);
      expect(ast.children[1].type).toBe(NodeTypes.COMMENT);
      expect(ast.children[2].type).toBe(NodeTypes.ELEMENT);
    });

    test('should NOT remove whitespaces w/ newline between interpolations', () => {
      const ast = parse(`{{ foo }} \n {{ bar }}`);
      expect(ast.children.length).toBe(3);
      expect(ast.children[0].type).toBe(NodeTypes.INTERPOLATION);
      expect(ast.children[1]).toMatchObject({
        type: NodeTypes.TEXT,
        content: ' ',
      });
      expect(ast.children[2].type).toBe(NodeTypes.INTERPOLATION);
    });

    test('should NOT remove whitespaces w/ newline between interpolation and comment', () => {
      const ast = parse(`<!-- foo --> \n {{msg}}`);
      expect(ast.children.length).toBe(3);
      expect(ast.children[0].type).toBe(NodeTypes.COMMENT);
      expect(ast.children[1]).toMatchObject({
        type: NodeTypes.TEXT,
        content: ' ',
      });
      expect(ast.children[2].type).toBe(NodeTypes.INTERPOLATION);
    });

    test('should NOT remove whitespaces w/o newline between elements', () => {
      const ast = parse(`<div/> <div/> <div/>`);
      expect(ast.children.length).toBe(5);
      expect(ast.children.map((c) => c.type)).toMatchObject([
        NodeTypes.ELEMENT,
        NodeTypes.TEXT,
        NodeTypes.ELEMENT,
        NodeTypes.TEXT,
        NodeTypes.ELEMENT,
      ]);
    });

    test('should condense consecutive whitespaces in text', () => {
      const ast = parse(`   foo  \n    bar     baz     `);
      expect((ast.children[0] as TextNode).content).toBe(` foo bar baz `);
    });

    test('should remove leading newline character immediately following the pre element start tag', () => {
      const ast = parse(`<pre>\n  foo  bar  </pre>`);
      expect(ast.children).toHaveLength(1);
      const preElement = ast.children[0] as ElementNode;
      expect(preElement.children).toHaveLength(1);
      expect((preElement.children[0] as TextNode).content).toBe(`  foo  bar  `);
    });

    test('should NOT remove leading newline character immediately following child-tag of pre element', () => {
      const ast = parse(`<pre><span></span>\n  foo  bar  </pre>`);
      const preElement = ast.children[0] as ElementNode;
      expect(preElement.children).toHaveLength(2);
      expect((preElement.children[1] as TextNode).content).toBe(`\n  foo  bar  `);
    });

    test('self-closing pre tag', () => {
      const ast = parse(`<pre/><span>\n  foo   bar</span>`);
      const elementAfterPre = ast.children[1] as ElementNode;
      // should not affect the <span> and condense its whitespace inside
      expect((elementAfterPre.children[0] as TextNode).content).toBe(` foo bar`);
    });

    test('should NOT condense whitespaces in RCDATA text mode', () => {
      const ast = parse(`<textarea>Text:\n   foo</textarea>`);
      const preElement = ast.children[0] as ElementNode;
      expect(preElement.children).toHaveLength(1);
      expect((preElement.children[0] as TextNode).content).toBe(`Text:\n   foo`);
    });
  });

  describe('Errors', () => {
    // HTML parsing errors as specified at
    // https://html.spec.whatwg.org/multipage/parsing.html#parse-errors
    // We ignore some errors that do NOT affect parse result in meaningful ways
    // but have non-trivial implementation cost.
    const patterns: {
      [key: string]: Array<{
        code: string;
        errors: Array<{ type: string; loc: Position }>;
      }>;
    } = {
      CDATA_IN_HTML_CONTENT: [
        {
          code: '<template><![CDATA[cdata]]></template>',
          errors: [
            {
              type: 'VIBE1101',
              loc: { offset: 10, line: 1, column: 11 },
            },
          ],
        },
        {
          code: '<template><svg><![CDATA[cdata]]></svg></template>',
          errors: [],
        },
        {
          // invalid root-level CDATA should report a parser error
          code: '<![CDATA[cdata]]>',
          errors: [
            {
              type: 'VIBE1101',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
      ],
      DUPLICATE_ATTRIBUTE: [
        {
          code: '<template><div id="" id=""></div></template>',
          errors: [
            {
              type: 'VIBE1102',
              loc: { offset: 21, line: 1, column: 22 },
            },
          ],
        },
      ],
      EOF_BEFORE_TAG_NAME: [
        {
          code: '<template><',
          errors: [
            {
              type: 'VIBE1105',
              loc: { offset: 11, line: 1, column: 12 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template></',
          errors: [
            {
              type: 'VIBE1105',
              loc: { offset: 12, line: 1, column: 13 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
      ],
      EOF_IN_CDATA: [
        {
          code: '<template><svg><![CDATA[cdata',
          errors: [
            {
              type: 'VIBE1106',
              loc: { offset: 29, line: 1, column: 30 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 10, line: 1, column: 11 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template><svg><![CDATA[',
          errors: [
            {
              type: 'VIBE1106',
              loc: { offset: 24, line: 1, column: 25 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 10, line: 1, column: 11 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
      ],
      EOF_IN_COMMENT: [
        {
          code: '<template><!--comment',
          errors: [
            {
              type: 'VIBE1107',
              loc: { offset: 21, line: 1, column: 22 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template><!--',
          errors: [
            {
              type: 'VIBE1107',
              loc: { offset: 14, line: 1, column: 15 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
      ],
      EOF_IN_TAG: [
        {
          code: '<template><div',
          errors: [
            {
              type: 'VIBE1109',
              loc: { offset: 14, line: 1, column: 15 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template><div ',
          errors: [
            {
              type: 'VIBE1109',
              loc: { offset: 15, line: 1, column: 16 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template><div id',
          errors: [
            {
              type: 'VIBE1109',
              loc: { offset: 17, line: 1, column: 18 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template><div id ',
          errors: [
            {
              type: 'VIBE1109',
              loc: { offset: 18, line: 1, column: 19 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template><div id =',
          errors: [
            {
              type: 'VIBE1109',
              loc: { offset: 19, line: 1, column: 20 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: "<template><div id='abc",
          errors: [
            {
              type: 'VIBE1109',
              loc: { offset: 22, line: 1, column: 23 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template><div id="abc',
          errors: [
            {
              type: 'VIBE1109',
              loc: { offset: 22, line: 1, column: 23 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: "<template><div id='abc'",
          errors: [
            {
              type: 'VIBE1109',
              loc: { offset: 23, line: 1, column: 24 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template><div id="abc"',
          errors: [
            {
              type: 'VIBE1109',
              loc: { offset: 23, line: 1, column: 24 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template><div id=abc',
          errors: [
            {
              type: 'VIBE1109',
              loc: { offset: 21, line: 1, column: 22 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: "<template><div id='abc'/",
          errors: [
            {
              type: 'VIBE1122',
              loc: { offset: 23, line: 1, column: 24 },
            },
            {
              type: 'VIBE1109',
              loc: { offset: 24, line: 1, column: 25 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template><div id="abc"/',
          errors: [
            {
              type: 'VIBE1122',
              loc: { offset: 23, line: 1, column: 24 },
            },
            {
              type: 'VIBE1109',
              loc: { offset: 24, line: 1, column: 25 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<template><div id=abc /',
          errors: [
            {
              type: 'VIBE1122',
              loc: { offset: 22, line: 1, column: 23 },
            },
            {
              type: 'VIBE1109',
              loc: { offset: 23, line: 1, column: 24 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<div></div',
          errors: [
            {
              type: 'VIBE1109',
              loc: { offset: 10, line: 1, column: 11 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
      ],
      MISSING_ATTRIBUTE_VALUE: [
        {
          code: '<template><div id=></div></template>',
          errors: [
            {
              type: 'VIBE1113',
              loc: { offset: 18, line: 1, column: 19 },
            },
          ],
        },
        {
          code: '<template><div id= ></div></template>',
          errors: [
            {
              type: 'VIBE1113',
              loc: { offset: 19, line: 1, column: 20 },
            },
          ],
        },
        {
          code: '<template><div id= /></div></template>',
          errors: [],
        },
      ],
      MISSING_END_TAG_NAME: [
        {
          code: '<template></></template>',
          errors: [
            {
              type: 'VIBE1114',
              loc: { offset: 12, line: 1, column: 13 },
            },
          ],
        },
      ],
      UNEXPECTED_CHARACTER_IN_ATTRIBUTE_NAME: [
        {
          code: "<template><div a\"bc=''></div></template>",
          errors: [
            {
              type: 'VIBE1117',
              loc: { offset: 16, line: 1, column: 17 },
            },
          ],
        },
        {
          code: "<template><div a'bc=''></div></template>",
          errors: [
            {
              type: 'VIBE1117',
              loc: { offset: 16, line: 1, column: 17 },
            },
          ],
        },
        {
          code: "<template><div a<bc=''></div></template>",
          errors: [
            {
              type: 'VIBE1117',
              loc: { offset: 16, line: 1, column: 17 },
            },
          ],
        },
      ],
      UNEXPECTED_CHARACTER_IN_UNQUOTED_ATTRIBUTE_VALUE: [
        {
          code: '<template><div foo=bar"></div></template>',
          errors: [
            {
              type: 'VIBE1118',
              loc: { offset: 22, line: 1, column: 23 },
            },
          ],
        },
        {
          code: "<template><div foo=bar'></div></template>",
          errors: [
            {
              type: 'VIBE1118',
              loc: { offset: 22, line: 1, column: 23 },
            },
          ],
        },
        {
          code: '<template><div foo=bar<div></div></template>',
          errors: [
            {
              type: 'VIBE1118',
              loc: { offset: 22, line: 1, column: 23 },
            },
          ],
        },
        {
          code: '<template><div foo=bar=baz></div></template>',
          errors: [
            {
              type: 'VIBE1118',
              loc: { offset: 22, line: 1, column: 23 },
            },
          ],
        },
        {
          code: '<template><div foo=bar`></div></template>',
          errors: [
            {
              type: 'VIBE1118',
              loc: { offset: 22, line: 1, column: 23 },
            },
          ],
        },
      ],
      UNEXPECTED_EQUALS_SIGN_BEFORE_ATTRIBUTE_NAME: [
        {
          code: '<template><div =foo=bar></div></template>',
          errors: [
            {
              type: 'VIBE1119',
              loc: { offset: 15, line: 1, column: 16 },
            },
          ],
        },
        {
          code: '<template><div =></div></template>',
          errors: [
            {
              type: 'VIBE1119',
              loc: { offset: 15, line: 1, column: 16 },
            },
          ],
        },
      ],
      UNEXPECTED_QUESTION_MARK_INSTEAD_OF_TAG_NAME: [
        {
          code: '<template><?xml?></template>',
          errors: [
            {
              type: 'VIBE1121',
              loc: { offset: 11, line: 1, column: 12 },
            },
          ],
        },
      ],
      UNEXPECTED_SOLIDUS_IN_TAG: [
        {
          code: '<template><div a/b></div></template>',
          errors: [
            {
              type: 'VIBE1122',
              loc: { offset: 16, line: 1, column: 17 },
            },
          ],
        },
      ],
      X_INVALID_END_TAG: [
        {
          code: '<template></div></template>',
          errors: [
            {
              type: 'VIBE1123',
              loc: { offset: 10, line: 1, column: 11 },
            },
          ],
        },
        {
          code: '<template></div></div></template>',
          errors: [
            {
              type: 'VIBE1123',
              loc: { offset: 10, line: 1, column: 11 },
            },
            {
              type: 'VIBE1123',
              loc: { offset: 16, line: 1, column: 17 },
            },
          ],
        },
        {
          code: '<template>a </ b</template>',
          errors: [
            {
              type: 'VIBE1123',
              loc: { offset: 12, line: 1, column: 13 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: "<template>{{'</div>'}}</template>",
          errors: [],
        },
        {
          code: '<textarea></div></textarea>',
          errors: [],
        },
        {
          code: '<svg><![CDATA[</div>]]></svg>',
          errors: [],
        },
        {
          code: '<svg><!--</div>--></svg>',
          errors: [],
        },
      ],
      X_MISSING_END_TAG: [
        {
          code: '<template><div></template>',
          errors: [
            {
              type: 'VIBE1124',
              loc: { offset: 10, line: 1, column: 11 },
            },
          ],
        },
        {
          code: '<template><div>',
          errors: [
            {
              type: 'VIBE1124',
              loc: { offset: 10, line: 1, column: 11 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
      ],
      X_MISSING_INTERPOLATION_END: [
        {
          code: '{{ foo',
          errors: [
            {
              type: 'VIBE1125',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '{{',
          errors: [
            {
              type: 'VIBE1125',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '<div>{{ foo</div>',
          errors: [
            {
              type: 'VIBE1125',
              loc: { offset: 5, line: 1, column: 6 },
            },
            {
              type: 'VIBE1124',
              loc: { offset: 0, line: 1, column: 1 },
            },
          ],
        },
        {
          code: '{{}}',
          errors: [],
        },
      ],
      X_MISSING_DYNAMIC_DIRECTIVE_ARGUMENT_END: [
        {
          code: `<div v-foo:[sef fsef] />`,
          errors: [
            {
              type: 'VIBE1127',
              loc: { offset: 15, line: 1, column: 16 },
            },
          ],
        },
      ],
    };

    for (const key of Object.keys(patterns)) {
      describe(key, () => {
        for (const { code, errors } of patterns[key]) {
          test(
            code.replace(/[\r\n]/g, (c) => `\\x0${c.codePointAt(0)!.toString(16)};`),
            () => {
              const spy = vi.fn();
              baseParse(code, { onError: spy });

              expect(
                spy.mock.calls.map(([err]) => ({
                  type: err.code,
                  loc: err.loc.start,
                })),
              ).toMatchObject(errors);
            },
          );
        }
      });
    }
  });
});

// Not upstream: the HTML behaviour that the compiler-dom options bring in, and the fork's edits.
describe('additions', () => {
  const children = (input: string) => baseParse(input).children;
  const first = (input: string) => children(input)[0] as ElementNode;
  const text = (input: string) => (first(input).children[0] as TextNode).content;

  test('namespaces follow the HTML tree construction rules', () => {
    const ns = (input: string, path: number[]) => {
      let node = first(input);
      for (const i of path) node = node.children[i] as ElementNode;
      return [node.tag, node.ns];
    };
    expect(ns('<svg><g></g></svg>', [0])).toStrictEqual(['g', Namespaces.SVG]);
    expect(ns('<svg><foreignObject><p></p></foreignObject></svg>', [0, 0])).toStrictEqual([
      'p',
      Namespaces.HTML,
    ]);
    expect(ns('<svg><desc><b></b></desc><title><i></i></title></svg>', [1, 0])).toStrictEqual([
      'i',
      Namespaces.HTML,
    ]);
    expect(ns('<math><mi><b></b></mi><mglyph></mglyph></math>', [0, 0])).toStrictEqual([
      'b',
      Namespaces.HTML,
    ]);
    expect(ns('<math><mi><mglyph></mglyph></mi></math>', [0, 0])).toStrictEqual([
      'mglyph',
      Namespaces.MATH_ML,
    ]);
    expect(ns('<math><mrow><b></b></mrow></math>', [0, 0])).toStrictEqual([
      'b',
      Namespaces.MATH_ML,
    ]);
    expect(ns('<math><annotation-xml><svg></svg></annotation-xml></math>', [0, 0])).toStrictEqual([
      'svg',
      Namespaces.SVG,
    ]);
    expect(
      ns('<math><annotation-xml encoding="text/html"><p></p></annotation-xml></math>', [0, 0]),
    ).toStrictEqual(['p', Namespaces.HTML]);
    expect(
      ns(
        '<math><annotation-xml encoding="application/xhtml+xml"><p></p></annotation-xml></math>',
        [0, 0],
      ),
    ).toStrictEqual(['p', Namespaces.HTML]);
    expect(
      ns('<math><annotation-xml encoding="x" title><p></p></annotation-xml></math>', [0, 0]),
    ).toStrictEqual(['p', Namespaces.MATH_ML]);
  });

  test('CDATA and processing instructions are allowed in foreign content', () => {
    const onError = vi.fn();
    const [svg] = baseParse('<svg><![CDATA[a<b]]><?pi?></svg>', { onError }).children;
    expect(onError).not.toHaveBeenCalled();
    expect((svg as ElementNode).children).toMatchObject([{ type: NodeTypes.TEXT, content: 'a<b' }]);
  });

  test('entities are decoded in text, attribute values and RCDATA', () => {
    expect(text('<p>a&amp;b</p>')).toBe('a&b');
    const [id, value] = first(`<p id="x&lt;y" title=&amp;z></p>`).props as AttributeNode[];
    expect([id.value!.content, value.value!.content]).toStrictEqual(['x<y', '&z']);
    expect(first('<textarea>&lt;{{ a }}{b</textarea>').children).toMatchObject([
      { type: NodeTypes.TEXT, content: '<' },
      { type: NodeTypes.INTERPOLATION, content: { content: 'a' } },
      { type: NodeTypes.TEXT, content: '{b' },
    ]);
    expect(text('<title>&amp;</title>')).toBe('&');
  });

  test('CDATA and processing instructions are rejected at the root of a file', () => {
    const onError = vi.fn();
    baseParse('<![CDATA[x]]><?x?>', { parseMode: 'sfc', onError });
    expect(onError.mock.calls.map(([e]) => [e.code, e.loc.start.offset])).toStrictEqual([
      ['VIBE1101', 0],
      ['VIBE1121', 14],
    ]);
  });

  test('a foreign block at the root of a file ends XML mode when it closes', () => {
    const [, template] = baseParse('<svg></svg><template><textarea><b></b></textarea></template>', {
      parseMode: 'sfc',
    }).children as ElementNode[];
    expect((template.children[0] as ElementNode).children).toMatchObject([
      { type: NodeTypes.TEXT, content: '<b></b>' },
    ]);
  });

  test('a declaration or a bogus comment cut by the end of the input leaves its text', () => {
    const texts = (input: string) => children(input).map((n) => [n.type, n.loc.source]);
    expect(texts('<!xy')).toStrictEqual([[NodeTypes.TEXT, 'xy']]);
    expect(texts('</12')).toStrictEqual([[NodeTypes.TEXT, '12']]);
  });

  test('an entity cut by the end of the input stays text', () => {
    expect(text('<p>&am')).toBe('&am');
  });

  test('RCDATA ends only at its own end tag', () => {
    expect(text('<textarea></textareax></textarea>')).toBe('</textareax>');
    expect(text('<style></stylex></style>')).toBe('</stylex>');
  });

  test('a void end tag is ignored', () => {
    const onError = vi.fn();
    expect(baseParse('<br></br>', { onError }).children).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test('v-pre turns the directives before it into attributes', () => {
    const [a, b, c] = first('<div :a="x" @b=y v-if v-pre></div>').props as AttributeNode[];
    expect(
      [a, b, c].map((p) => [p.type, p.name, p.value?.content, p.value?.loc.source]),
    ).toStrictEqual([
      [NodeTypes.ATTRIBUTE, ':a', 'x', '"x"'],
      [NodeTypes.ATTRIBUTE, '@b', 'y', 'y'],
      [NodeTypes.ATTRIBUTE, 'v-if', undefined, undefined],
    ]);
  });

  test('directive arguments and modifiers inside v-pre are part of the attribute name', () => {
    const p = first('<div v-pre><p :a.b="c"></p></div>').children[0] as ElementNode;
    expect(p.props).toMatchObject([{ type: NodeTypes.ATTRIBUTE, name: ':a.b' }]);
    const div = first('<div v-pre:x.y></div>');
    expect(div.props).toStrictEqual([]);
  });

  test('a slot directive without an argument ignores modifiers', () => {
    expect(first('<C v-slot.x />').props).toMatchObject([
      { type: NodeTypes.DIRECTIVE, name: 'slot', arg: undefined, modifiers: [] },
    ]);
  });

  test('v-for aliases', () => {
    const aliases = (exp: string) => {
      const dir = first(`<p v-for="${exp}"></p>`).props[0] as DirectiveNode;
      const r = dir.forParseResult;
      return r && [r.source, r.value, r.key, r.index].map((e) => e?.loc.source);
    };
    expect(aliases('item in items')).toStrictEqual(['items', 'item', undefined, undefined]);
    expect(aliases('(item, key, index) of items')).toStrictEqual(['items', 'item', 'key', 'index']);
    expect(aliases('(item, , index) in items')).toStrictEqual([
      'items',
      'item',
      undefined,
      'index',
    ]);
    expect(aliases('(, key) in items')).toStrictEqual(['items', undefined, 'key', undefined]);
    expect(aliases('(item, key, ) in items')).toStrictEqual(['items', 'item', 'key', undefined]);
    expect(aliases('items')).toBeUndefined();
  });

  test('bogus comments and comments cut by the end of the input have exact locations', () => {
    const locs = (input: string) =>
      (children(input) as CommentNode[]).map((c) => [c.content, c.loc.source]);
    // `<!x>` is a declaration, which leaves no node.
    expect(locs('<!x><!xy></1></12><!-- a')).toStrictEqual([
      ['1', '</1>'],
      ['12', '</12>'],
      [' a', '<!-- a'],
    ]);
  });

  test('an input cut inside a v-pre start tag leaves no v-pre state behind', () => {
    const clean = '<div v-if="ok">{{ msg }}</div>';
    for (const cut of ['<div v-pre ', '<div v-pre x', '<div v-pre="', '<pre v-pre ']) {
      children(cut);
      const div = first(clean);
      expect(div.props.map((p) => [p.type, p.name])).toStrictEqual([[NodeTypes.DIRECTIVE, 'if']]);
      expect(div.children.map((c) => c.type)).toStrictEqual([NodeTypes.INTERPOLATION]);
    }
  });

  test('a blank interpolation has a zero-width content loc after its whitespace', () => {
    const locs = (input: string) => {
      const { content } = first(`<p>${input}</p>`).children[0] as InterpolationNode;
      return [content.content, content.loc.start.offset, content.loc.end.offset];
    };
    expect(locs('{{ }}')).toStrictEqual(['', 6, 6]);
    expect(locs('{{  }}')).toStrictEqual(['', 7, 7]);
    expect(locs('{{}}')).toStrictEqual(['', 5, 5]);
  });
});
