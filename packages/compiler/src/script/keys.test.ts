import { describe, expect, it } from 'vitest';
import { analyzeCode, codesOf } from '../../test/script.ts';

const keysOf = (code: string, codes: string[] = []) =>
  analyzeCode(code, codes).propKeys.map((key) => key.name);

describe('prop keys', () => {
  it.each([
    [
      'a destructure with an imported type',
      `import type { P } from './p'\nconst { a, b = 1 } = defineProps<P>()`,
      ['a', 'b'],
    ],
    [
      'a type literal',
      `defineProps<{ a: string; 'b-c'?: number; d(): void }>()`,
      ['a', 'b-c', 'd'],
    ],
    ['an interface', `interface P { a: string; b?: number }\ndefineProps<P>()`, ['a', 'b']],
    ['an interface declared below', `defineProps<P>()\ninterface P { a: string }`, ['a']],
    [
      'an interface that extends in-file interfaces',
      `interface A { a: string }\ninterface B extends A { b: string }\ninterface C extends A { c: string }\ninterface P extends B, C { p: string }\ndefineProps<P>()`,
      ['p', 'b', 'a', 'c'],
    ],
    [
      'merged interfaces',
      `interface P { a: string }\ninterface P { b: string }\ndefineProps<P>()`,
      ['a', 'b'],
    ],
    ['an alias', `type P = { a: string }\ntype Q = P\ndefineProps<Q>()`, ['a']],
    ['an exported alias', `export type P = { a: string }\ndefineProps<P>()`, ['a']],
    ['an exported interface', `export interface P { a: string }\ndefineProps<P>()`, ['a']],
    [
      'an intersection',
      `type A = { a: string }\ndefineProps<A & { b: number; a: string }>()`,
      ['a', 'b'],
    ],
    [
      'a union',
      `type A = { a: string; k: 1 }\ntype B = { b: string; k: 2 }\ndefineProps<A | B>()`,
      ['a', 'k', 'b'],
    ],
    ['Partial', `type A = { a: string }\ndefineProps<Partial<A>>()`, ['a']],
    ['Required', `type A = { a?: string }\ndefineProps<Required<A>>()`, ['a']],
    ['Readonly', `type A = { a: string }\ndefineProps<Readonly<A>>()`, ['a']],
    [
      'Pick',
      `interface A { a: string; b: string; c: string }\ndefineProps<Pick<A, 'a' | 'c'>>()`,
      ['a', 'c'],
    ],
    [
      'Omit',
      `interface A { a: string; b: string; c: string }\ndefineProps<Omit<A, 'b'>>()`,
      ['a', 'c'],
    ],
    ['a parenthesized type', `defineProps<({ a: string })>()`, ['a']],
    ['a destructure that adds a key', `const { a, z } = defineProps<{ a: string }>()`, ['a', 'z']],
  ])('reads %s', (_, code, expected) => {
    expect(keysOf(code)).toStrictEqual(expected);
  });

  it.each([
    ['an imported type', `import type { P } from './p'\nconst props = defineProps<P>()`],
    ['a generic in-file type', `type P<T> = { a: T }\ndefineProps<P<string>>()`],
    ['an index signature', `defineProps<{ [key: string]: string }>()`],
    ['a computed key', `const k = 'a'\ndefineProps<{ [k]: string }>()`],
    ['a call signature', `defineProps<{ (): void }>()`],
    [
      'an imported base interface',
      `import type { B } from './b'\ninterface P extends B { a: string }\ndefineProps<P>()`,
    ],
    ['a namespaced type', `defineProps<NS.P>()`],
    ['Pick with a non-literal key', `type A = { a: string }\ndefineProps<Pick<A, keyof A>>()`],
    ['a mapped type', `defineProps<{ [K in 'a']: string }>()`],
    ['a circular alias', `type A = B\ntype B = A\ndefineProps<A>()`],
  ])('reports VIBE3103 for %s', (_, code) => {
    expect(keysOf(code, ['VIBE3103'])).toStrictEqual([]);
  });

  it('adds models with their modifiers key', () => {
    const code = `defineProps<{ a: string }>()\nconst m = defineModel<string>()\nconst t = defineModel<string>('title')`;
    expect(keysOf(code)).toStrictEqual([
      'a',
      'modelValue',
      'modelValueModifiers',
      'title',
      'titleModifiers',
    ]);
  });
});

describe('emit keys', () => {
  it.each([
    [
      'a type literal',
      `defineEmits<{ pick: [id: string]; 'a:b': []; close: [] }>()`,
      ['pick', 'a:b', 'close'],
    ],
    ['an interface', `interface E { pick: [string] }\ndefineEmits<E>()`, ['pick']],
    [
      'merged interfaces',
      `interface E { a: [] }\ninterface E { b: [] }\ndefineEmits<E>()`,
      ['a', 'b'],
    ],
    ['an alias of an alias', `type E = { a: [] }\ntype F = E\ndefineEmits<F>()`, ['a']],
  ])('reads %s', (_, code, expected) => {
    expect(analyzeCode(code).emits).toStrictEqual(expected);
  });

  it('adds update events of the models', () => {
    const code = `defineEmits<{ a: [] }>()\nconst m = defineModel()\nconst t = defineModel('title')`;
    expect(analyzeCode(code).emits).toStrictEqual(['a', 'update:modelValue', 'update:title']);
  });

  it.each([
    ['a call signature', `defineEmits<{ (e: 'a'): void }>()`, `(e: 'a'): void`],
    ['a method signature', `defineEmits<{ a(): void }>()`, `a(): void`],
    ['a non-tuple value', `defineEmits<{ a: string }>()`, `a: string`],
    ['a member without a type', `defineEmits<{ a }>()`, `a`],
    ['a computed key', `defineEmits<{ [k]: [] }>()`, `[k]: []`],
    ['a union', `defineEmits<{ a: [] } | { b: [] }>()`, `{ a: [] } | { b: [] }`],
    [
      'an interface with extends',
      `interface A { a: [] }\ninterface E extends A {}\ndefineEmits<E>()`,
      `interface E extends A {}`,
    ],
    ['a circular alias', `type E = F\ntype F = E\ndefineEmits<E>()`, `E`],
    [
      'an alias of a call signature',
      `type E = { (e: 'a'): void }\ndefineEmits<E>()`,
      `(e: 'a'): void`,
    ],
  ])('reports VIBE3202 at %s', (_, code, at) => {
    const source = analyzeCode(code, ['VIBE3202']);
    const [d] = source.diagnostics;
    expect(code.includes(at)).toBe(true);
    expect(d.end.offset - d.start.offset).toBe(at.length);
  });

  it.each([
    ['an imported type', `import type { E } from './e'\ndefineEmits<E>()`],
    ['a generic in-file type', `type E<T> = { a: [T] }\ndefineEmits<E<string>>()`],
    ['an alias of an imported type', `import type { F } from './f'\ntype E = F\ndefineEmits<E>()`],
  ])('reports VIBE3203 for %s', (_, code) => {
    expect(codesOf(code)).toStrictEqual(['VIBE3203']);
  });
});
