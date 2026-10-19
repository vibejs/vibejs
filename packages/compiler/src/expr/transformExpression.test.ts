// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/compiler-core/__tests__/transforms/transformExpressions.spec.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Edits: each case runs `rewriteExpr` on one template expression (v-on values in handler mode)
// and compares the generated text in the render-parameter shape: setup bindings are
// `$setup.x`, props `$props.x`, globals and locals stay bare. Every name a case reads is a setup
// binding, so no case reports an unknown identifier. Compound-node children are compared as the
// joined text, and the location case as the mapped parts; whole-render snapshots are replaced by
// the rewritten handler text. An empty interpolation reports VIBE1201 instead of an empty node.
//
// Dropped cases, by category:
// - constant analysis (`constType`): floating point literals, strings with `()`, and the
//   constant bail-out of global calls (kept as a rewrite case);
// - parser plugins: the pipeline operator;
// - inline mode and `unref` binding metadata: inline mode, literal and reactive const handling
//   and their patch flags, and the inline `_isRef(x)` assignment (kept as a rewrite case);
// - options API bindings (`data`, `options`) and `this`, which are now VIBE2008.
import { describe, expect, test } from 'vitest';
import { rewrite, scopeOf } from '../../test/expr.ts';

const names = 'foo bar baz qux kuz arg x z obj a b c i list log error err length'.split(' ');
const setup = scopeOf(Object.fromEntries(names.map((n) => [n, 'maybe-ref'])));
const code = (template: string, nth = 0) => {
  const result = rewrite(template, setup, nth);
  expect(result.diagnostics).toStrictEqual([]);
  return result.code;
};

const handler = (body: string) => code(`<div @click="() => {${body}}"/>`);

