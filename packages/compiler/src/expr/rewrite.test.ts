import { describe, expect, it } from 'vitest';
import { contextOf, rewrite, scopeOf, templateExpressions } from '../../test/expr.ts';
import { GLOBALS, isSimpleHandler } from './index.ts';
import { parseParams, type BindingKind } from './rewrite.ts';

const codes = (template: string, scope = scopeOf()) =>
  rewrite(template, scope).diagnostics.map((d) => d.code);

describe('rewriteExpr', () => {
  it.each<[BindingKind, string]>([
    ['prop', '$props.v'],
    ['prop-alias', '$props.value'],
    ['const', '$setup.v'],
    ['maybe-ref', '$setup.v'],
    ['let', '$setup.v'],
    ['import', 'v'],
  ])('rewrites a %s binding to %s', (kind, expected) => {
    const { code, diagnostics } = rewrite(`{{ v }}`, scopeOf({ v: kind }, [], { v: 'value' }));
    expect(diagnostics).toStrictEqual([]);
    expect(code).toBe(expected);
  });

  it.each([
    ['$attrs', '$ctx.attrs'],
    ['$slots', '$ctx.slots'],
    ['$emit', '$ctx.emit'],
    ['$props', '$props'],
  ])('rewrites %s to %s', (name, expected) => {
    expect(rewrite(`{{ ${name} }}`).code).toBe(expected);
    expect(codes(`{{ ${name} }}`)).toStrictEqual([]);
  });

  it.each([...GLOBALS])('keeps the global %s', (name) => {
    expect(rewrite(`{{ ${name} }}`)).toMatchObject({ code: name, diagnostics: [] });
  });

  it('prefers a binding over a global or a context name', () => {
    expect(rewrite(`{{ isNaN($attrs) }}`, scopeOf({ isNaN: 'const', $attrs: 'let' })).code).toBe(
      '$setup.isNaN($setup.$attrs)',
    );
  });

  it('keeps a template local, which shadows a binding', () => {
    const scope = scopeOf({ item: 'const' }, [['item']]);
    const { ir, code } = rewrite(`{{ item.name }}`, scope);
    expect(code).toBe('item.name');
    expect([...ir!.scopes]).toStrictEqual([scope.locals[0]]);
  });

  it.each([
    ['an arrow parameter', '(v) => v'],
    ['a block const', '() => { const v = 1; return v }'],
    ['a catch parameter', '() => { try {} catch (v) { v } }'],
  ])('keeps a name bound by %s', (_, exp) => {
    expect(rewrite(`{{ ${exp} }}`, scopeOf({ v: 'const' })).code).toBe(exp);
  });

  it.each([
    ['a literal', '{ v, w: 1 }', '{ v: $setup.v, w: 1 }'],
    ['an assignment pattern', '({ v } = o)', '({ v: $setup.v } = $setup.o)'],
    ['a pattern default', '({ v = 1 } = o)', '({ v: $setup.v = 1 } = $setup.o)'],
    ['a prop alias', '{ a }', '{ a: $props.value }'],
    ['a context name', '{ $slots }', '{ $slots: $ctx.slots }'],
    ['an import', '{ i }', '{ i }'],
    ['a local', '{ l }', '{ l }'],
  ])('expands a shorthand property in %s', (_, exp, expected) => {
    const scope = scopeOf({ v: 'let', o: 'const', a: 'prop-alias', i: 'import' }, [['l']], {
      a: 'value',
    });
    expect(rewrite(`{{ ${exp} }}`, scope)).toMatchObject({ code: expected, diagnostics: [] });
  });

  it('collects exactly the referenced template scopes, the innermost on a shadowed name', () => {
    const scope = scopeOf({}, [['a', 'x'], ['b'], ['c', 'x']]);
    const { ir } = rewrite(`{{ a + c + x }}`, scope);
    expect([...ir!.scopes]).toStrictEqual([scope.locals[0], scope.locals[2]]);
  });

  it.each([
    ['as', 'x as Foo', '$setup.x as Foo'],
    ['satisfies', 'x satisfies Foo<T>', '$setup.x satisfies Foo<T>'],
    ['a non-null assertion', 'x!.y', '$setup.x!.y'],
    ['type arguments', 'f<Foo>(x)', '$setup.f<Foo>($setup.x)'],
    ['an angle-bracket assertion', '<Foo>x', '<Foo>$setup.x'],
    [
      'an annotated arrow parameter',
      '(a: Foo, b?: Bar[]): Baz => a',
      '(a: Foo, b?: Bar[]): Baz => a',
    ],
  ])('keeps the type text of %s', (_, exp, expected) => {
    const { code, diagnostics } = rewrite(`{{ ${exp} }}`, scopeOf({ x: 'const', f: 'const' }));
    expect(diagnostics).toStrictEqual([]);
    expect(code).toBe(expected);
  });

  it.each([
    ['a', 'path'],
    ['a.b', 'path'],
    ["a['b']", 'path'],
    ['a.b?.c', 'path'],
    ['() => a', 'function'],
    ['function (e) { a(e) }', 'function'],
    ['a++', 'statements'],
    ['f($event)', 'statements'],
    ['a(); b()', 'statements'],
  ])('classifies the handler %j as %s', (exp, kind) => {
    const { ir, diagnostics } = rewrite(
      `<p @click="${exp}"></p>`,
      scopeOf({ a: 'const', b: 'const', f: 'const' }),
    );
    expect(diagnostics).toStrictEqual([]);
    expect(ir!.kind).toBe(kind);
    expect(isSimpleHandler(exp)).toBe(kind !== 'statements');
  });

  it('binds $event only in a statement handler', () => {
    expect(rewrite(`<p @click="f($event)"></p>`, scopeOf({ f: 'const' })).code).toBe(
      '$setup.f($event)',
    );
    expect(codes(`<p @click="$event"></p>`)).toStrictEqual(['VIBE2007']);
    expect(codes(`<p @click="() => $event"></p>`)).toStrictEqual(['VIBE2007']);
    expect(codes(`{{ $event }}`)).toStrictEqual(['VIBE2007']);
  });

  it('reports a handler that is neither an expression nor statements as VIBE1202', () => {
    const { ir, diagnostics } = rewrite(`<p @click="a b"></p>`);
    expect(ir).toBeNull();
    expect(diagnostics).toMatchObject([{ code: 'VIBE1202', typeChecked: true }]);
  });

  it.each([
    'this',
    'this.x',
    '() => this',
    ...'$el $refs $parent $root $options $data $nextTick $watch $forceUpdate'.split(' '),
  ])('reports %s as VIBE2008', (exp) => {
    const { code, diagnostics } = rewrite(`{{ ${exp} }}`);
    expect(code).toBe(exp);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'VIBE2008' });
    expect(diagnostics[0]).not.toHaveProperty('typeChecked');
  });

  it('allows `this` inside a nested function', () => {
    expect(codes(`{{ function () { return this } }}`)).toStrictEqual([]);
  });

  it.each(['($setup) => 1', '() => { let $props }', '() => { try {} catch ($ctx) {} }'])(
    'reports a reserved local in %s as VIBE2010',
    (exp) => {
      expect(codes(`{{ ${exp} }}`)).toStrictEqual(['VIBE2010']);
    },
  );

  it('keeps user text unmapped when the content has decoded entities', () => {
    const { ir, code } = rewrite(
      `<p :a="b &amp;&amp; c"></p>`,
      scopeOf({ b: 'const', c: 'const' }),
    );
    expect(code).toBe('$setup.b && $setup.c');
    expect(ir!.parts.every((p) => typeof p === 'string')).toBe(true);
  });
});

