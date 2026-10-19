// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/compiler-sfc/__tests__/parse.spec.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// The block cases, with the descriptor of this parser: one `scriptSetup` and VIBE codes for
// what it rejects (`src`, custom blocks, plain `<script>`, `functional`, a missing template).
// Dropped cases, by option the descriptor does not have: `sourceMap` (style, script, template
// with lang and custom block maps), `pad` (pad content), `ignoreEmpty` (should ignore other nodes
// with no content, ignoreEmpty: false), `compiler` (custom compiler) and `templateParseOptions`
// (should accept parser options). The units after the port cover the descriptor fields and the
// raw style checks.
import { describe, expect, test } from 'vitest';
import { ElementTypes, NodeTypes } from '../template/ast.ts';
import { parse as parseSFC } from './parse.ts';

const parse = (source: string) => {
  const { descriptor, diagnostics } = parseSFC(source, { filename: 'Test.vibe' });
  return { descriptor, errors: diagnostics.map((d) => d.code) };
};

describe('compiler:sfc', () => {
  test('should parse correct range for root level self closing tag', () => {
    const content = `\n  <div/>\n`;
    const { descriptor } = parse(`<template>${content}</template>`);
    expect(descriptor.template).toBeTruthy();
    expect(descriptor.template!.content).toBe(content);
    expect(descriptor.template!.loc).toMatchObject({
      start: { line: 1, column: 11, offset: 10 },
      end: {
        line: 3,
        column: 1,
        offset: 10 + content.length,
      },
    });
  });

  test('should parse correct range for blocks with no content (self closing)', () => {
    const { descriptor } = parse(`<template/>`);
    expect(descriptor.template).toBeTruthy();
    expect(descriptor.template!.content).toBeFalsy();
    expect(descriptor.template!.loc).toMatchObject({
      start: { line: 1, column: 12, offset: 11 },
      end: { line: 1, column: 12, offset: 11 },
    });
  });

  test('should parse correct range for blocks with no content (explicit)', () => {
    const { descriptor } = parse(`<template></template>`);
    expect(descriptor.template).toBeTruthy();
    expect(descriptor.template!.content).toBeFalsy();
    expect(descriptor.template!.loc).toMatchObject({
      start: { line: 1, column: 11, offset: 10 },
      end: { line: 1, column: 11, offset: 10 },
    });
  });

  test('handle empty nodes with src attribute', () => {
    const { descriptor, errors } = parse(`<script src="com"/>`);
    expect(descriptor.scriptSetup).toBeTruthy();
    expect(descriptor.scriptSetup!.content).toBeFalsy();
    expect(descriptor.scriptSetup!.attrs['src']).toBe('com');
    expect(errors).toStrictEqual(['VIBE1001', 'VIBE1004', 'VIBE1005', 'VIBE1006']);
  });

  test('a template with a src import is rejected and keeps its ast', () => {
    const { descriptor, errors } = parse(`<template src="./foo.html"/>`);
    expect(errors).toStrictEqual(['VIBE1006']);
    expect(descriptor.template!.ast.children).toStrictEqual([]);
  });

  test('nested templates', () => {
    const content = `
    <template v-if="ok">ok</template>
    <div><div></div></div>
    `;
    const { descriptor } = parse(`<template>${content}</template>`);
    expect(descriptor.template!.content).toBe(content);
  });

  test('an empty lang attribute is still a template lang', () => {
    const content = `<div><template v-if="ok">ok</template></div>`;
    const { descriptor, errors } = parse(`<template lang="">${content}</template>`);
    expect(descriptor.template!.content).toBe(content);
    expect(errors).toStrictEqual(['VIBE1008']);
  });

  // #1120
  test('template with preprocessor lang should be treated as plain text', () => {
    const content = `p(v-if="1 < 2") test <div/>`;
    const { descriptor, errors } = parse(`<template lang="pug">` + content + `</template>`);
    expect(errors).toStrictEqual(['VIBE1008']);
    expect(descriptor.template!.content).toBe(content);
    // should not attempt to parse the content
    expect(descriptor.template!.ast.children.length).toBe(1);
  });

  //#2566
  test('div lang should not be treated as plain text', () => {
    const { errors } = parse(`
    <template lang="pug">
      <div lang="">
        <div></div>
      </div>
    </template>
    `);
    expect(errors).toStrictEqual(['VIBE1008']);
  });

  test('slotted detection', () => {
    expect(parse(`<template>hi</template>`).errors).toStrictEqual([]);
    expect(parse(`<template>hi</template><style>h1{color:red;}</style>`).errors).toStrictEqual([]);
    expect(
      parse(`<template>hi</template><style scoped>:slotted(h1){color:red;}</style>`).errors,
    ).toStrictEqual(['VIBE4002']);
    expect(
      parse(`<template>hi</template><style scoped>::v-slotted(h1){color:red;}</style>`).errors,
    ).toStrictEqual(['VIBE4002']);
  });

  test('error tolerance', () => {
    const { errors } = parse(`<template>`);
    expect(errors).toStrictEqual(['VIBE1124']);
  });

  test('should parse as DOM by default', () => {
    const { errors } = parse(`<template><input></template>`);
    expect(errors.length).toBe(0);
  });

  test('custom blocks are raw text and rejected', () => {
    const { errors, descriptor } = parse(`<template><input></template><foo> <-& </foo>`);
    expect(errors).toStrictEqual(['VIBE1011']);
    expect(descriptor.template!.content).toBe('<input>');
  });

  describe('warnings', () => {
    test('should only allow single template element', () => {
      expect(parse(`<template><div/></template><template><div/></template>`).errors).toContain(
        'VIBE1002',
      );
    });

    test('should only allow single script element', () => {
      expect(
        parse(`<script>console.log(1)</script><script>console.log(1)</script>`).errors,
      ).toContain('VIBE1004');
    });

    test('should only allow single script setup element', () => {
      expect(
        parse(`<script setup>console.log(1)</script><script setup>console.log(1)</script>`).errors,
      ).toContain('VIBE1003');
    });

    test('a plain script beside script setup is rejected', () => {
      expect(
        parse(`<script setup>console.log(1)</script><script>console.log(1)</script>`).errors,
      ).toStrictEqual(['VIBE1001', 'VIBE1005', 'VIBE1004', 'VIBE1005']);
    });

    test('a script setup after a plain script is kept', () => {
      const { descriptor, errors } = parse(
        `<template></template><script lang="ts">a</script><script setup lang="ts">b</script>`,
      );
      expect(errors).toStrictEqual(['VIBE1004']);
      expect(descriptor.scriptSetup).toMatchObject({ content: 'b', attrs: { setup: true } });
    });

    // # 6676
    test('should throw error if no <template> or <script> is present', () => {
      expect(parse(`import { ref } from '@vibejs-org/ui'`).errors).toStrictEqual([
        'VIBE1001',
        'VIBE1012',
      ]);
    });

    test('should throw error if template functional is given', () => {
      expect(parse(`<template functional></template>`).errors).toStrictEqual(['VIBE1010']);
    });
  });
});

