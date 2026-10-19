import { describe, expect, it } from 'vitest';
import { ir } from '../../test/transform.ts';
import { serialize } from './html.ts';

const html = (template: string, style = '') => ir(template, style).templates.map((t) => t.html);
const SCOPED = '<style scoped>p {}</style>';

describe('static HTML', () => {
  it('puts the scope attribute on every element, split and SVG templates included, iff a style is scoped', () => {
    const template = '<div><p><div></div></p><Item /><svg><circle /></svg></div>';
    expect(html(template, SCOPED)).toStrictEqual([
      '<div data-vb-0a1b2c3d></div>',
      '<div data-vb-0a1b2c3d><p data-vb-0a1b2c3d><!></p><!><svg data-vb-0a1b2c3d><circle data-vb-0a1b2c3d></circle></svg></div>',
    ]);
    expect(html(template, '<style>p {}</style>')).toStrictEqual([
      '<div></div>',
      '<div><p><!></p><!><svg><circle></circle></svg></div>',
    ]);
  });

  it('escapes text and attribute values as the HTML serializer does, and keeps valueless attributes bare', () => {
    expect(
      html('<p title="a &amp; &quot;b&quot; <c>&nbsp;" hidden>1 &lt; 2 &gt; &amp; "3"&nbsp;</p>'),
    ).toStrictEqual([
      '<p title="a &amp; &quot;b&quot; <c>&nbsp;" hidden>1 &lt; 2 &gt; &amp; "3"&nbsp;</p>',
    ]);
  });

  it('writes explicit end tags except on HTML void elements, and drops comments', () => {
    expect(html('<div><br><input><!-- note --><span /></div><svg><path /></svg>')).toStrictEqual([
      '<div><br><input><span></span></div>',
      '<svg><path></path></svg>',
    ]);
  });

  it('removes static class and style from the HTML when they are merged into a setter', () => {
    expect(
      html('<p class="a" style="b" :class="text" id="c"></p><p class="a" style="b"></p>'),
    ).toStrictEqual(['<p style="b" id="c"></p>', '<p class="a" style="b"></p>']);
  });

  it('serializes anchors as empty comments', () => {
    expect(serialize({ kind: 'anchor' })).toBe('<!>');
  });
});