describe('compiler: expression transform', () => {
  test('interpolation (root)', () => {
    expect(code(`{{ foo }}`)).toBe(`$setup.foo`);
  });

  test('empty interpolation', () => {
    for (const template of [`{{}}`, `{{ }}`, `<div>{{ }}</div>`]) {
      const { ir, diagnostics } = rewrite(template, setup);
      expect(ir).toBeNull();
      expect(diagnostics.map((d) => d.code)).toStrictEqual(['VIBE1201']);
    }
  });

  test('interpolation (children)', () => {
    expect(code(`<div>{{ foo }}</div>`)).toBe(`$setup.foo`);
  });

  test('interpolation (complex)', () => {
    expect(code(`<div>{{ foo + bar(baz.qux) }}</div>`)).toBe(
      `$setup.foo + $setup.bar($setup.baz.qux)`,
    );
  });

  test('directive value', () => {
    expect(code(`<div v-foo:arg="baz"/>`)).toBe(`$setup.baz`);
  });

  test('dynamic directive arg', () => {
    expect(code(`<div v-foo:[arg]="baz"/>`)).toBe(`$setup.arg`);
    expect(code(`<div v-foo:[arg]="baz"/>`, 1)).toBe(`$setup.baz`);
  });

  test('should prefix complex expressions', () => {
    const { ir } = rewrite(`{{ foo(baz + 1, { key: kuz }) }}`, setup);
    // Upstream offsets 3, 7 and 23, after the 10 characters of `<template>`.
    expect(ir!.parts).toStrictEqual([
      '$setup.',
      { code: 'foo', offset: 13 },
      { code: '(', offset: 16 },
      '$setup.',
      { code: 'baz', offset: 17 },
      { code: ' + 1, { key: ', offset: 20 },
      '$setup.',
      { code: 'kuz', offset: 33 },
      { code: ' })', offset: 36 },
    ]);
  });

  test('should not prefix whitelisted globals', () => {
    expect(code(`{{ Math.max(1, 2) }}`)).toBe(`Math.max(1, 2)`);
    expect(code(`{{ new Error() }}`)).toBe(`new Error()`);
  });

  test('should not prefix reserved literals', () => {
    for (const exp of ['true', 'false', 'null']) expect(code(`{{ ${exp} }}`)).toBe(exp);
  });

  test('should not prefix id of a function declaration', () => {
    expect(code(`{{ function foo() { return bar } }}`)).toBe(
      `function foo() { return $setup.bar }`,
    );
  });

  test('should not prefix params of a function expression', () => {
    expect(code(`{{ foo => foo + bar }}`)).toBe(`foo => foo + $setup.bar`);
  });

  test('should prefix default value of a function expression param', () => {
    expect(code(`{{ (foo = baz) => foo + bar }}`)).toBe(`(foo = $setup.baz) => foo + $setup.bar`);
  });

  test('should not prefix function param destructuring', () => {
    expect(code(`{{ ({ foo }) => foo + bar }}`)).toBe(`({ foo }) => foo + $setup.bar`);
  });

  test('function params should not affect out of scope identifiers', () => {
    expect(code(`{{ { a: foo => foo, b: foo } }}`)).toBe(`{ a: foo => foo, b: $setup.foo }`);
  });

  test('should prefix default value of function param destructuring', () => {
    expect(code(`{{ ({ foo = bar }) => foo + bar }}`)).toBe(
      `({ foo = $setup.bar }) => foo + $setup.bar`,
    );
  });

  test('should not prefix an object property key', () => {
    expect(code(`{{ { foo() { baz() }, value: bar } }}`)).toBe(
      `{ foo() { $setup.baz() }, value: $setup.bar }`,
    );
  });

  test('should not duplicate object key with same name as value', () => {
    expect(code(`{{ { foo: foo } }}`)).toBe(`{ foo: $setup.foo }`);
  });

  test('should prefix a computed object property key', () => {
    expect(code(`{{ { [foo]: bar } }}`)).toBe(`{ [$setup.foo]: $setup.bar }`);
  });

  test('should prefix object property shorthand value', () => {
    expect(code(`{{ { foo } }}`)).toBe(`{ foo: $setup.foo }`);
  });

  test('should not prefix id in a member expression', () => {
    expect(code(`{{ foo.bar.baz }}`)).toBe(`$setup.foo.bar.baz`);
  });

  test('should prefix computed id in a member expression', () => {
    expect(code(`{{ foo[bar][baz] }}`)).toBe(`$setup.foo[$setup.bar][$setup.baz]`);
  });

  test('should handle parse error', () => {
    const { ir, diagnostics } = rewrite(`{{ a( }}`, setup);
    expect(ir).toBeNull();
    expect(diagnostics).toMatchObject([{ code: 'VIBE1201' }]);
  });

  test('should not error', () => {
    expect(code(`<p :id="undefined /* force override the id */"/>`)).toBe(
      `undefined /* force override the id */`,
    );
  });

  test('should prefix in assignment', () => {
    expect(code(`{{ x = 1 }}`)).toBe(`$setup.x = 1`);
  });

  test('should prefix in assignment pattern', () => {
    expect(code(`{{ { x, y: [z] } = obj }}`)).toBe(`{ x: $setup.x, y: [$setup.z] } = $setup.obj`);
  });

  test('should keep globals in new and call expressions', () => {
    expect(code(`{{ new Date().getFullYear() }}`)).toBe(`new Date().getFullYear()`);
  });

  test('should not prefix temp variable of for...in', () => {
    expect(handler(` for (const x in list) { log(x) } error(x) `)).toBe(
      `() => { for (const x in $setup.list) { $setup.log(x) } $setup.error($setup.x) }`,
    );
  });

  test('should not prefix temp variable of for...of', () => {
    expect(handler(` for (const x of list) { log(x) } error(x) `)).toBe(
      `() => { for (const x of $setup.list) { $setup.log(x) } $setup.error($setup.x) }`,
    );
  });

  test('should not prefix temp variable of for loop', () => {
    expect(handler(` for (let i = 0; i < list.length; i++) { log(i) } error(i) `)).toBe(
      `() => { for (let i = 0; i < $setup.list.length; i++) { $setup.log(i) } $setup.error($setup.i) }`,
    );
  });

  test('should allow leak of var declarations in for loop', () => {
    expect(handler(` for (var i = 0; i < list.length; i++) { log(i) } error(i) `)).toBe(
      `() => { for (var i = 0; i < $setup.list.length; i++) { $setup.log(i) } $setup.error(i) }`,
    );
  });

  test('should not prefix catch block param', () => {
    expect(handler(` try {} catch (err) { console.error(err) } console.log(err) `)).toBe(
      `() => { try {} catch (err) { console.error(err) } console.log($setup.err) }`,
    );
  });

  test('should not prefix destructured catch block param', () => {
    expect(
      handler(
        ` try { throw new Error('sup?') } catch ({ message: { length } }) { console.error(length) } console.log(length) `,
      ),
    ).toBe(
      `() => { try { throw new Error('sup?') } catch ({ message: { length } }) { console.error(length) } console.log($setup.length) }`,
    );
  });

  describe('ES Proposals support', () => {
    test('bigInt', () => {
      expect(code(`{{ 13000n }}`)).toBe(`13000n`);
    });

    test('nullish coalescing', () => {
      expect(code(`{{ a ?? b }}`)).toBe(`$setup.a ?? $setup.b`);
    });

    test('optional chaining', () => {
      expect(code(`{{ a?.b?.c }}`)).toBe(`$setup.a?.b?.c`);
    });
  });

  describe('bindingMetadata', () => {
    const bindings = scopeOf({ props: 'prop', setup: 'maybe-ref', literal: 'const', isNaN: 'let' });

    test('non-inline mode', () => {
      const { code: out, diagnostics } = rewrite(`{{ [props, setup, isNaN, literal] }}`, bindings);
      expect(diagnostics).toStrictEqual([]);
      expect(out).toBe(`[$props.props, $setup.setup, $setup.isNaN, $setup.literal]`);
    });

    test('await expression in right hand of assignment', () => {
      const scope = scopeOf({ x: 'let', bar: 'const' });
      expect(rewrite(`{{ (async () => { x = await bar })() }}`, scope).code).toBe(
        `(async () => { $setup.x = await $setup.bar })()`,
      );
    });
  });

  describe('switch case variable declarations', () => {
    test('should handle const declarations in switch case without braces', () => {
      expect(
        code('{{ (() => { switch (1) { case 1: const foo = "bar"; return `${foo}`; } })() }}'),
      ).toBe('(() => { switch (1) { case 1: const foo = "bar"; return `${foo}`; } })()');
    });

    test('should handle const declarations in switch case with braces (existing behavior)', () => {
      expect(
        code(
          '{{ (() => { switch (true) { case true: { const foo = "bar"; return `${foo}`; } } })() }}',
        ),
      ).toBe('(() => { switch (true) { case true: { const foo = "bar"; return `${foo}`; } } })()');
    });

    test('should parse switch case test as local scoped variables', () => {
      expect(code('{{ (() => { switch (foo) { case bar: return `${bar}`; } })() }}')).toBe(
        '(() => { switch ($setup.foo) { case $setup.bar: return `${$setup.bar}`; } })()',
      );
    });
  });
});
