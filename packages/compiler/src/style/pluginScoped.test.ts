// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/compiler-sfc/__tests__/compileStyle.spec.ts (MIT)
//
// The `SFC scoped CSS` cases plus the universal selector case, run through compileStyle with the
// id `test`. Upstream trims the whitespace around rules; this output keeps the source whitespace.
// The `::v-deep(x)` cases are written as `:deep(x)`. Dropped: the `::v-slotted` and `::v-global`
// tests, the `::v-deep`, `:slotted`, `::v-global` expectations inside the kept tests, the
// deprecated `::v-deep`, `>>>` and `/deep/` combinator tests (the parser rejects all of these),
// and the CSS modules and preprocessor tests (not part of compileStyle).
import { describe, expect, test } from 'vitest';
import { compileStyle } from './compileStyle.ts';

function compileScoped(source: string): string {
  const res = compileStyle(source, { filename: 'test.css', id: 'test' });
  expect(res.diagnostics).toEqual([]);
  return res.code;
}

describe('SFC scoped CSS', () => {
  test('simple selectors', () => {
    expect(compileScoped(`h1 { color: red; }`)).toMatch(`h1[data-vb-test] { color: red;`);
    expect(compileScoped(`.foo { color: red; }`)).toMatch(`.foo[data-vb-test] { color: red;`);
  });

  test('descendent selector', () => {
    expect(compileScoped(`h1 .foo { color: red; }`)).toMatch(`h1 .foo[data-vb-test] { color: red;`);

    // #13387
    expect(
      compileScoped(`main {
  width: 100%;
  > * {
    max-width: 200px;
  }
}`),
    ).toMatchInlineSnapshot(`
      "main {
        &[data-vb-test] {
        width: 100%;
        }
        > *[data-vb-test] {
          max-width: 200px;
        }
      }"
    `);
  });

  test('nesting selector', () => {
    expect(compileScoped(`h1 { color: red; .foo { color: red; } }`)).toMatchInlineSnapshot(
      `"h1 { &[data-vb-test] { color: red; } .foo[data-vb-test] { color: red; } }"`,
    );
  });

  test('nesting selector with atrule and comment', () => {
    expect(
      compileScoped(
        `h1 {
color: red;
/*background-color: pink;*/
@media only screen and (max-width: 800px) {
  background-color: green;
  .bar { color: white }
}
.foo { color: red; }
}`,
      ),
    ).toMatchInlineSnapshot(`
      "h1 {
      &[data-vb-test] {
      color: red
      /*background-color: pink;*/
      }
      @media only screen and (max-width: 800px) {
        &[data-vb-test] {
        background-color: green
      }
        .bar[data-vb-test] { color: white }
      }
      .foo[data-vb-test] { color: red; }
      }"
    `);
  });

  test('multiple selectors', () => {
    expect(compileScoped(`h1 .foo, .bar, .baz { color: red; }`)).toMatch(
      `h1 .foo[data-vb-test], .bar[data-vb-test], .baz[data-vb-test] { color: red;`,
    );
  });

  test('pseudo class', () => {
    expect(compileScoped(`.foo:after { color: red; }`)).toMatch(
      `.foo[data-vb-test]:after { color: red;`,
    );
  });

  test('pseudo element', () => {
    expect(compileScoped(`::selection { display: none; }`)).toMatch('[data-vb-test]::selection {');
  });

  test('spaces before pseudo element', () => {
    const code = compileScoped(`.abc, ::selection { color: red; }`);
    expect(code).toMatch('.abc[data-vb-test],');
    expect(code).toMatch('[data-vb-test]::selection {');
  });

  test(':deep', () => {
    expect(compileScoped(`:deep(.foo) { color: red; }`)).toMatchInlineSnapshot(
      `"[data-vb-test] .foo { color: red; }"`,
    );
    expect(compileScoped(`:deep(.foo .bar) { color: red; }`)).toMatchInlineSnapshot(
      `"[data-vb-test] .foo .bar { color: red; }"`,
    );
    expect(compileScoped(`.baz .qux :deep(.foo .bar) { color: red; }`)).toMatchInlineSnapshot(
      `".baz .qux[data-vb-test] .foo .bar { color: red; }"`,
    );
    expect(compileScoped(`:is(.foo :deep(.bar)) { color: red; }`)).toMatchInlineSnapshot(
      `":is(.foo[data-vb-test] .bar) { color: red; }"`,
    );
    expect(compileScoped(`:where(.foo :deep(.bar)) { color: red; }`)).toMatchInlineSnapshot(
      `":where(.foo[data-vb-test] .bar) { color: red; }"`,
    );
    expect(compileScoped(`:is(:deep(.foo)) .bar { color: red; }`)).toMatchInlineSnapshot(
      `":is([data-vb-test] .foo) .bar { color: red; }"`,
    );
    expect(compileScoped(`:where(:deep(.foo)) .bar { color: red; }`)).toMatchInlineSnapshot(
      `":where([data-vb-test] .foo) .bar { color: red; }"`,
    );
    expect(compileScoped(`:is(:deep(.foo), .bar) .baz { color: red; }`)).toMatchInlineSnapshot(
      `":is([data-vb-test] .foo) .baz, :is(.bar) .baz[data-vb-test] { color: red; }"`,
    );
    expect(compileScoped(`:where(:deep(.foo), .bar) .baz { color: red; }`)).toMatchInlineSnapshot(
      `":where([data-vb-test] .foo) .baz, :where(.bar) .baz[data-vb-test] { color: red; }"`,
    );
    expect(compileScoped(`:not(:deep(.foo)) .bar { color: red; }`)).toMatchInlineSnapshot(
      `":not([data-vb-test] .foo) .bar { color: red; }"`,
    );
    expect(compileScoped(`:has(:deep(.foo)) .bar { color: red; }`)).toMatchInlineSnapshot(
      `":has([data-vb-test] .foo) .bar { color: red; }"`,
    );
    expect(compileScoped(`:has(:deep(.foo), .bar) .baz { color: red; }`)).toMatchInlineSnapshot(
      `":has([data-vb-test] .foo) .baz, :has(.bar) .baz[data-vb-test] { color: red; }"`,
    );
    expect(compileScoped(`:deep(.foo) { color: red; .bar { color: red; } }`)).toMatchInlineSnapshot(
      `"[data-vb-test] .foo { color: red; .bar { color: red; } }"`,
    );
  });

  test(':global', () => {
    expect(compileScoped(`:global(.foo) { color: red; }`)).toMatchInlineSnapshot(
      `".foo { color: red; }"`,
    );
    expect(compileScoped(`:global(.foo .bar) { color: red; }`)).toMatchInlineSnapshot(
      `".foo .bar { color: red; }"`,
    );
    // global ignores anything before it
    expect(compileScoped(`.baz .qux :global(.foo .bar) { color: red; }`)).toMatchInlineSnapshot(
      `".foo .bar { color: red; }"`,
    );
  });

  test(':is() and :where() with multiple selectors', () => {
    expect(compileScoped(`:is(.foo) { color: red; }`)).toMatchInlineSnapshot(
      `":is(.foo[data-vb-test]) { color: red; }"`,
    );
    expect(compileScoped(`:where(.foo, .bar) { color: red; }`)).toMatchInlineSnapshot(
      `":where(.foo[data-vb-test], .bar[data-vb-test]) { color: red; }"`,
    );
    expect(compileScoped(`:is(.foo, .bar) div { color: red; }`)).toMatchInlineSnapshot(
      `":is(.foo, .bar) div[data-vb-test] { color: red; }"`,
    );
  });

  // #10511
  test(':is() and :where() in compound selectors', () => {
    expect(
      compileScoped(`.div { color: red; } .div:where(:hover) { color: blue; }`),
    ).toMatchInlineSnapshot(
      `".div[data-vb-test] { color: red; } .div[data-vb-test]:where(:hover) { color: blue; }"`,
    );

    expect(
      compileScoped(`.div { color: red; } .div:is(:hover) { color: blue; }`),
    ).toMatchInlineSnapshot(
      `".div[data-vb-test] { color: red; } .div[data-vb-test]:is(:hover) { color: blue; }"`,
    );

    expect(
      compileScoped(`.div { color: red; } .div:where(.foo:hover) { color: blue; }`),
    ).toMatchInlineSnapshot(
      `".div[data-vb-test] { color: red; } .div[data-vb-test]:where(.foo:hover) { color: blue; }"`,
    );

    expect(
      compileScoped(`.div { color: red; } .div:is(.foo:hover) { color: blue; }`),
    ).toMatchInlineSnapshot(
      `".div[data-vb-test] { color: red; } .div[data-vb-test]:is(.foo:hover) { color: blue; }"`,
    );
  });

  test('media query', () => {
    expect(compileScoped(`@media print { .foo { color: red }}`)).toMatchInlineSnapshot(
      `"@media print { .foo[data-vb-test] { color: red }}"`,
    );
  });

  test('supports query', () => {
    expect(
      compileScoped(`@supports(display: grid) { .foo { display: grid }}`),
    ).toMatchInlineSnapshot(`"@supports(display: grid) { .foo[data-vb-test] { display: grid }}"`);
  });

  test('scoped keyframes', () => {
    const style = compileScoped(`
.anim {
  animation: color 5s infinite, other 5s;
}
.anim-2 {
  animation-name: color;
  animation-duration: 5s;
}
.anim-3 {
  animation: 5s color infinite, 5s other;
}
.anim-multiple {
  animation: color 5s infinite, opacity 2s;
}
.anim-multiple-2 {
  animation-name: color, opacity;
  animation-duration: 5s, 2s;
}

@keyframes color {
  from { color: red; }
  to { color: green; }
}
@-webkit-keyframes color {
  from { color: red; }
  to { color: green; }
}
@keyframes opacity {
  from { opacity: 0; }
  to { opacity: 1; }
}
@-webkit-keyframes opacity {
  from { opacity: 0; }
  to { opacity: 1; }
}
    `);

    expect(style).toContain(
      `.anim[data-vb-test] {\n  animation: color-test 5s infinite, other 5s;`,
    );
    expect(style).toContain(`.anim-2[data-vb-test] {\n  animation-name: color-test`);
    expect(style).toContain(
      `.anim-3[data-vb-test] {\n  animation: 5s color-test infinite, 5s other;`,
    );
    expect(style).toContain(`@keyframes color-test {`);
    expect(style).toContain(`@-webkit-keyframes color-test {`);

    expect(style).toContain(
      `.anim-multiple[data-vb-test] {\n  animation: color-test 5s infinite,opacity-test 2s;`,
    );
    expect(style).toContain(
      `.anim-multiple-2[data-vb-test] {\n  animation-name: color-test,opacity-test;`,
    );
    expect(style).toContain(`@keyframes opacity-test {\n  from { opacity: 0;`);
    expect(style).toContain(`@-webkit-keyframes opacity-test {\n  from { opacity: 0;`);
  });

  // vue-loader/#1370
  test('spaces after selector', () => {
    expect(compileScoped(`.foo , .bar { color: red; }`)).toMatchInlineSnapshot(
      `".foo[data-vb-test], .bar[data-vb-test] { color: red; }"`,
    );
  });

  test('should mount scope on correct selector when have universal selector', () => {
    expect(compileScoped(`* { color: red; }`)).toMatchInlineSnapshot(
      `"[data-vb-test] { color: red; }"`,
    );
    expect(compileScoped('* .foo { color: red; }')).toMatchInlineSnapshot(
      `".foo[data-vb-test] { color: red; }"`,
    );
    expect(compileScoped(`*.foo { color: red; }`)).toMatchInlineSnapshot(
      `".foo[data-vb-test] { color: red; }"`,
    );
    expect(compileScoped(`.foo * { color: red; }`)).toMatchInlineSnapshot(
      `".foo[data-vb-test] * { color: red; }"`,
    );
  });
});
