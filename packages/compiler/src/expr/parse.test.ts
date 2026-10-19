import { describe, expect, it } from 'vitest';
import { parseExpression, parseParams, parseStatements } from './parse.ts';

describe('parseExpression', () => {
  it('returns the expression with spans at prefix + content index', () => {
    const parsed = parseExpression('a + "😀"');
    expect(parsed).toMatchObject({
      kind: 'expression',
      prefix: 1,
      node: { type: 'BinaryExpression' },
    });
    expect(parsed).toMatchObject({ node: { start: 1, end: 1 + 'a + "😀"'.length } });
  });

  it.each([
    ['a b', 'Expected `,` or `)` but found `Identifier`', 2, 3],
    ['', 'Empty parenthesized expression', 0, 0],
    ['  ', 'Empty parenthesized expression', 0, 2],
    ["'a", 'Unterminated string', 0, 2],
    ['a /*', 'Unterminated multiline comment', 2, 4],
    ['a); (b', 'Expected a single expression', 0, 6],
    ['a); //', 'Expected a single expression', 0, 6],
  ])('fails on %j with the reason and the content range', (content, reason, start, end) => {
    expect(parseExpression(content)).toStrictEqual({ reason, start, end });
  });
});

describe('parseStatements', () => {
  it('parses a statement list without a wrapper', () => {
    expect(parseStatements('a(); b()')).toMatchObject({
      kind: 'statements',
      prefix: 0,
      node: { type: 'Program', body: [{}, {}] },
    });
  });

  it('fails with the reason of the first error', () => {
    expect(parseStatements('a b c')).toMatchObject({ start: 1, end: 1 });
  });
});

describe('parseParams', () => {
  it('returns the arrow function of the parameter list', () => {
    expect(parseParams('a, { b }')).toMatchObject({
      prefix: 1,
      node: { type: 'ArrowFunctionExpression', params: [{ name: 'a' }, { type: 'ObjectPattern' }] },
    });
  });

  it.each(['a) => (b', 'a) => {}, (b', 'a) => {}; (b'])(
    'rejects %j, which escapes the wrapper',
    (content) => {
      expect(parseParams(content)).toStrictEqual({
        reason: 'Expected a parameter list',
        start: 0,
        end: content.length,
      });
    },
  );

  it('fails on a syntax error', () => {
    expect(parseParams('{ a b }')).toMatchObject({ start: 4, end: 5 });
  });
});
