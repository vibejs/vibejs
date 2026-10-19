import { analyzeScript, parse } from '@vibejs-org/compiler';
import { describe, expect, it } from 'vitest';
import { CODEGEN, codegen, compiler } from '../test/fixtures.ts';
import { formatSpans } from './dump.ts';
import { generate } from './generate.ts';

describe('codegen fixtures', () => {
  it.each(codegen)('%s', async (name, source) => {
    const file = generate(name, source);
    const dir = `${CODEGEN}/${name.slice(0, -'/input.vibe'.length)}`;
    await expect(file.text).toMatchFileSnapshot(`${dir}/virtual.ts`);
    await expect(`${formatSpans(file, source)}\n`).toMatchFileSnapshot(`${dir}/spans.txt`);
  });
});

describe('forwarded diagnostics', () => {
  it.each(compiler)('%s forwards its SFC and HTML parse diagnostics', (name, source) => {
    const expected = parse(source, { filename: name })
      .diagnostics.filter((d) => /^VIBE1[01]\d\d$/.test(d.code) && !d.typeChecked)
      .map((d) => Number(d.code.slice(4)));
    expect(generate(name, source).diagnostics.map((d) => d.code)).toEqual(expected);
  });

  it('forwards code, message, fixes, docs and the range', () => {
    const source = '<template><div id="a" id="b"></div></template>\n';
    expect(generate('A.vibe', source).diagnostics).toEqual([
      {
        code: 1102,
        message:
          'The attribute `id` appears more than once on this element. Remove the second `id`. Merge both values into one `id` attribute. https://vibejs.org/v0/errors/VIBE1102',
        start: 22,
        length: 6,
      },
    ]);
  });

  it('drops script and style diagnostics', () => {
    const source = `<script setup lang="ts">
export const a = 1
</script>
<template><p>{{ a }}</p></template>
<style scoped>p >>> a {}</style>
`;
    const { descriptor, diagnostics } = parse(source, { filename: 'A.vibe' });
    const codes = [...diagnostics, ...analyzeScript(descriptor).diagnostics].map((d) => d.code);
    expect(codes).toEqual(['VIBE4004', 'VIBE3001']);
    expect(generate('A.vibe', source).diagnostics).toEqual([]);
  });
});
