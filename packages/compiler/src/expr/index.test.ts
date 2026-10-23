import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  camelize,
  capitalize,
  forEachIdentifier,
  hyphenate,
  identifiersOf,
  isAllowedGlobal,
  isSimpleHandler,
  NodeTypes,
  parse,
} from '@usevibejs/compiler';
import { parseSync } from 'oxc-parser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('oxc-parser', async (original) => {
  const oxc = await original<typeof import('oxc-parser')>();
  return { ...oxc, parseSync: vi.fn<typeof oxc.parseSync>(oxc.parseSync) };
});

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

  it.each(['a +', 'a b', '{ a', '', 'a), (b'])('calls nothing on %j', (expr) => {
    expect(calls(expr)).toStrictEqual([]);
  });
});

/** What `forEachIdentifier(text, 0, cb)` reports, as `identifiersOf` lists it. */
const alone = (text: string) => {
  const refs: unknown[] = [];
  forEachIdentifier(text, 0, (...ref) => refs.push(ref));
  return refs;
};

/** Every expression text of the `.vibe` files under `dir`, relative to this package. */
function expressionTexts(dir: string): string[] {
  const root = fileURLToPath(new URL(`../../${dir}`, import.meta.url));
  const texts = new Set<string>();
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    if ('type' in node && node.type === NodeTypes.SIMPLE_EXPRESSION && 'content' in node) {
      texts.add(String(node.content));
    }
    for (const value of Object.values(node)) visit(value);
  };
  for (const file of globSync('**/*.vibe', { cwd: root })) {
    const source = readFileSync(`${root}/${file}`, 'utf8');
    visit(parse(source, { filename: file }).descriptor.template?.ast);
  }
  return [...texts];
}

describe('identifiersOf', () => {
  beforeEach(() => {
    vi.mocked(parseSync).mockClear();
  });

  const texts = [
    'test/fixtures',
    'test/behavior',
    '../language-tools/test/fixtures/codegen',
    '../language-tools/test/fixtures/typecheck',
  ]
    .flatMap(expressionTexts)
    .flatMap((t) => [t, `(${t}) = 0`, `[${t}] = []`]);

  it('reports each fixture expression text, in all three forms, as forEachIdentifier does', () => {
    expect(texts.length).toBeGreaterThan(1000);
    const expected = texts.map(alone);
    expect(identifiersOf(texts)).toStrictEqual(expected);
    for (const [i, text] of texts.entries())
      expect(identifiersOf([text])[0]).toStrictEqual(expected[i]);
  });

  it('parses a batch of expressions once', () => {
    const refs = identifiersOf(['a.b', 'f(x) + y', '{ a, b: c }', 'item => item.id']);
    expect(parseSync).toHaveBeenCalledOnce();
    expect(refs.map((list) => list.map(([name, start]) => `${name}@${start}`))).toStrictEqual([
      ['a@0'],
      ['f@0', 'x@2', 'y@7'],
      ['a@2', 'c@8'],
      ['item@8'],
    ]);
  });

  it('parses a batch once when a text ends in a line comment', () => {
    const batch = ['a // b', ...Array.from({ length: 50 }, (_, i) => `x${i}`)];
    const expected = batch.map(alone);
    vi.mocked(parseSync).mockClear();
    expect(identifiersOf(batch)).toStrictEqual(expected);
    expect(parseSync).toHaveBeenCalledOnce();
  });

  it('returns nothing for no texts', () => {
    expect(identifiersOf([])).toStrictEqual([]);
    expect(parseSync).not.toHaveBeenCalled();
  });

  it.each([
    ['an unparsable text', 'a +'],
    ['a statement list', 'a++; b(c)'],
    ['a trailing line comment', 'a // b'],
    ['a text that escapes its wrapper', 'a), (b'],
    ['a text that closes its statement', 'a); (b'],
    ['an unclosed template literal', 'a + `b'],
    ['`await`', 'await a'],
    ['an `import`', 'a); import b from "c"; (d'],
    ['`import.meta`', 'import.meta.url'],
    ['an HTML comment', 'a <!-- b'],
    ['an empty text', ''],
  ])('keeps the other results with %s in the batch', (_, odd) => {
    const batch = ['a', odd, 'b.c(d)', `[${odd}] = []`, 'e = f', `(${odd}) = 0`, '`${g}`'];
    expect(identifiersOf(batch)).toStrictEqual(batch.map(alone));
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
    ['a) => (b', false],
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
