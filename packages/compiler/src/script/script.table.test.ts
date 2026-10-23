import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../diagnostics.ts';
import { parse } from '../sfc/parse.ts';
import { analyzeScript } from './analyze.ts';

const range = (d: Diagnostic) => `${d.start.line}:${d.start.column}-${d.end.line}:${d.end.column}`;
const S = (code: string) => `<template></template><script setup lang="ts">${code}</script>`;

// [code, source, range]
const rows: [string, string, string][] = [
  ['VIBE3001', S('export const a = 1'), '1:46-1:52'],
  ['VIBE3002', S('const a = await f()'), '1:56-1:61'],
  ['VIBE3002', S('for await (const x of y) {}'), '1:50-1:55'],
  ['VIBE3003', S('const = 1'), '1:52-1:53'],
  ['VIBE3004', S('f(defineProps<{ a: string }>())'), '1:48-1:59'],
  ['VIBE3005', S('defineEmits<{ a: [] }>()\ndefineEmits<{ b: [] }>()'), '2:1-2:12'],
  [
    'VIBE3006',
    S("const { a } = withDefaults(defineProps<{ a?: string }>(), { a: '' })"),
    '1:60-1:72',
  ],
  ['VIBE3007', S('const _createIf = 1'), '1:52-1:61'],
  ['VIBE3008', S("import { defineProps } from '@usevibejs/ui/tooling'"), '1:55-1:66'],
  ['VIBE3009', S('defineProps<{ a: string }>()\nconst a = 1'), '2:7-2:8'],
  ['VIBE3010', S("import fs = require('fs')"), '1:46-1:55'],
  ['VIBE3101', S("defineProps<{ a: string }>(['a'])"), '1:73-1:78'],
  ['VIBE3102', S('const emit = defineEmits()'), '1:59-1:70'],
  ['VIBE3103', S("import type { P } from './p'\nconst props = defineProps<P>()"), '2:27-2:28'],
  ['VIBE3104', S('const { a, ...rest } = defineProps<{ a: string }>()'), '1:57-1:64'],
  ['VIBE3105', S('const x = 1\nconst { a = x } = defineProps<{ a?: number }>()'), '2:13-2:14'],
  ['VIBE3106', S('const { a } = defineProps<{ a: number }>()\na++'), '2:1-2:2'],
  [
    'VIBE3107',
    S(
      "import { watch } from '@usevibejs/ui'\nconst { a } = defineProps<{ a: number }>()\nwatch(a, () => {})",
    ),
    '3:7-3:8',
  ],
  ['VIBE3108', S('const { a: { b } } = defineProps<{ a: { b: string } }>()'), '1:54-1:62'],
  ['VIBE3201', S("defineEmits<{ a: [] }>(['a'])"), '1:69-1:74'],
  ['VIBE3202', S('defineEmits<{ (e: "a"): void }>()'), '1:60-1:74'],
  ['VIBE3203', S("import type { E } from './e'\ndefineEmits<E>()"), '2:13-2:14'],
  ['VIBE3311', S('defineSlots<{ a(): unknown }>({})'), '1:76-1:78'],
  ['VIBE3321', S('defineModel()'), '1:46-1:57'],
  ['VIBE3322', S("const a = defineModel('a')\nconst b = defineModel('a')"), '2:23-2:26'],
  ['VIBE3331', S('defineOptions({ name: n })'), '1:60-1:71'],
  // UTF-16 columns after an emoji.
  [
    'VIBE3105',
    S("const x = 1\nconst { a = '😀' + x } = defineProps<{ a?: string }>()"),
    '2:20-2:21',
  ],
  // CRLF line ends.
  [
    'VIBE3106',
    '<template></template>\r\n<script setup lang="ts">\r\nconst { a } = defineProps<{ a: number }>()\r\nfunction f() {\r\n  a = 1\r\n}\r\n</script>\r\n',
    '5:3-5:4',
  ],
];

describe('script diagnostic locations', () => {
  it.each(rows)('%s in %j is reported at %s', (code, source, at) => {
    const { descriptor, diagnostics } = parse(source, { filename: 'A.vibe' });
    expect(diagnostics).toStrictEqual([]);
    const analysis = analyzeScript(descriptor);
    expect(analysis.diagnostics.map((d) => `${d.code} ${range(d)}`)).toStrictEqual([
      `${code} ${at}`,
    ]);
    expect(analysis.diagnostics[0].typeChecked).toBeUndefined();
  });
});
