import { describe, expect, it } from 'vitest';
import { analyzeCode, analyzeFile, vibe } from '../../test/script.ts';
import { analyzeScript, type BindingKind } from './analyze.ts';

/** The bindings of `code` as `name: kind`, each checked to slice to its name. */
function bindingsOf(code: string, codes: string[] = []): Record<string, BindingKind> {
  const source = vibe(code);
  const { analysis } = analyzeFile(source);
  expect(analysis.diagnostics.map((d) => d.code)).toStrictEqual(codes);
  const result: Record<string, BindingKind> = {};
  for (const [name, { kind, decl }] of analysis.bindings) {
    expect(source.slice(...decl).replace(/^['"]|['"]$/g, '')).toBe(name);
    result[name] = kind;
  }
  return result;
}

describe('bindings', () => {
  it.each<[string, string, Record<string, BindingKind>]>([
    [
      'functions, classes and enums',
      `function f() {}\nclass C {}\nenum E { A }\nconst enum K { A }`,
      { f: 'const', C: 'const', E: 'const', K: 'const' },
    ],
    [
      'a const with a literal',
      `const a = 1\nconst b = { x: 1 }\nconst c = () => 1`,
      { a: 'const', b: 'const', c: 'const' },
    ],
    [
      'a const with a call',
      `import { ref } from '@usevibejs/ui'\nconst a = ref(1)\nconst b = useThing()\nconst c = x.y()`,
      { ref: 'import', a: 'maybe-ref', b: 'maybe-ref', c: 'maybe-ref' },
    ],
    [
      'a call behind a type wrapper',
      `const a = ref(0) as Ref<number>\nconst b = ref(0)!\nconst c = f() satisfies T\nconst d = <T>f()\nconst e = reactive({}) as T`,
      { a: 'maybe-ref', b: 'maybe-ref', c: 'maybe-ref', d: 'maybe-ref', e: 'const' },
    ],
    [
      'a reactive const',
      `const a = reactive({})\nconst b = readonly({})\nconst c = shallowReactive({})`,
      { a: 'const', b: 'const', c: 'const' },
    ],
    [
      'a destructuring const',
      `const { a, b: [c] } = useThing()\nconst [d, ...e] = list`,
      { a: 'maybe-ref', c: 'maybe-ref', d: 'maybe-ref', e: 'maybe-ref' },
    ],
    ['let and var', `let a = 1\nvar b\nlet { c } = o`, { a: 'let', b: 'let', c: 'let' }],
    ['using declarations', `using a = r()`, { a: 'maybe-ref' }],
    [
      'value imports',
      `import d, { a, b as c } from './m'\nimport * as ns from './n'`,
      { d: 'import', a: 'import', c: 'import', ns: 'import' },
    ],
    [
      'type-only imports',
      `import type { A } from './a'\nimport { type B, c } from './b'\nimport type D from './d'`,
      { c: 'import' },
    ],
    [
      'types and declarations',
      `type T = string\ninterface I {}\ndeclare const x: number\ndeclare function g(): void\nfunction h(): void\nexport type U = T`,
      {},
    ],
    [
      'macro results',
      `const props = defineProps<{ a: string }>()\nconst emit = defineEmits<{ e: [] }>()\nconst slots = defineSlots<{ default(): unknown }>()\nconst m = defineModel()\nconst [t, mods] = defineModel('t')\nconst x = defineExpose({})\nconst o = defineOptions({})`,
      {
        props: 'const',
        a: 'prop',
        emit: 'const',
        slots: 'const',
        m: 'maybe-ref',
        t: 'maybe-ref',
        mods: 'maybe-ref',
        x: 'const',
        o: 'const',
      },
    ],
    [
      'destructured props',
      `const { a, b = 1, c: cc, 'd-e': de } = defineProps<{ a: string; b?: number; c: string; 'd-e': string; f: string }>()`,
      { a: 'prop', b: 'prop', cc: 'prop-alias', de: 'prop-alias', f: 'prop' },
    ],
  ])('%s', (_, code, expected) => {
    expect(bindingsOf(code)).toStrictEqual(expected);
  });

  it('lists the bindings in source order', () => {
    const code = `const x = 1\nconst { a } = defineProps<{ a: string }>()\nconst y = 2`;
    expect(Object.keys(bindingsOf(code))).toStrictEqual(['x', 'a', 'y']);
  });

  it('hoists an export whose specifiers are all types', () => {
    const { hoisted, bindings } = analyzeCode(`type T = 1\nexport { type T }`);
    expect(hoisted).toHaveLength(1);
    expect(bindings).toStrictEqual(new Map());
  });

  it('keeps the first declaration of a name', () => {
    const { bindings } = analyzeCode(`function f(): void\nfunction f() {}\nconst g = 1\nlet g = 2`);
    expect(bindings.get('g')!.kind).toBe('const');
  });

  it('gives template expressions the binding kinds and prop aliases', () => {
    const { scope } = analyzeCode(`const { a, c: cc } = defineProps<{ a: string; c: string }>()`);
    expect([...scope.bindings]).toStrictEqual([
      ['a', 'prop'],
      ['cc', 'prop-alias'],
    ]);
    expect([...scope.propAliases]).toStrictEqual([['cc', 'c']]);
    expect(scope.locals).toStrictEqual([]);
  });
});

describe('analyzeScript', () => {
  it('returns an empty analysis without a script', () => {
    const { descriptor } = analyzeFile('<template></template>');
    expect(analyzeScript(descriptor)).toStrictEqual({
      bindings: new Map(),
      propKeys: [],
      macros: { models: [] },
      templateRefs: [],
      importRanges: [],
      diagnostics: [],
    });
  });

  it('stops after a syntax error', () => {
    const { bindings, diagnostics } = analyzeCode(`const a = 1\nconst = 2`, ['VIBE3003']);
    expect(bindings).toStrictEqual(new Map());
    expect(diagnostics[0].message).toMatch(/^The script is not valid TypeScript: /);
  });

  it('collects template refs anywhere, with or without type arguments', () => {
    const source = vibe(
      `const a = useTemplateRef('a')\nfunction f() { return useTemplateRef<HTMLElement>("b") }\nuseTemplateRef(name)`,
    );
    const { analysis } = analyzeFile(source);
    expect(
      analysis.templateRefs.map((r) => [
        r.key,
        source.slice(...r.keyLoc),
        r.typeArgInsertAt && source.slice(r.typeArgInsertAt - 14, r.typeArgInsertAt + 1),
      ]),
    ).toStrictEqual([
      ['a', `'a'`, 'useTemplateRef('],
      ['b', `"b"`, null],
    ]);
  });

  it('reads defineOptions and the required flag of models', () => {
    const a = analyzeCode(
      `defineOptions({ name: 'X', 'inheritAttrs': false })\nconst m = defineModel<string>({ required: true })\nconst n = defineModel<string>('n', { required: false, default: () => '' })`,
    );
    expect(a.options).toStrictEqual({ name: 'X', inheritAttrs: false });
    expect(a.macros.models).toStrictEqual([
      { name: 'modelValue', binding: 'm', required: true },
      { name: 'n', binding: 'n', required: false },
    ]);
  });

  it.each([
    ['defineModel()', 'its result is not assigned', 'defineModel'],
    ['let m = defineModel()', 'its result is not assigned', 'defineModel'],
    ['const { a } = defineModel()', 'its result is not assigned', 'defineModel'],
    ['const [a, b, c] = defineModel()', 'its result is not assigned', 'defineModel'],
    ['const m = defineModel(name)', 'the model name is not a string literal', 'name'],
    [`const m = defineModel('a', {}, 1)`, 'it has more than a name', '1'],
    [`const m = defineModel('a', 1)`, 'the options are not an object literal', '1'],
    ['const m = defineModel({ get: () => 1 })', 'the options hold more', 'get: () => 1'],
    ['const m = defineModel({ required: x })', 'the options hold more', 'required: x'],
    ['const m = defineModel({ ...o })', 'the options hold more', '...o'],
    ['const m = defineModel({ default() {} })', 'the options hold more', 'default() {}'],
    ['const m = defineModel({ default: 0 })', 'a `default` function', 'default: 0'],
  ])('reports VIBE3321 for %s', (code, reason, at) => {
    const source = vibe(code);
    const [d] = analyzeFile(source).analysis.diagnostics;
    expect(d.code).toBe('VIBE3321');
    expect(d.message).toContain(reason);
    expect(source.slice(d.start.offset, d.end.offset)).toBe(at);
  });

  it.each([
    ['VIBE3108', 'const [a] = defineProps<{ a: string }>()', '[a]'],
    ['VIBE3331', 'defineOptions()', 'defineOptions'],
    ['VIBE3331', 'defineOptions({ ...o })', '{ ...o }'],
    ['VIBE3331', `defineOptions({ name() { return 'X' } })`, `{ name() { return 'X' } }`],
    ['VIBE3322', `defineProps<{ a: string }>()\nconst m = defineModel('a')`, `'a'`],
    ['VIBE3009', 'const cc = 1\nconst { c: cc } = defineProps<{ c: number }>()', 'cc'],
    ['VIBE3009', 'const { a: b } = defineProps<{ a: string; b: number }>()', 'b'],
    [
      'VIBE3322',
      'const m = defineModel()\nconst { modelValueModifiers } = defineProps<{ modelValueModifiers?: any }>()',
      'defineModel',
    ],
    ['VIBE3001', `type T = 1\nexport { type T, a }\nconst a = 1`, 'export'],
    ['VIBE3010', 'namespace N.M { export const x = 1 }', 'namespace N.M'],
    ['VIBE3010', 'import Q = N.x', 'import Q'],
  ])('reports %s for %s', (code, script, at) => {
    const source = vibe(script);
    const { diagnostics } = analyzeFile(source).analysis;
    expect(
      diagnostics.map((d) => [d.code, source.slice(d.start.offset, d.end.offset)]),
    ).toStrictEqual([[code, at]]);
  });

  it('ignores a default import of the runtime', () => {
    expect(
      analyzeCode(`import ui from '@usevibejs/ui'
ui(1)`).bindings.get('ui')!.kind,
    ).toBe('import');
  });
});
