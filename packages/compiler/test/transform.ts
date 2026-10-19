import { expect } from 'vitest';
import type { Diagnostic } from '../src/diagnostics.ts';
import type { ExprIR, ExprPart } from '../src/expr/rewrite.ts';
import { analyze } from '../src/script/analyze.ts';
import { parse } from '../src/sfc/parse.ts';
import { transform } from '../src/transform/index.ts';
import type { ArgIR, BlockIR, HandlerIR, PropIR, RootIR, SpreadIR } from '../src/transform/ir.ts';

/** The script of the transform tests: one binding of each kind. */
const SCRIPT = `import { ref, useTemplateRef } from '@vibejs-org/ui'
import Item from './Item.vibe'
import * as Form from './form.ts'
const { label, size: sz, Slot: Aliased } = defineProps<{ label: string; size: number; Slot: object; Other: object }>()
const text = ref('')
const items = ref([{ id: 1, done: false }])
const box = useTemplateRef('box')
const fixed = { a: 1 }
const Local = {}
let count = 0`;

/** A file whose first line is `<template>${template}</template>`. */
export const sfc = (template: string, style = ''): string =>
  `<template>${template}</template>\n<script setup lang="ts">\n${SCRIPT}\n</script>\n${style}`;

/** Parses, analyzes and transforms `source`; every diagnostic of the three steps is returned. */
export function run(
  source: string,
  filename = 'src/List.vibe',
): { ir: RootIR | null; diagnostics: Diagnostic[] } {
  const parsed = parse(source, { filename });
  const analysis = analyze(parsed.descriptor);
  const out = transform(parsed.descriptor, analysis, { id: '0a1b2c3d' });
  return {
    ir: out.ir,
    diagnostics: [...parsed.diagnostics, ...analysis.diagnostics, ...out.diagnostics],
  };
}

/** Transforms `<template>${template}</template>` and expects no diagnostics. */
export function ir(template: string, style = ''): RootIR {
  const out = run(sfc(template, style));
  expect(out.diagnostics.map((d) => `${d.code} ${d.message}`)).toStrictEqual([]);
  return out.ir!;
}

/** The generated text of an expression. */
const code = (e: ExprIR): string =>
  e.parts.map((p: ExprPart) => (typeof p === 'string' ? p : p.code)).join('');

const expr = (e: ExprIR): string => {
  const scopes = [...e.scopes].map((s) => [...s.names].join(','));
  return scopes.length > 0 ? `${code(e)} @${scopes.join('|')}` : code(e);
};

const handlerText = (h: HandlerIR): string =>
  [
    `${h.expr.kind}(${expr(h.expr)})`,
    ...(h.mods.length > 0 ? [`mods=${h.mods.join(',')}`] : []),
    ...(h.keys.length > 0 ? [`keys=${h.keys.join(',')}`] : []),
    ...(Object.keys(h.options).length > 0 ? [`options=${Object.keys(h.options).join(',')}`] : []),
  ].join(' ');

const argText = (a: ArgIR): string => {
  if ('ref' in a) return `n${a.ref}`;
  if ('expr' in a) return expr(a.expr);
  if ('getter' in a) return `() => ${expr(a.getter)}`;
  if ('handler' in a) return handlerText(a.handler);
  if ('object' in a) {
    return `{ ${Object.entries(a.object)
      .map(([k, v]) => `${k}: ${argText(v)}`)
      .join(', ')} }`;
  }
  return JSON.stringify(a.value);
};

const propText = ({ key, value }: PropIR): string => {
  if (typeof value === 'string') return `${key}=${JSON.stringify(value)}`;
  if (value === true) return key;
  return `${key}=${'mods' in value ? handlerText(value) : expr(value)}`;
};

const propsText = (props: PropIR[], spread: SpreadIR | null): string =>
  spread
    ? `spread ${spread.map((g) => (Array.isArray(g) ? `[${g.map(propText).join(' ')}]` : `(${expr(g)})`)).join(' ')}`
    : props.map(propText).join(' ');

function blockText(b: BlockIR, indent: string, lines: string[]): void {
  const line = (text: string) => lines.push(`${indent}${text}`);
  for (const op of b.ops) {
    if (op.op === 'tpl') line(`n${op.id} = t${op.tpl}`);
    else if (op.op === 'walk') line(`n${op.id} = n${op.from}.${op.steps.join('.')}`);
    else if (op.op === 'effect')
      line(`effect ${op.call.fn}(${op.call.args.map(argText).join(', ')})`);
    else if (op.op === 'once') line(`${op.call.fn}(${op.call.args.map(argText).join(', ')})`);
    else if (op.op === 'insert') line(`insert n${op.id} into n${op.parent} before n${op.anchor}`);
    else {
      const m = op.make;
      const at = op.parent === null ? '' : ` in n${op.parent} before n${op.anchor}`;
      const inner = `${indent}    `;
      if (m.k === 'if') {
        line(`n${op.id} = if${at}`);
        for (const br of m.branches) {
          lines.push(`${indent}  ${br.test ? `if ${expr(br.test)}` : 'else'}`);
          blockText(br.block, inner, lines);
        }
      } else if (m.k === 'for') {
        const params = m.params.map((p) => (p === null ? '-' : typeof p === 'string' ? p : p.code));
        const key = m.key ? expr(m.key) : '-';
        line(`n${op.id} = for ${expr(m.source)} as ${params.join(',')} key ${key}${at}`);
        blockText(m.block, `${indent}  `, lines);
      } else if (m.k === 'keyed') {
        line(`n${op.id} = keyed ${expr(m.key)}${at}`);
        blockText(m.block, `${indent}  `, lines);
      } else if (m.k === 'component') {
        const is = typeof m.is === 'string' ? m.is : `(${expr(m.is)})`;
        const single = m.singleRoot ? ' single' : '';
        line(`n${op.id} = component ${is}${single}${at} ${propsText(m.props, m.spread)}`.trimEnd());
        for (const slot of m.slots) {
          const params =
            slot.params === null
              ? ''
              : typeof slot.params === 'string'
                ? slot.params
                : slot.params.code;
          const test = slot.test ? ` if ${expr(slot.test)}` : '';
          lines.push(`${indent}  #${slot.name}(${params})${test}`);
          blockText(slot.block, inner, lines);
        }
      } else {
        line(`n${op.id} = slot ${m.name}${at} ${propsText(m.props, m.spread)}`.trimEnd());
        if (m.fallback) blockText(m.fallback, `${indent}  `, lines);
      }
    }
  }
  line(`return ${b.returns.map((r) => `n${r}`).join(', ')}`);
}

/** The IR as readable lines: templates, then the ops of each block, nested. */
export function dump(root: RootIR): string {
  const lines = root.templates.map((t, i) => `t${i}${t.ns ? ` (${t.ns})` : ''} = ${t.html}`);
  blockText(root.block, '', lines);
  return lines.join('\n');
}
