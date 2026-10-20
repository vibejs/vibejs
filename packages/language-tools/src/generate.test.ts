import {
  analyzeScript,
  compile,
  forEachIdentifier,
  identifiersOf,
  parse,
} from '@vibejs-org/compiler';
import { describe, expect, it, vi } from 'vitest';
import { CODEGEN, codegen, compiler } from '../test/fixtures.ts';
import { formatSpans } from './dump.ts';
import { UNKNOWN } from './expression.ts';
import { generate } from './generate.ts';

vi.mock('@vibejs-org/compiler', async (original) => {
  const real = await original<typeof import('@vibejs-org/compiler')>();
  return {
    ...real,
    forEachIdentifier: vi.fn<typeof real.forEachIdentifier>(real.forEachIdentifier),
    identifiersOf: vi.fn<typeof real.identifiersOf>(real.identifiersOf),
  };
});

describe('codegen fixtures', () => {
  it.each(codegen)('%s', async (name, source) => {
    const file = generate(name, source);
    const dir = `${CODEGEN}/${name.slice(0, name.lastIndexOf('/'))}`;
    await expect(file.text).toMatchFileSnapshot(`${dir}/virtual.ts`);
    await expect(`${formatSpans(file, source)}\n`).toMatchFileSnapshot(`${dir}/spans.txt`);
  });
});

describe('batched parse', () => {
  it.each([
    ...codegen,
    [
      'Dynamic.vibe',
      `<script setup lang="ts">\nconst a = 'k'\n</script>\n<template><p :[a||b]="a + 1" @[a&&b]="a()"></p></template>\n`,
    ],
  ])('%s parses its walked texts in one batch', (name, source) => {
    vi.mocked(forEachIdentifier).mockClear();
    vi.mocked(identifiersOf).mockClear();
    generate(name, source);
    expect(vi.mocked(identifiersOf).mock.calls.length).toBeLessThanOrEqual(1);
    // Only the shorthand probes, built on demand, are parsed one by one.
    const alone = vi.mocked(forEachIdentifier).mock.calls.map(([text]) => text);
    expect(alone.filter((t) => !t.startsWith('0, ') && !t.includes(UNKNOWN))).toStrictEqual([]);
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

  it('does not forward the compiler errors of kebab tags, string :is and refs', () => {
    const source = `<script setup lang="ts">
import MyComp from './MyComp.vibe'
</script>
<template><my-comp /><component :is="'A'" /><p ref="p" /></template>
`;
    const codes = compile(source, {
      filename: 'A.vibe',
      id: '0000000a',
      dev: false,
    }).diagnostics.map((d) => d.code);
    expect(codes).toEqual(['VIBE2002', 'VIBE2006', 'VIBE2701']);
    expect(generate('A.vibe', source).diagnostics).toEqual([]);
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

describe('component tags', () => {
  it('types the file itself through its default export, unless a binding shadows its name', () => {
    const own = generate('src/Tree.vibe', '<template><Tree :x="1" /></template>\n').text;
    expect(own).toContain('__vibe.component(__vibe_self)({ x: 1 });');
    expect(own).toContain('import __vibe_self from "./Tree.vibe";');
    const source = `<script setup lang="ts">
import Tree from './Other.vibe'
</script>
<template><Tree /></template>
`;
    const shadowed = generate('src/Tree.vibe', source).text;
    expect(shadowed).toContain('__vibe.component(Tree)({ });');
    expect(shadowed).not.toContain('__vibe_self');
    const prop =
      '<script setup lang="ts">\ndefineProps<{ Tree: unknown }>()\n</script>\n<template><Tree /></template>\n';
    expect(generate('Tree.vibe', prop).text).not.toContain('__vibe_self');
    expect(generate('tree.vibe', '<template><Tree /></template>\n').text).not.toContain(
      '__vibe_self',
    );
  });
});

describe('slots', () => {
  it('declares __VibeSlots from defineSlots, else from the outlets', () => {
    const declared = `<script setup lang="ts">
defineSlots<{ a: (props: { x: number }) => unknown }>()
</script>
<template><slot name="a" :x="1" /></template>
`;
    const text = generate('A.vibe', declared).text;
    expect(text).toContain('type __VibeSlots = { a: (props: { x: number }) => unknown };');
    expect(text).toContain("__vibe.slot<__VibeSlots, 'a'>()({ x: 1 });");
    expect(generate('A.vibe', '<template><p /></template>\n').text).toContain(
      'type __VibeSlots = {};',
    );
  });

  it('leaves the content of a dynamic v-slot on a component untyped', () => {
    const text = generate('A.vibe', '<template><C v-slot:[n]="p">{{ p }}</C></template>\n').text;
    expect(text).not.toContain('slotParams');
    expect(text).not.toContain('(p)');
  });

  it('types a valueless outlet name as the slot named ""', () => {
    expect(generate('A.vibe', '<template><slot name /></template>\n').text).toContain(
      "type __VibeSlots = { ''?: (props: typeof __vibe_s0) => unknown };",
    );
  });

  it('types a slot with only forwarded outlets as any', () => {
    const source =
      '<template><Loop><template #a="p"><slot name="a" :x="p.x" /></template></Loop></template>\n';
    expect(generate('Loop.vibe', source).text).toContain(
      'type __VibeSlots = { a?: (props: any) => unknown };',
    );
  });

  it('types a ref on the self tag as unknown once the file exposes values', () => {
    const tag = '<template><Tree ref="t" /></template>\n';
    const exposes = `<script setup lang="ts">\ndefineExpose({})\n</script>\n${tag}`;
    expect(generate('Tree.vibe', exposes).text).toContain('type __VibeRefs = { t: unknown };');
    expect(generate('Tree.vibe', tag).text).toContain(
      'type __VibeRefs = { t: typeof __vibe_c0.exposed };',
    );
  });

  // `generic` (VIBE1013) is an SFC-structure error in 1000-1199, so C6 forwards it as before.
  it('forwards generic as before, and none of the slot diagnostics of the compiler', () => {
    const source = `<script setup lang="ts" generic="T">
import C from './C.vibe'
const n = 'a'
</script>
<template>
  <div><template #a /></div>
  <C v-slot="x"><template #b /></C>
  <C><template #c /><template #c /></C>
  <C><template #default />loose</C>
  <C><template #[n] /></C>
  <C><template v-for="i in 2" #d /></C>
  <slot :name="n" />
</template>
`;
    const codes = compile(source, { filename: 'A.vibe', id: '0000000a', dev: false })
      .diagnostics.map((d) => d.code)
      .filter((c) => /^VIBE(?:1013|260[1-7])$/.test(c));
    expect(new Set(codes)).toEqual(
      new Set(['VIBE1013', ...[1, 2, 3, 4, 5, 6, 7].map((i) => `VIBE260${i}`)]),
    );
    expect(generate('A.vibe', source).diagnostics.map((d) => d.code)).toEqual([1013]);
  });
});