describe('descriptor', () => {
  const source = [
    '<template><Foo v-if="ok" /></template>',
    '<script setup lang="ts">const ok = true</script>',
    '<style>a {}</style>',
    '<style scoped lang="scss">b {}</style>',
  ].join('\n');

  test('holds the blocks with their contents, attributes and file-relative locations', () => {
    const { descriptor, diagnostics } = parseSFC(source, { filename: 'src/Foo.vibe' });
    expect(diagnostics).toStrictEqual([]);
    expect(descriptor.filename).toBe('src/Foo.vibe');
    expect(descriptor.source).toBe(source);
    expect(descriptor.scriptSetup).toMatchObject({
      content: 'const ok = true',
      attrs: { setup: true, lang: 'ts' },
      loc: { start: { offset: 63, line: 2, column: 25 }, source: 'const ok = true' },
    });
    expect(descriptor.styles).toMatchObject([
      { content: 'a {}', attrs: {}, scoped: false, lang: 'css' },
      { content: 'b {}', attrs: { scoped: true, lang: 'scss' }, scoped: true, lang: 'scss' },
    ]);
    const { ast } = descriptor.template!;
    expect(ast.loc).toBe(descriptor.template!.loc);
    expect(ast.children[0]).toMatchObject({
      type: NodeTypes.ELEMENT,
      tag: 'Foo',
      tagType: ElementTypes.COMPONENT,
      loc: { start: { offset: 10 }, source: '<Foo v-if="ok" />' },
    });
  });

  test('keeps the first block of a kind and the flagged ones', () => {
    const { descriptor, diagnostics } = parseSFC(
      '<template>a</template><template>b</template><style module lang="x">c</style>',
      { filename: 'A.vibe' },
    );
    expect(diagnostics.map((d) => d.code)).toStrictEqual(['VIBE1002', 'VIBE1007', 'VIBE1009']);
    expect(descriptor.template!.content).toBe('a');
    expect(descriptor.styles).toMatchObject([{ content: 'c', lang: 'css', scoped: false }]);
  });

  test('reads a duplicate lang from its first occurrence', () => {
    const { descriptor, diagnostics } = parseSFC(
      '<template></template><script setup lang="js" lang="ts"></script><style lang="x" lang="css"></style>',
      { filename: 'A.vibe' },
    );
    expect(diagnostics.map((d) => d.code)).toStrictEqual([
      'VIBE1005',
      'VIBE1102',
      'VIBE1009',
      'VIBE1102',
    ]);
    expect(descriptor.scriptSetup!.attrs.lang).toBe('js');
  });

  test('rejects v-pre on every block', () => {
    const { descriptor, diagnostics } = parseSFC(
      '<template v-pre><p v-if="a">{{ b }}</p></template><script setup lang="ts" v-pre></script><style v-pre></style>',
      { filename: 'A.vibe' },
    );
    expect(diagnostics.map((d) => [d.code, d.start.offset, d.end.offset])).toStrictEqual([
      ['VIBE1010', 10, 15],
      ['VIBE1010', 74, 79],
      ['VIBE1010', 96, 101],
    ]);
    expect(descriptor.template!.content).toBe('<p v-if="a">{{ b }}</p>');
  });

  test('reports a root tag named after an Object.prototype member as a custom block', () => {
    for (const file of [
      '<template></template><constructor x></constructor>',
      '<template></template><constructor lang="css">a{}</constructor>',
      '<template></template><constructor></constructor>',
    ]) {
      const { descriptor, errors } = parse(file);
      expect(errors).toStrictEqual(['VIBE1011']);
      expect(descriptor.styles).toStrictEqual([]);
    }
  });

  test('a block left open at the end of the file covers its content', () => {
    const { template } = parse('<template>hello').descriptor;
    expect(template!.content).toBe('hello');
    expect(template!.loc.end.offset).toBe(15);
    expect(template!.ast.children).toMatchObject([{ loc: { start: { offset: 10 } } }]);
    expect(parse('<template><div>hi</div>').descriptor.template!.content).toBe('<div>hi</div>');
    expect(parse('<script setup lang="ts">const a = 1').descriptor.scriptSetup!.content).toBe(
      'const a = 1',
    );
    expect(parse('<template></template><style>a{}').descriptor.styles[0].content).toBe('a{}');
  });

  test('rejects directives and a valueless lang on blocks', () => {
    const { diagnostics } = parseSFC(
      '<template :a="b"></template><script setup lang></script><style lang></style>',
      { filename: 'A.vibe' },
    );
    expect(diagnostics.map((d) => [d.code, d.message])).toStrictEqual([
      ['VIBE1010', 'The `<template>` block does not accept the attribute `:a`.'],
      ['VIBE1005', 'The `<script setup>` block needs `lang="ts"` but has `lang`.'],
      [
        'VIBE1009',
        'The `<style>` block has `lang`, which is not one of `css`, `scss`, `sass`, `less`, `styl`, `stylus` or `postcss`.',
      ],
    ]);
  });

  test('allows root comments and whitespace, and reports root interpolations as text', () => {
    const { diagnostics } = parseSFC('<!-- c -->\n<template></template>\n  {{ x }}\n', {
      filename: 'A.vibe',
    });
    expect(diagnostics).toMatchObject([
      { code: 'VIBE1012', start: { line: 3, column: 3 }, end: { line: 3, column: 10 } },
    ]);
  });

  test('counts a surrogate pair as two UTF-16 columns', () => {
    const { descriptor } = parseSFC('<template><p>😀 <b id="x"></b></p></template>', {
      filename: 'A.vibe',
    });
    const p = descriptor.template!.ast.children[0];
    if (p.type !== NodeTypes.ELEMENT) throw new Error('expected <p>');
    const b = p.children[1];
    if (b.type !== NodeTypes.ELEMENT) throw new Error('expected <b>');
    expect(b.props[0].loc).toMatchObject({
      start: { offset: 19, line: 1, column: 20 },
      end: { offset: 25, line: 1, column: 26 },
      source: 'id="x"',
    });
  });

  test('collects every fault of a file in source order', () => {
    const file = [
      '<template>', //                      1
      '  <div><span></div>', //             2: unclosed <span>
      '  </p>', //                          3: stray end tag
      '</template>', //                     4
      '<template><b /></template>', //      5: duplicate
      '<script setup lang="js" src="./a.ts"></script>', // 6
      '<style scoped>.a ::v-deep(.b) {}</style>', // 7
    ].join('\n');
    const { descriptor, diagnostics } = parseSFC(file, { filename: 'A.vibe' });
    expect(diagnostics.map((d) => `${d.code} ${d.start.line}:${d.start.column}`)).toStrictEqual([
      'VIBE1124 2:8',
      'VIBE1123 3:3',
      'VIBE1002 5:1',
      'VIBE1005 6:15',
      'VIBE1006 6:25',
      'VIBE4004 7:18',
    ]);
    expect(descriptor.template!.content).toBe('\n  <div><span></div>\n  </p>\n');
    expect(descriptor.scriptSetup).toMatchObject({ attrs: { src: './a.ts' }, content: '' });
    expect(descriptor.styles).toMatchObject([{ scoped: true, content: '.a ::v-deep(.b) {}' }]);
  });
});

