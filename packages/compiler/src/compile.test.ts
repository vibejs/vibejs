import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile } from './compile.ts';

const options = { filename: 'src/Card.vibe', id: '0a1b2c3d', dev: false };

/** The `_sfc` line of a compiled file without diagnostics. */
function sfcOf(source: string, dev = false): string {
  const { code, diagnostics } = compile(source, { ...options, dev });
  expect(diagnostics).toStrictEqual([]);
  return /^const _sfc = .*$/m.exec(code)![0];
}

const full = `<script setup lang="ts">
const { a = 1 } = defineProps<{ a?: number }>()
defineEmits<{ pick: [] }>()
</script>
<template><p>{{ a }}</p></template>
<style scoped>p { color: red }</style>
<style lang="scss">p { margin: 0 }</style>`;

describe('compile', () => {
  it('fills the _sfc keys in order, with name, __file and __hmrId in dev only', () => {
    expect(sfcOf(full)).toBe(
      'const _sfc = { __scopeId: "data-vb-0a1b2c3d", __propKeys: ["a"], __emits: ["pick"], __defaults: _defaults, setup: _setup, render: _render }',
    );
    expect(sfcOf(full, true)).toBe(
      'const _sfc = { name: "Card", __file: "src/Card.vibe", __hmrId: "0a1b2c3d", __scopeId: "data-vb-0a1b2c3d", __propKeys: ["a"], __emits: ["pick"], __defaults: _defaults, setup: _setup, render: _render }',
    );
  });

  it('compiles a todo list to setup bindings, prop reads, a model, a keyed loop and the module', () => {
    const source = readFileSync(
      new URL('../test/fixtures/template/todo-list/input.vibe', import.meta.url),
      'utf8',
    );
    const { code, diagnostics } = compile(source, options);
    expect(diagnostics).toStrictEqual([]);
    for (const fragment of [
      'return { emit, filter, visible }',
      '_toDisplayString($props.title)',
      '_toDisplayString($setup.visible.length)',
      '() => $setup.filter, ($event) => { $setup.filter = $event }, { trim: true })',
      '_createFor(() => $setup.visible, (_for0) => {',
      'todo: () => { const todo = _for0.value; return todo },',
      "onToggle: () => ($event) => { const todo = _for0.value; $setup.emit('toggle', todo.id) },",
      '}, (todo) => todo.id)',
      '\nexport default _sfc',
    ]) {
      expect(code).toContain(fragment);
    }
  });

  it('escapes the scope id', () => {
    const { code } = compile(full, { ...options, id: 'x"+1+"' });
    expect(code).toContain('__scopeId: "data-vb-x\\"+1+\\""');
  });

  it('keeps the name of defineOptions and inheritAttrs: false, and omits empty metadata', () => {
    const source = `<script setup lang="ts">
defineOptions({ name: 'Box', inheritAttrs: false })
</script>
<template><p></p></template>
<style>p { color: red }</style>`;
    expect(sfcOf(source)).toBe(
      'const _sfc = { name: "Box", inheritAttrs: false, setup: _setup, render: _render }',
    );
  });

  it('lists the style blocks', () => {
    expect(compile(full, options).styles).toStrictEqual([
      { index: 0, scoped: true, lang: 'css' },
      { index: 1, scoped: false, lang: 'scss' },
    ]);
  });

  it('compiles a file without <script setup> to a render-only module', () => {
    const { code, map } = compile('<template><p>Hi</p></template>', options);
    expect(code).toBe(
      [
        "import { template as _template } from '@vibejs-org/ui/internal'",
        'const _t0 = _template("<p>Hi</p>")',
        'function _render($setup: any, $props: any, $ctx: any) {',
        '  const _n0 = _t0()',
        '  return _n0',
        '}',
        'const _sfc = { render: _render }',
        'export default _sfc',
        '',
      ].join('\n'),
    );
    expect(map).toMatchObject({ version: 3, sources: ['src/Card.vibe'] });
  });

  it('imports nothing for an empty template', () => {
    expect(compile('<template></template>', options).code).toMatch(/^const _t|^function _render/);
  });

  it.each([
    ['parse', '<template><p></template>', 'VIBE1'],
    [
      'analysis',
      '<script setup lang="ts">\nconst x = defineProps(1)\n</script>\n<template></template>',
      'VIBE3',
    ],
    ['transform', '<template><Missing /></template>', 'VIBE2001'],
  ])('gives no code and no map after a %s diagnostic', (_, source, code) => {
    const result = compile(source, options);
    expect(result.code).toBe('');
    expect(result.map).toBeNull();
    expect(result.descriptor.source).toBe(source);
    expect(result.diagnostics[0].code.startsWith(code)).toBe(true);
    expect(Object.keys(result.diagnostics[0]).toSorted()).toStrictEqual(
      [
        'code',
        'docs',
        'end',
        'file',
        'fixes',
        'message',
        'start',
        ...(code === 'VIBE2001' ? ['typeChecked'] : []),
      ].toSorted(),
    );
    expect(result.diagnostics[0].file).toBe('src/Card.vibe');
  });

  it('sorts the diagnostics of every phase by offset', () => {
    const source =
      '<template><Missing /></template>\n<script setup lang="ts">\nconst x = defineProps(1)\n</script>';
    const offsets = compile(source, options).diagnostics.map((d) => d.start.offset);
    expect(offsets.length).toBeGreaterThan(1);
    expect(offsets).toStrictEqual(offsets.toSorted((a, b) => a - b));
  });
});