describe('VIBE2007 suggestions', () => {
  const scope = scopeOf({ count: 'maybe-ref' }, [['item']]);
  const fixes = (exp: string, unknown: string) => {
    const { diagnostics } = rewrite(`{{ ${exp} }}`, scope);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'VIBE2007',
      message: `\`${unknown}\` is not defined in the template.`,
      typeChecked: true,
    });
    return diagnostics[0].fixes;
  };

  it.each([
    ['cout', 'cout', 'count'],
    ['itme', 'itme', 'item'],
    ['$atrs', '$atrs', '$attrs'],
    ['Mth.max', 'Mth', 'Math'],
    ['(value) => valeu', 'valeu', 'value'],
  ])('suggests a name for %s', (exp, unknown, name) => {
    expect(fixes(exp, unknown)[0]).toBe(`Write \`${name}\`, the closest name in scope.`);
  });

  it('suggests nothing when no name is within edit distance 2', () => {
    const list = fixes('zzzzzz', 'zzzzzz');
    expect(list).toHaveLength(4);
    expect(list[0]).toBe('Fix the spelling of `zzzzzz`.');
  });
});

const params = (template: string) => {
  const source = `<template>${template}</template>`;
  const ctx = contextOf(source);
  const { directive } = templateExpressions(source)[0];
  const exp = directive!.name === 'for' ? directive!.forParseResult!.value! : directive!.exp!;
  return { local: parseParams(exp, ctx), codes: ctx.diagnostics.map((d) => d.code) };
};

describe('parseParams', () => {
  it('declares the bound names of a pattern, not its defaults or keys', () => {
    const result = params(`<C #default="{ item: [a, , b] = x, ...rest }"/>`);
    expect(result.codes).toStrictEqual([]);
    expect([...result.local!.names]).toStrictEqual(['a', 'b', 'rest']);
  });

  it.each(['_item', '$setup'])('reports %s as VIBE2010 and keeps it', (name) => {
    const result = params(`<p v-for="${name} in list"></p>`);
    expect(result.codes).toStrictEqual(['VIBE2010']);
    expect([...result.local!.names]).toStrictEqual([name]);
  });

  it('reports invalid parameters as VIBE1203', () => {
    expect(params(`<C #default="{ a b }"/>`)).toStrictEqual({ local: null, codes: ['VIBE1203'] });
  });
});
