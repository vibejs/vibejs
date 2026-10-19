import { describe, expect, it } from 'vitest';
import { compileExpressions, scopeOf } from '../../test/expr.ts';
import type { Diagnostic } from '../diagnostics.ts';
import { parse } from '../sfc/parse.ts';

const range = (d: Diagnostic) => `${d.start.line}:${d.start.column}-${d.end.line}:${d.end.column}`;
const T = (content: string) => `<template>${content}</template>`;
const scope = scopeOf({ count: 'maybe-ref', list: 'const', f: 'const' });
const TYPE_CHECKED = new Set(['VIBE1201', 'VIBE1202', 'VIBE1203', 'VIBE2007']);

// [code, source, range]
const rows: [string, string, string][] = [
  ['VIBE1201', T('{{ count count }}'), '1:20-1:25'],
  ['VIBE1201', T('<p :a="count; f()"></p>'), '1:23-1:24'],
  ['VIBE1201', T('<p :a="f(\n  count"></p>'), '2:8-2:8'],
  ['VIBE1201', T('{{ "😀" + }}'), '1:20-1:20'],
  ['VIBE1201', T('{{ }}'), '1:14-1:14'],
  ['VIBE1201', T('<p v-for="x in list +"></p>'), '1:32-1:32'],
  ['VIBE1202', T('<p @click="count count"></p>'), '1:27-1:27'],
  ['VIBE1203', T('<p v-for="(a b) in list"></p>'), '1:24-1:25'],
  ['VIBE1203', T('<C #default="{ a b }"/>'), '1:28-1:29'],
  ['VIBE2007', T('{{ cout }}'), '1:14-1:18'],
  ['VIBE2007', T('<p @click="f($evnt)"></p>'), '1:24-1:29'],
  ['VIBE2007', T('{{ "😀" + cout }}'), '1:21-1:25'],
  ['VIBE2007', '<template>\r\n  {{ f(\r\n    cout) }}\r\n</template>', '3:5-3:9'],
  ['VIBE2008', T('{{ this.count }}'), '1:14-1:18'],
  ['VIBE2008', T('<p @click="$refs.x"></p>'), '1:22-1:27'],
  ['VIBE2010', T('<p v-for="(item, _i) in list"></p>'), '1:28-1:30'],
  ['VIBE2010', T('<C #default="{ $ctx }"/>'), '1:26-1:30'],
  ['VIBE2010', T('{{ ($props) => 1 }}'), '1:15-1:21'],
  [
    'VIBE2010',
    '<template>\r\n  <p :title="\'😀\'" v-for="_x in list"></p>\r\n</template>',
    '2:27-2:29',
  ],
];

describe('expression diagnostic locations', () => {
  it.each(rows)('%s in %j is reported at %s', (code, source, at) => {
    expect(parse(source, { filename: 'A.vibe' }).diagnostics).toStrictEqual([]);
    const diagnostics = compileExpressions(source, scope);
    expect(diagnostics.map((d) => `${d.code} ${range(d)}`)).toStrictEqual([`${code} ${at}`]);
    expect(diagnostics[0].typeChecked).toBe(TYPE_CHECKED.has(code) ? true : undefined);
  });
});
