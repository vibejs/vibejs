// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/compiler-sfc/__tests__/compileScript/definePropsDestructure.spec.ts (MIT)
// Edits: the cases are rewritten for the compiled shape of this compiler: destructured props
// read `__props.x`, defaults become `_defaults` thunks, and props are declared by a type
// argument. Template expectations go through the script scope and `rewriteExpr` (`$props.x`).
// Errors assert VIBE codes instead of messages.
// Dropped, because the form is rejected or does not exist here:
// - runtime props declarations (array and object arguments): VIBE3101;
// - several declarators in one declaration, and `let` destructures: VIBE3004;
// - `withDefaults`: VIBE3006;
// - rest elements (inline and non-inline): VIBE3104;
// - computed keys, static or not: VIBE3108;
// - the production-mode runtime prop types and the default-type mismatch warning, which have no
//   runtime prop types to check here (the type checker reports a mismatched default).
import { describe, expect, it } from 'vitest';
import { rewrite } from '../../test/expr.ts';
import { analyzeCode, codesOf, compileCode } from '../../test/script.ts';

const bindingsOf = (code: string) =>
  Object.fromEntries([...analyzeCode(code).bindings].map(([name, b]) => [name, b.kind]));

describe('props destructure', () => {
  it('basic usage', () => {
    const code = `const { foo } = defineProps<{ foo: any }>()\nconsole.log(foo)`;
    const out = compileCode(code).code;
    expect(out).not.toMatch('const { foo } =');
    expect(out).toMatch('console.log(__props.foo)');
    expect(rewrite('{{ foo }}', analyzeCode(code).scope).code).toBe('$props.foo');
    expect(bindingsOf(code)).toStrictEqual({ foo: 'prop' });
  });

  it('multiple variable declarations', () => {
    expect(
      codesOf(`const bar = 'fish', { foo } = defineProps<{ foo: any }>(), hello = 'world'`),
    ).toStrictEqual(['VIBE3004']);
  });

  it('nested scope', () => {
    const code = `const { foo, bar } = defineProps<{ foo: any; bar: any }>()\nfunction test(foo) {\n  console.log(foo)\n  console.log(bar)\n}`;
    const out = compileCode(code).code;
    expect(out).not.toMatch('const { foo, bar } =');
    expect(out).toMatch('console.log(foo)');
    expect(out).toMatch('console.log(__props.bar)');
    expect(bindingsOf(code)).toStrictEqual({ foo: 'prop', bar: 'prop', test: 'const' });
  });

  it('for-of loop variable shadowing', () => {
    const out = compileCode(
      `interface Props {\n  msg: string;\n  input: string[];\n}\nconst { msg, input } = defineProps<Props>();\nfor (const msg of input) {\n  console.log('MESSAGE', msg);\n}\nconsole.log('NOT FAIL', { msg });`,
    ).code;
    expect(out).toMatch('for (const msg of __props.input)');
    expect(out).toMatch(`console.log('MESSAGE', msg)`);
    expect(out).toMatch(`console.log('NOT FAIL', { msg: __props.msg })`);
  });

  it('regular for loop variable shadowing', () => {
    const out = compileCode(
      `const { i, len } = defineProps<{ i: number; len: number }>();\nfor (let i = 0; i < len; i++) {\n  console.log('INDEX', i);\n}\nconsole.log('AFTER', { i });`,
    ).code;
    expect(out).toMatch('for (let i = 0; i < __props.len; i++)');
    expect(out).toMatch(`console.log('INDEX', i)`);
    expect(out).toMatch(`console.log('AFTER', { i: __props.i })`);
  });

  it('var declaration shadowing in nested block', () => {
    const out = compileCode(
      `const { foo = "a" } = defineProps<{ foo?: string }>();\nlet bar: string | undefined;\nfunction init() {\n  {\n    var foo = "b";\n  }\n  bar = foo;\n}\ninit();`,
    ).code;
    expect(out).toMatch('var foo = "b"');
    expect(out).toMatch('bar = foo');
    expect(out).not.toMatch('bar = __props.foo');
  });

  it('var declaration shadowing before declaration in nested block', () => {
    const out = compileCode(
      `const { foo = "a" } = defineProps<{ foo?: string }>();\nlet bar: string | undefined;\nfunction init() {\n  bar = foo;\n  {\n    var foo = "b";\n  }\n}\ninit();`,
    ).code;
    expect(out).toMatch('bar = foo');
    expect(out).toMatch('var foo = "b"');
    expect(out).not.toMatch('bar = __props.foo');
  });

  it('var declaration shadowing before declaration in for loop', () => {
    const out = compileCode(
      `const { foo = "a" } = defineProps<{ foo?: string }>();\nlet bar: string | undefined;\nfunction init() {\n  bar = foo;\n  for (var foo = "b"; false;) {}\n}\ninit();`,
    ).code;
    expect(out).toMatch('bar = foo');
    expect(out).toMatch('for (var foo = "b"; false;)');
    expect(out).not.toMatch('bar = __props.foo');
  });

  it('var declaration shadowing does not cross function scope', () => {
    const out = compileCode(
      `const { foo = "a" } = defineProps<{ foo?: string }>();\nlet bar: string | undefined;\nfunction init() {\n  function nested() {\n    {\n      var foo = "b";\n    }\n    return foo;\n  }\n  bar = foo;\n  nested();\n}\ninit();`,
    ).code;
    expect(out).toMatch('return foo');
    expect(out).toMatch('bar = __props.foo');
  });

  it('default values w/ runtime declaration', () => {
    expect(codesOf(`const { foo = 1, bar = {} } = defineProps(['foo', 'bar'])`)).toStrictEqual([
      'VIBE3102',
      'VIBE3101',
    ]);
  });

  it('default values w/ type declaration', () => {
    const { defaults } = compileCode(
      `const { foo = 1, bar = {}, func = () => {} } = defineProps<{ foo?: number, bar?: object, func?: () => any }>()`,
    );
    expect(defaults).toBe('{ foo: () => 1, bar: () => ({}), func: () => (() => {}) }');
  });

  it('default values w/ type declaration & key is string', () => {
    const code = `const { foo = 1, bar = 2, 'foo:bar': fooBar = 'foo-bar' } = defineProps<{\n  "foo": number // double-quoted string\n  'bar': number // single-quoted string\n  'foo:bar': string // single-quoted string containing symbols\n  "onUpdate:modelValue": (val: number) => void  // double-quoted string containing symbols\n}>()`;
    const out = compileCode(code);
    expect(out.propKeys).toStrictEqual(['foo', 'bar', 'foo:bar', 'onUpdate:modelValue']);
    expect(out.defaults).toBe(`{ foo: () => 1, bar: () => 2, "foo:bar": () => 'foo-bar' }`);
    const analysis = analyzeCode(code);
    expect([...analysis.propAliases]).toStrictEqual([['fooBar', 'foo:bar']]);
    expect(bindingsOf(code)).toStrictEqual({
      foo: 'prop',
      bar: 'prop',
      fooBar: 'prop-alias',
      'onUpdate:modelValue': 'prop',
    });
  });

  it('with TSInstantiationExpression', () => {
    const out = compileCode(
      `type Foo = <T extends string | number>(data: T) => void\nconst { value } = defineProps<{ value: Foo }>()\nconst foo = value<123>`,
    ).code;
    expect(out).toMatch('const foo = __props.value<123>');
  });

  it('aliasing', () => {
    const code = `const { foo: bar } = defineProps<{ foo: any }>()\nlet x = foo\nlet y = bar`;
    const out = compileCode(code).code;
    expect(out).not.toMatch('const { foo: bar } =');
    expect(out).toMatch('let x = foo');
    expect(out).toMatch('let y = __props.foo');
    expect(rewrite('{{ bar }}', analyzeCode(code).scope).code).toBe('$props.foo');
    expect(bindingsOf(code)).toStrictEqual({ bar: 'prop-alias', x: 'let', y: 'let' });
  });

  it('non-identifier prop names', () => {
    const code = `const { 'foo.bar': fooBar } = defineProps<{ 'foo.bar': Function }>()\nlet x = fooBar`;
    expect(compileCode(code).code).toMatch('x = __props["foo.bar"]');
    expect(bindingsOf(code)).toStrictEqual({ fooBar: 'prop-alias', x: 'let' });
  });

  it('rest spread', () => {
    expect(
      codesOf(`const { foo, bar, ...rest } = defineProps<{ foo: any; bar: any; baz: any }>()`),
    ).toStrictEqual(['VIBE3104']);
  });

  it('computed static key', () => {
    expect(codesOf(`const { ['foo']: foo } = defineProps<{ foo: any }>()`)).toStrictEqual([
      'VIBE3108',
    ]);
  });

  it('multi-variable declaration', () => {
    expect(codesOf(`const { item } = defineProps<{ item: any }>(),\n  a = 1;`)).toStrictEqual([
      'VIBE3004',
    ]);
    expect(codesOf(`const a = 1,\n  { item } = defineProps<{ item: any }>();`)).toStrictEqual([
      'VIBE3004',
    ]);
  });

  it('handle function parameters with same name as destructured props', () => {
    const out = compileCode(
      `const { value } = defineProps<{ value: any }>()\nfunction test(value) {\n  try {\n  } catch {\n  }\n}\nconsole.log(value)`,
    ).code;
    expect(out).toMatch('console.log(__props.value)');
  });

  it('defineProps/defineEmits in multi-variable declaration', () => {
    expect(
      codesOf(`const props = defineProps<{ item: any }>(),\n  emit = defineEmits<{ a: [] }>();`),
    ).toStrictEqual(['VIBE3004', 'VIBE3004']);
  });

  describe('errors', () => {
    it('should error on deep destructure', () => {
      expect(codesOf(`const { foo: [bar] } = defineProps<{ foo: any }>()`)).toStrictEqual([
        'VIBE3108',
      ]);
      expect(codesOf(`const { foo: { bar } } = defineProps<{ foo: any }>()`)).toStrictEqual([
        'VIBE3108',
      ]);
    });

    it('should error on computed key', () => {
      expect(codesOf(`const { [foo]: bar } = defineProps<{ foo: any }>()`)).toStrictEqual([
        'VIBE3108',
      ]);
    });

    it('should error when used with withDefaults', () => {
      expect(
        codesOf(`const { foo } = withDefaults(defineProps<{ foo: string }>(), { foo: 'foo' })`),
      ).toStrictEqual(['VIBE3006']);
    });

    it('should error if destructure reference local vars', () => {
      expect(
        codesOf(`let x = 1\nconst {\n  foo = () => x\n} = defineProps<{ foo?: () => number }>()`),
      ).toStrictEqual(['VIBE3105']);
    });

    it('should error if assignment to destructured prop binding', () => {
      expect(codesOf(`const { foo } = defineProps<{ foo: any }>()\nfoo = 'bar'`)).toStrictEqual([
        'VIBE3106',
      ]);
      expect(codesOf(`let { foo } = defineProps<{ foo: any }>()\nfoo = 'bar'`)).toStrictEqual([
        'VIBE3004',
      ]);
    });

    it.each([
      `import { watch } from '@vibejs-org/ui'\nconst { foo } = defineProps<{ foo: any }>()\nwatch(foo, () => {})`,
      `import { watch as w } from '@vibejs-org/ui'\nconst { foo } = defineProps<{ foo: any }>()\nw(foo, () => {})`,
      `import { toRef } from '@vibejs-org/ui'\nconst { foo } = defineProps<{ foo: any }>()\ntoRef(foo)`,
      `import { toRef as r } from '@vibejs-org/ui'\nconst { foo } = defineProps<{ foo: any }>()\nr(foo)`,
    ])('should error when passing destructured prop into certain methods: %s', (code) => {
      const [d] = analyzeCode(code, ['VIBE3107']).diagnostics;
      expect(d.message).toMatch('`foo` is a destructured prop passed directly to');
    });

    it('should not throw an error if the variable is not a props', () => {
      expect(
        codesOf(
          `import { watch } from '@vibejs-org/ui'\nconst { userId } = defineProps<{ userId: number }>()\nconst { error: e, info } = useRequest();\nwatch(e, () => {});\nwatch(info, () => {});\nwatch(() => userId, () => {});`,
        ),
      ).toStrictEqual([]);
    });
  });
});
