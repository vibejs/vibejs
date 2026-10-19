import { describe, expect, it } from 'vitest';
import { parseExpression, parseStatements, type Parsed } from './parse.ts';
import { walk } from './walk.ts';

const parsed = (code: string): Parsed => {
  const expression = parseExpression(code);
  const result = 'reason' in expression ? parseStatements(code) : expression;
  if ('reason' in result) throw new Error(result.reason);
  return result;
};

/** Each reference as `name`, with `:local` and `:write` flags, in walk order. */
function refs(code: string, bound: string[] = []): string[] {
  const out: string[] = [];
  walk(
    parsed(code).node,
    {
      ref: (id, { local, writeRoot }) =>
        out.push(id.name + (local ? ':local' : '') + (writeRoot ? ':write' : '')),
    },
    bound,
  );
  return out;
}

describe('walk', () => {
  it.each([
    [
      'a function and its parameters',
      'function f(a, { b }, [c] = [d]) { f; a; b; c }',
      ['d', 'f:local', 'a:local', 'b:local', 'c:local'],
    ],
    ['a named function expression', '(function g() { g })', ['g:local']],
    ['var in nested blocks', '() => { if (x) { var v = 1 } v }', ['x', 'v:local']],
    ['let in a block', '() => { { let v } v }', ['v']],
    [
      'a for head',
      '() => { for (let i = 0; i < n; i++) i; i }',
      ['i:local', 'n', 'i:local:write', 'i:local', 'i'],
    ],
    ['a for-of declaration', '() => { for (const x of xs) x }', ['xs', 'x:local']],
    ['a catch parameter', '() => { try {} catch ({ e }) { e } e }', ['e:local', 'e']],
    ['a catch without parameter', '() => { try {} catch { e } }', ['e']],
    ['a switch case', '() => { switch (d) { case t: let s; s } s }', ['d', 't', 's:local', 's']],
    ['a class declaration', '() => { class C extends B {} C }', ['B', 'C:local']],
    ['a class expression name', '(class K { m() { return K } })', ['K:local']],
    ['a static block', '(class { static { let s; s } })', ['s:local']],
    [
      'program declarations',
      'var v; let l; function f() {} v; l; f',
      ['v:local', 'l:local', 'f:local'],
    ],
  ])('binds %s', (_, code, expected) => {
    expect(refs(code)).toStrictEqual(expected);
  });

  it.each([
    ['non-computed members and keys', 'a.b[c]; ({ d: e, [f]: g })', ['a', 'c', 'e', 'f', 'g']],
    [
      'class members',
      '(class { [k] = v; static s = w; get g() { return x } })',
      ['k', 'v', 'w', 'x'],
    ],
    ['labels', 'l: for (;;) { break l; continue l }', []],
    ['meta properties', 'import.meta.url', []],
    ['type positions', '<T,>(x: T, y = <U>z): R => (x as A) satisfies B<C>', ['z', 'x:local']],
    ['TypeScript declarations', 'type T = A; interface I { a: B } enum E { X = Y }', []],
    ['instantiation expressions', 'f<A>', ['f']],
  ])('skips %s', (_, code, expected) => {
    expect(refs(code)).toStrictEqual(expected);
  });

  it.each([
    ['an assignment', 'a = b', ['a:write', 'b']],
    ['a member assignment', 'a.b.c += d[e]', ['a:write', 'd', 'e']],
    ['an update', 'a.b++', ['a:write']],
    ['an array pattern with a hole', '[, a, ...b] = c', ['a:write', 'b:write', 'c']],
    [
      'an object pattern',
      '({ a, b: [c], [k]: d = e } = f)',
      ['a:write', 'c:write', 'k', 'd:write', 'e', 'f'],
    ],
    ['a TypeScript wrapper', '(a as T).b = 1; c! = 2', ['a:write', 'c:write']],
    ['a for-in target', 'for (x in o);', ['x:write', 'o']],
    ['a call result', 'f().x = 1', ['f']],
  ])('marks the write root of %s', (_, code, expected) => {
    expect(refs(code)).toStrictEqual(expected);
  });

  it('treats outer names as local', () => {
    expect(refs('$event.x + y', ['$event'])).toStrictEqual(['$event:local', 'y']);
  });

  it('reports each declaration once and `this` only outside non-arrow functions', () => {
    const bound: string[] = [];
    const thisAt: number[] = [];
    const { node } = parsed('var a; let b; function f(c) { var d; this } () => this; this');
    walk(node, { ref() {}, bind: (id) => bound.push(id.name), this: (n) => thisAt.push(n.start) });
    expect(bound).toStrictEqual(['a', 'b', 'f', 'c', 'd']);
    expect(thisAt).toStrictEqual([50, 56]);
  });

  it('flags the value of a shorthand property', () => {
    const shorthands: string[] = [];
    walk(parsed('({ a, b: c, d = 1 } = { e })').node, {
      ref: (id, _, shorthand) => shorthand && shorthands.push(id.name),
    });
    expect(shorthands).toStrictEqual(['a', 'd', 'e']);
  });
});
