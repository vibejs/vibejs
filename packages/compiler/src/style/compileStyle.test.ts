import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import { describe, expect, it, vi } from 'vitest';
import { LineIndex } from '../diagnostics.ts';
import { compileStyle } from './compileStyle.ts';

const options = { filename: 'src/App.vibe', id: '7a1c2e3f' };
const range = (d: { start: { line: number; column: number }; end: typeof d.start }) =>
  `${d.start.line}:${d.start.column}-${d.end.line}:${d.end.column}`;

describe('compileStyle', () => {
  it.each([
    ['.a .b {}', '.a .b[data-vb-7a1c2e3f] {}'],
    ['.a:hover {}', '.a[data-vb-7a1c2e3f]:hover {}'],
    ['.a::before {}', '.a[data-vb-7a1c2e3f]::before {}'],
    [':deep(.b) {}', '[data-vb-7a1c2e3f] .b {}'],
    ['.a :deep(.b) {}', '.a[data-vb-7a1c2e3f] .b {}'],
    [':global(.x) {}', '.x {}'],
    [
      '@keyframes spin { from { opacity: 0 } 50% { opacity: 1 } }\n' +
        '@-webkit-keyframes spin { from { opacity: 0 } }\n' +
        '.a { animation: spin 1s, fade 2s; }\n' +
        '.b { animation-name: fade, spin; }',
      '@keyframes spin-7a1c2e3f { from { opacity: 0 } 50% { opacity: 1 } }\n' +
        '@-webkit-keyframes spin-7a1c2e3f { from { opacity: 0 } }\n' +
        '.a[data-vb-7a1c2e3f] { animation: spin-7a1c2e3f 1s, fade 2s; }\n' +
        '.b[data-vb-7a1c2e3f] { animation-name: fade,spin-7a1c2e3f; }',
    ],
    ['@keyframes spin-7a1c2e3f { to {} }', '@keyframes spin-7a1c2e3f { to {} }'],
    [
      '.a { color: red; .b { color: blue } }',
      '.a { &[data-vb-7a1c2e3f] { color: red } .b[data-vb-7a1c2e3f] { color: blue } }',
    ],
    ['.a { .b {} }', '.a { .b[data-vb-7a1c2e3f] {} }'],
    [
      '.a { @apply x; color: red; .b {} }',
      '.a { &[data-vb-7a1c2e3f] { color: red } @apply x; .b[data-vb-7a1c2e3f] {} }',
    ],
    ['@media (min-width: 1px) { .a {} }', '@media (min-width: 1px) { .a[data-vb-7a1c2e3f] {} }'],
    [
      '@supports (display: grid) { .a {} }',
      '@supports (display: grid) { .a[data-vb-7a1c2e3f] {} }',
    ],
    ['/* c */ .a { /* d */ color: red }', '/* c */ .a[data-vb-7a1c2e3f] { /* d */ color: red }'],
    [':hover * {}', ':hover *[data-vb-7a1c2e3f] {}'],
    ['.a:is(:deep(.b)) .c {}', '.a[data-vb-7a1c2e3f]:is( .b) .c {}'],
    [':not(:deep(.a), .b) .c {}', ':not(:deep(.a), .b) .c[data-vb-7a1c2e3f] {}'],
    [':is(:deep(.a), ) .c {}', ':is([data-vb-7a1c2e3f] .a) .c, :is() .c[data-vb-7a1c2e3f] {}'],
    [
      ':is(:is(:deep(.a)), .b) .c {}',
      ':is(:is([data-vb-7a1c2e3f] .a)) .c, :is(.b) .c[data-vb-7a1c2e3f] {}',
    ],
    ['.a, , .b {}', '.a[data-vb-7a1c2e3f],, .b[data-vb-7a1c2e3f] {}'],
    [':is() {}', ':is() {}'],
    [':is(.a, ) {}', ':is(.a[data-vb-7a1c2e3f],) {}'],
  ])('rewrites %j', (css, code) => {
    expect(compileStyle(css, options)).toMatchObject({ code, diagnostics: [] });
  });

  it.each([
    ['VIBE4001', '.a { color: red; }\n.b {\n  color: blue;', '2:1-2:1'],
    ['VIBE4001', '.a { color: red; }\n\nfoo bar', '3:1-3:4'],
    ['VIBE4001', '.a {\n  content: "x;\n}', '2:12-2:12'],
    ['VIBE4001', '.a,\n.b[ {}', '2:3-2:4'],
    ['VIBE4001', '.a,\n.b] {}', '2:3-2:4'],
    ['VIBE4005', ':deep { color: red; }', '1:1-1:6'],
    ['VIBE4005', '.a :deep() { color: red; }', '1:4-1:11'],
    ['VIBE4005', '.a, :global(.a, .b) { color: red; }', '1:5-1:20'],
    ['VIBE4005', '@media (min-width: 1px) {\n  .a :global { color: red; }\n}', '2:6-2:13'],
    ['VIBE4005', '.a { color: red; }\n\n/* :deep */ .b :deep {}', '3:16-3:21'],
    ['VIBE4005', '.a /* x */ :deep {}', '1:12-1:17'],
    ['VIBE4005', '.a,\n.b :deep(\n  .c,\n  .d\n),\n.e { color: red; }', '2:4-5:2'],
    ['VIBE4005', '[x="a\\\nb"] .c\n:deep {}', '3:1-3:6'],
    ['VIBE4005', '.a :global(:is(.b), [x="\\")"]) {}', '1:4-1:31'],
    ['VIBE4005', '.a :deep(.b\\), /* ) */ .c) {}', '1:4-1:27'],
    ['VIBE4005', ':deep( /* x */ ) {}', '1:1-1:17'],
    ['VIBE4005', ':global(/*x*/) {}', '1:1-1:15'],
    ['VIBE4005', '\uFEFF.a :deep {}', '1:5-1:10'],
    ['VIBE4001', '\uFEFF.a {', '1:2-1:2'],
  ])('reports %s in %j at %s', (code, css, at) => {
    const result = compileStyle(css, options);
    expect(result.diagnostics.map((d) => [d.code, range(d)])).toEqual([[code, at]]);
    expect(result.code).toBe('');
    expect(result.map).toBeNull();
  });

  it('puts the postcss reason and the file into a 4001', () => {
    const [d] = compileStyle('.a {', options).diagnostics;
    expect(d).toMatchObject({
      message: 'The CSS of a scoped style block has a syntax error: Unclosed block.',
      file: 'src/App.vibe',
    });
  });

  it('takes the reason of a selector syntax error without its period', () => {
    const [d] = compileStyle('.a] {}', options).diagnostics;
    expect(d.message).toBe(
      'The CSS of a scoped style block has a syntax error: Expected an opening square bracket.',
    );
  });

  it('names the escape in a 4005', () => {
    const [d] = compileStyle('.a :global() {}', options).diagnostics;
    expect(d.message).toBe(':global needs exactly one selector as its argument.');
  });

  it('collects every malformed escape in source order', () => {
    const result = compileStyle(':deep {}\n.a :global() {}', options);
    expect(result.diagnostics.map((d) => [d.code, range(d)])).toEqual([
      ['VIBE4005', '1:1-1:6'],
      ['VIBE4005', '2:4-2:13'],
    ]);
  });

  it('counts UTF-16 units and ignores CRLF in positions', () => {
    const lf = '.a {}\n/* \u{1F600} */ :deep {}\n';
    const crlf = lf.replaceAll('\n', '\r\n');
    const [d] = compileStyle(lf, options).diagnostics;
    expect(range(d)).toBe('2:10-2:15');
    expect(compileStyle(crlf, options).diagnostics.map(range)).toEqual([range(d)]);
    for (const css of [lf, crlf]) {
      const index = new LineIndex(css);
      for (const { start, end } of compileStyle(css, options).diagnostics) {
        expect([start, end]).toEqual([index.position(start.offset), index.position(end.offset)]);
      }
    }
  });

  it('returns a source map of the CSS', () => {
    const css = '.a { color: red }\n\n  .b { color: blue }';
    const { code, map } = compileStyle(css, options);
    expect(map).toMatchObject({ version: 3, sources: ['App.vibe'], sourcesContent: [css] });
    const generated = code.split('\n')[2].indexOf('.b[data-vb-7a1c2e3f]');
    const traced = originalPositionFor(new TraceMap(map!), { line: 3, column: generated });
    expect(traced).toMatchObject({ source: 'App.vibe', line: 3, column: 2 });
  });

  it('reads no source map comment of the input', () => {
    const prev = { version: 3, sources: ['other.scss'], names: [], mappings: 'AAAA' };
    const comment = `/*# sourceMappingURL=data:application/json;base64,${btoa(JSON.stringify(prev))} */`;
    expect(compileStyle(`.a {}\n${comment}`, options).map?.sources).toEqual(['App.vibe']);
  });

  it('rethrows an error that is not a CSS syntax error', async () => {
    vi.resetModules();
    vi.doMock('./pluginScoped.ts', () => ({
      pluginScoped: () => ({
        postcssPlugin: 'broken',
        Once() {
          throw new TypeError('broken plugin');
        },
      }),
    }));
    const { compileStyle: broken } = await import('./compileStyle.ts');
    expect(() => broken('.a {}', options)).toThrow(TypeError);
    vi.doUnmock('./pluginScoped.ts');
  });
});
