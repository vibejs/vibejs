import {
  camelize,
  capitalize,
  forEachIdentifier,
  hyphenate,
  isAllowedGlobal,
  isSimpleHandler,
} from '@vibejs-org/compiler';
import { describe, expect, it } from 'vitest';

type Call = [name: string, start: number, end: number, local: boolean, writeRoot: boolean];

const calls = (expr: string, offset = 100): Call[] => {
  const out: Call[] = [];
  forEachIdentifier(expr, offset, (name, start, end, { local, writeRoot }) => {
    expect(expr.slice(start - offset, end - offset)).toBe(name);
    out.push([name, start, end, local, writeRoot]);
  });
  return out;
};

describe('forEachIdentifier', () => {
  it.each<[string, Call[]]>([
    [
      'a = b',
      [
        ['a', 100, 101, false, true],
        ['b', 104, 105, false, false],
      ],
    ],
    ['a.b++', [['a', 100, 101, false, true]]],
    [
      '[a, b] = c',
      [
        ['a', 101, 102, false, true],
        ['b', 104, 105, false, true],
        ['c', 109, 110, false, false],
      ],
    ],
    [
      '(x) => x + y',
      [
        ['x', 107, 108, true, false],
        ['y', 111, 112, false, false],
      ],
    ],
    ['{ a }', [['a', 102, 103, false, false]]],
    [
      'a(); let b = c; b',
      [
        ['a', 100, 101, false, false],
        ['c', 113, 114, false, false],
        ['b', 116, 117, true, false],
      ],
    ],
    ['"😀" + x as T', [['x', 107, 108, false, false]]],
  ])('reports %j in source order with file offsets', (expr, expected) => {
    expect(calls(expr)).toStrictEqual(expected);
  });

  it('reports a computed pattern key in source order', () => {
    expect(calls('({ [k]: a } = b)', 0).map(([name]) => name)).toStrictEqual(['k', 'a', 'b']);
  });

  it.each(['a +', 'a b', '{ a', ''])('calls nothing on %j', (expr) => {
    expect(calls(expr)).toStrictEqual([]);
  });
});

describe('helpers', () => {
  it.each([
    ['Math', true],
    ['console', true],
    ['undefined', true],
    ['window', false],
    ['require', false],
  ])('isAllowedGlobal(%j) is %s', (name, expected) => {
    expect(isAllowedGlobal(name)).toBe(expected);
  });

  it.each([
    ['a.b', true],
    ['(e) => a(e)', true],
    ['a()', false],
    ['a b', false],
  ])('isSimpleHandler(%j) is %s', (expr, expected) => {
    expect(isSimpleHandler(expr)).toBe(expected);
  });

  it.each([
    ['foo-bar', 'fooBar'],
    ['foo-bar-baz', 'fooBarBaz'],
    ['on-update:model-value', 'onUpdate:modelValue'],
    ['foo', 'foo'],
    ['', ''],
  ])('camelize(%j) is %j', (input, expected) => {
    expect(camelize(input)).toBe(expected);
  });

  it.each([
    ['fooBar', 'foo-bar'],
    ['fooBarBaz', 'foo-bar-baz'],
    ['FooBar', 'foo-bar'],
    ['onUpdate:modelValue', 'on-update:model-value'],
    ['foo', 'foo'],
  ])('hyphenate(%j) is %j', (input, expected) => {
    expect(hyphenate(input)).toBe(expected);
  });

  it.each([
    ['foo', 'Foo'],
    ['fooBar', 'FooBar'],
    ['Foo', 'Foo'],
    ['', ''],
  ])('capitalize(%j) is %j', (input, expected) => {
    expect(capitalize(input)).toBe(expected);
  });
});
