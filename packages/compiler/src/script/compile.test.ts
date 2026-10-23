import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import { describe, expect, it } from 'vitest';
import { rewrite } from '../../test/expr.ts';
import { analyzeFile, compileCode, vibe } from '../../test/script.ts';
import { LineIndex } from '../diagnostics.ts';
import { compileScript } from './compile.ts';

type State = Record<string, unknown> & { read(): number; sum(): number };

/** The `_setup` function of a compiled script without imports. */
function setupOf(code: string): (props: object, ctx: object) => State {
  const js = stripTypeScriptTypes(compileCode(code).code);
  const setup: (props: object, ctx: object) => State = runInNewContext(`${js}\n_setup`);
  return setup;
}

/** The body of `_setup`, without its first and last lines. */
const bodyOf = (code: string) => {
  const out = compileCode(code).code;
  return out.slice(out.indexOf('{\n') + 2, out.lastIndexOf('\nreturn')).trim();
};

describe('compileScript', () => {
  it('hoists imports and type exports above _setup, in source order', () => {
    const { code } = compileCode(
      `const a = 1\nimport { ref } from '@usevibejs/ui'\nexport type T = string\nexport interface I {}\nexport type { U } from './u'\nimport type { V } from './v'\nconst b = ref(a)`,
    );
    expect(code).toBe(
      `import { ref } from '@usevibejs/ui'\nexport type T = string\nexport interface I {}\nexport type { U } from './u'\nimport type { V } from './v'\nfunction _setup(__props: any, __ctx: any) {\n\nconst a = 1\n\n\n\n\n\nconst b = ref(a)\n\nreturn { a, b }\n}\n`,
    );
  });

  it('removes the text outside the script', () => {
    const { descriptor, analysis } = analyzeFile(
      `<template><p></p></template>\n<script setup lang="ts">const a = 1</script>\n<style>p {}</style>`,
    );
    expect(compileScript(descriptor, analysis).s.toString()).toBe(
      `function _setup(__props: any, __ctx: any) {\nconst a = 1\nreturn { a }\n}\n`,
    );
  });

  it('has no setup without a script', () => {
    const { descriptor, analysis } = analyzeFile('<template><p></p></template>');
    const out = compileScript(descriptor, analysis);
    expect(out).toMatchObject({ hasSetup: false, propKeys: [], emits: [], defaults: null });
    expect(out.s.toString()).toBe('');
  });

  it('compiles an empty setup after a syntax error', () => {
    const { descriptor, analysis } = analyzeFile(vibe('const = 1'));
    expect(compileScript(descriptor, analysis).s.toString()).toBe(
      `function _setup(__props: any, __ctx: any) {\n\nreturn {  }\n}\n`,
    );
  });

  it.each([
    ['const props = defineProps<{ a: string }>()', 'const props = __props'],
    ['defineProps<{ a: string }>()', ''],
    ['const emit = defineEmits<{ a: [] }>()', 'const emit = __ctx.emit'],
    ['defineEmits<{ a: [] }>()', ''],
    ['const s = defineSlots<{ a(): unknown }>()', 'const s = __ctx.slots'],
    ['const m = defineModel<string>()', 'const m = _useModel(__props, "modelValue")'],
    [`const [t, mods] = defineModel('title')`, 'const [t, mods] = _useModel(__props, "title")'],
    ['defineExpose({ a: 1 })', '__ctx.expose({ a: 1 })'],
    [`defineOptions({ name: 'X' })`, ''],
    [`const o = defineOptions({ name: 'X' })`, 'const o = undefined'],
  ])('rewrites %s', (code, expected) => {
    expect(bodyOf(code)).toBe(expected);
  });

  it('returns every setup binding except props, aliases and imports', () => {
    const code = `import { ref } from '@usevibejs/ui'\nconst { a, c: cc } = defineProps<{ a: string; b: string; c: string }>()\nconst x = ref(1)\nfunction f() {}\nclass K {}\nconst emit = defineEmits<{ e: [] }>()\nconst m = defineModel()\nlet l = 1`;
    expect(compileCode(code).code).toMatch(
      'return { x, f, K, emit, m, get l() { return l }, set l(v) { l = v } }',
    );
  });

  it('writes a let binding through its accessor', () => {
    const setup = setupOf(`let count = 1\nconst read = () => count\nlet v = 0`);
    const state = setup({}, {});
    state.count = 5;
    expect(state.read()).toBe(5);
    expect(state.count).toBe(5);
    state.v = 2;
    expect(state.v).toBe(2);
  });

  it('reads destructured props from __props', () => {
    const setup = setupOf(
      `const { a, b: bb } = defineProps<{ a: number; b: number }>()\nconst sum = () => a + bb`,
    );
    const props = { a: 1, b: 2 };
    const state = setup(props, {});
    props.a = 10;
    expect(state.sum()).toBe(12);
  });

  it.each([
    ['a plain reference', 'f(a)', 'f(__props.a)'],
    ['an alias', 'f(cc)', 'f(__props.c)'],
    ['a key that is not an identifier', 'f(de)', 'f(__props["d-e"])'],
    ['a shorthand property', 'f({ a, cc })', 'f({ a: __props.a, cc: __props.c })'],
    ['an arrow parameter', 'const g = (a) => a + cc', 'const g = (a) => a + __props.c'],
    ['a block const', '{ const a = 1; f(a) }\nf(a)', '{ const a = 1; f(a) }\nf(__props.a)'],
    ['a catch parameter', 'try {} catch (a) { f(a) }', 'try {} catch (a) { f(a) }'],
    ['a function parameter', 'function g(a) { return a }', 'function g(a) { return a }'],
    [
      'a for-of binding',
      'for (const a of list) f(a)\nf({ a })',
      'for (const a of list) f(a)\nf({ a: __props.a })',
    ],
    [
      'a nested var',
      'function g() { { var a = 1 } return a }',
      'function g() { { var a = 1 } return a }',
    ],
    ['a member name', 'f(o.a, { a: 1 })', 'f(o.a, { a: 1 })'],
    ['a type position', 'let t: typeof a', 'let t: typeof a'],
    ['an instantiation expression', 'const g = a<number>', 'const g = __props.a<number>'],
    ['an exposed value', 'defineExpose({ a })', '__ctx.expose({ a: __props.a })'],
  ])('rewrites a destructured prop with %s', (_, code, expected) => {
    const props = `const { a, c: cc, 'd-e': de } = defineProps<{ a: any; c: number; 'd-e': number }>()\n`;
    expect(bodyOf(`${props}${code}`)).toBe(expected);
  });

  it('collects defaults as module-scope thunks', () => {
    const { code, defaults } = compileCode(
      `import { fallback } from './f'\nconst { a = 1, b = 'x', c = {}, d = (1, 2), e = fallback(), 'f-g': fg = null } = defineProps<{ a?: number; b?: string; c?: object; d?: number; e?: number; 'f-g'?: null }>()\nconst t = defineModel<string>('t', { default: () => '' })`,
    );
    expect(defaults).toBe(
      `{ a: () => 1, b: () => 'x', c: () => ({}), d: () => (1, 2), e: () => (fallback()), "f-g": () => null, t: () => '' }`,
    );
    expect(code).toMatch(
      `import { fallback } from './f'\nconst _defaults = ${defaults}\nfunction _setup(`,
    );
    const d: number = runInNewContext(`(${defaults}).d()`);
    expect(d).toBe(2);
  });

  it('lists prop keys, emits, options and runtime helpers', () => {
    const out = compileCode(
      `defineProps<{ a: string }>()\ndefineEmits<{ pick: [id: string] }>()\nconst m = defineModel()\ndefineOptions({ name: 'X', inheritAttrs: false })`,
    );
    expect(out).toMatchObject({
      propKeys: ['a', 'modelValue', 'modelValueModifiers'],
      emits: ['pick', 'update:modelValue'],
      defaults: null,
      options: { name: 'X', inheritAttrs: false },
      hasSetup: true,
    });
    expect([...out.abiImports]).toStrictEqual(['useModel']);
    expect([...compileCode('const a = 1').abiImports]).toStrictEqual([]);
  });

  it('maps hoisted, kept and rewritten identifiers back to the source', () => {
    const { s, code, source } = compileCode(
      `const { a } = defineProps<{ a: number }>()\nconst count = ref(a)\nimport { ref } from '@usevibejs/ui'`,
    );
    const map = new TraceMap({
      ...s.generateDecodedMap({ hires: 'boundary', source: 'A.vibe' }),
      version: 3,
    });
    const generated = new LineIndex(code);
    const lines = source.split('\n');
    /** The source text at the original position of `name` inside `needle` in the output. */
    const traced = (needle: string, name: string) => {
      const { line, column } = generated.position(code.indexOf(needle) + needle.indexOf(name));
      const at = originalPositionFor(map, { line, column: column - 1 });
      return lines[at.line! - 1].slice(at.column!, at.column! + name.length);
    };
    expect(traced('import { ref }', 'ref')).toBe('ref');
    expect(traced("'@usevibejs/ui'", '@usevibejs/ui')).toBe('@usevibejs/ui');
    expect(traced('const count', 'count')).toBe('count');
    expect(traced('ref(__props', 'ref')).toBe('ref');
    expect(traced('__props.a', 'a')).toBe('a');
  });

  it('gives template expressions the scope of the script', () => {
    const { analysis } = analyzeFile(
      vibe(
        `import { format } from './f'\nconst { a, c: cc } = defineProps<{ a: string; c: string; d: string }>()\nlet l = 1\nconst m = defineModel()`,
      ),
    );
    const { code, diagnostics } = rewrite(`{{ format(a, cc, d, l, m) }}`, analysis.scope);
    expect(diagnostics).toStrictEqual([]);
    expect(code).toBe('format($props.a, $props.c, $props.d, $setup.l, $setup.m)');
  });
});
