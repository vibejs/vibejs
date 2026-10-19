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
    ['a), (b', 'Expected a single expression', 0, 6],
    ['a) || (b', 'Expected a single expression', 0, 8],
    ['a) => (b', 'Expected a single expression', 0, 8],
    ['f(await a)', '`await` cannot be used outside a function in a template', 2, 9],
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

  it.each([
    ['import x from "y"', '`import` and `export`', 0, 17],
    ['export {}', '`import` and `export`', 0, 9],
    ['export = x', '`import` and `export`', 0, 10],
    ['await using x = y', '`await`', 0, 17],
    ['(class { x = await a })', '`await`', 13, 20],
  ])('rejects the module syntax in %j', (content, what, start, end) => {
    const reason = `${what} cannot be used outside a function in a template`;
    expect(parseStatements(content)).toStrictEqual({ reason, start, end });
  });

  it('accepts `await` in an async function and `import.meta`', () => {
    expect(parseStatements('import.meta.url; async () => await a')).toMatchObject({
      kind: 'statements',
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