/** Each code reported for a style block, with its offset in the style content. */
function codes(lang: string, css: string) {
  const { descriptor, diagnostics } = parseSFC(
    `<template></template><style lang="${lang}">${css}</style>`,
    { filename: 'A.vibe' },
  );
  const base = descriptor.styles[0].loc.start.offset;
  return diagnostics.map((d) => [d.code, d.start.offset - base]);
}

describe('style text checks', () => {
  test.each(['css', 'postcss', 'scss', 'sass', 'less', 'styl', 'stylus'])(
    'checks %s at exact offsets',
    (lang) => {
      expect(codes(lang, 'a:slotted(b) v-bind(c) >>> /deep/')).toStrictEqual([
        ['VIBE4002', 1],
        ['VIBE4003', 13],
        ['VIBE4004', 23],
        ['VIBE4004', 27],
      ]);
    },
  );

  test('skips block comments in every lang, including an unclosed one', () => {
    expect(codes('css', '/* >>> */ a /* v-bind(')).toStrictEqual([]);
    expect(codes('scss', '/* ::v-deep */')).toStrictEqual([]);
  });

  test('skips line comments only in the langs that have them', () => {
    expect(codes('scss', '// v-bind(x)\n:slotted(a)')).toStrictEqual([['VIBE4002', 13]]);
    expect(codes('stylus', '// >>>')).toStrictEqual([]);
    expect(codes('css', '// >>>')).toStrictEqual([['VIBE4004', 3]]);
  });

  test('allows the standard ::slotted() pseudo-element', () => {
    expect(codes('css', 'a::slotted(b) :slotted(c)')).toStrictEqual([['VIBE4002', 14]]);
  });
});
