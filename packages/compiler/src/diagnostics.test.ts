import { defineErrors, DOCS_BASE } from '@vibejs-org/errors';
import { describe, expect, it } from 'vitest';
import { codeFrame, formatDiagnostic, LineIndex, toDiagnostic } from './diagnostics.ts';

// A test-only table, so these tests add no catalog code.
const vibeError = defineErrors(
  () =>
    ({
      VIBE1001: ['Missing {tag}.', 'Add {tag}.'],
      VIBE1002: ['Unclosed {tag}.', 'Close {tag}.', 'Remove {tag}.'],
    }) as const,
);

/** formatDiagnostic of VIBE1001 over [from, to) of `source`. */
function format(
  source: string,
  from: number,
  to = from,
  error = vibeError('VIBE1001', { tag: 'x' }),
) {
  const index = new LineIndex(source);
  const d = toDiagnostic(error, 'src/App.vibe', index.position(from), index.position(to));
  return formatDiagnostic(d, source);
}

/** formatDiagnostic over the first occurrence of `needle`. */
function formatAt(source: string, needle: string): string {
  const from = source.indexOf(needle);
  return format(source, from, from + needle.length);
}

const lines = (n: number): string =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');

describe('formatDiagnostic', () => {
  it('formats a single-line range', () => {
    const source = '<template>\n  <li v-for="todo in todos">{{ todo.text }}</li>\n</template>\n';
    expect(formatAt(source, '<li v-for="todo in todos">')).toMatchInlineSnapshot(`
      "error[VIBE1001]: Missing x.
        --> src/App.vibe:2:3
      2 |   <li v-for="todo in todos">{{ todo.text }}</li>
        |   ^^^^^^^^^^^^^^^^^^^^^^^^^^
      fix: Add x.
      docs: https://vibejs.org/v0/errors/VIBE1001"
    `);
  });

  it('formats a 2-line range', () => {
    expect(formatAt(lines(3), 'ne 1\nline')).toMatchInlineSnapshot(`
      "error[VIBE1001]: Missing x.
        --> src/App.vibe:1:3
      1 | line 1
        |   ^^^^
      2 | line 2
        | ^^^^
      fix: Add x.
      docs: https://vibejs.org/v0/errors/VIBE1001"
    `);
  });

  it('elides the middle of a 5-line range', () => {
    expect(formatAt(lines(6), '1\nline 2\nline 3\nline 4\nline 5')).toMatchInlineSnapshot(`
      "error[VIBE1001]: Missing x.
        --> src/App.vibe:1:6
      1 | line 1
        |      ^
      ...
      5 | line 5
        | ^^^^^^
      fix: Add x.
      docs: https://vibejs.org/v0/errors/VIBE1001"
    `);
  });

  it('prints one caret for an empty range at EOF', () => {
    const source = '<template>\n';
    expect(format(source, source.length)).toMatchInlineSnapshot(`
      "error[VIBE1001]: Missing x.
        --> src/App.vibe:2:1
      2 |
        | ^
      fix: Add x.
      docs: https://vibejs.org/v0/errors/VIBE1001"
    `);
  });

  it('prints one fix line per fix, in catalog order', () => {
    const source = '<div>';
    expect(format(source, 0, 5, vibeError('VIBE1002', { tag: '<div>' }))).toMatchInlineSnapshot(`
      "error[VIBE1002]: Unclosed <div>.
        --> src/App.vibe:1:1
      1 | <div>
        | ^^^^^
      fix: Close <div>.
      fix: Remove <div>.
      docs: https://vibejs.org/v0/errors/VIBE1002"
    `);
  });

  it('sizes the gutter to the largest printed line number', () => {
    expect(formatAt(lines(10), '9\nline 1')).toMatchInlineSnapshot(`
      "error[VIBE1001]: Missing x.
        --> src/App.vibe:9:6
       9 | line 9
         |      ^
      10 | line 10
         | ^^^^^^
      fix: Add x.
      docs: https://vibejs.org/v0/errors/VIBE1001"
    `);
  });

  it('keeps tabs before the range in the caret line', () => {
    expect(formatAt('<ul>\n\t\t<li>\n</ul>', '<li>')).toMatchInlineSnapshot(`
      "error[VIBE1001]: Missing x.
        --> src/App.vibe:2:3
      2 | 		<li>
        | 		^^^^
      fix: Add x.
      docs: https://vibejs.org/v0/errors/VIBE1001"
    `);
  });

  it('counts a surrogate pair as 2 columns and 1 caret space', () => {
    expect(formatAt('<p>😀 {{ x }}</p>', '{{ x }}')).toMatchInlineSnapshot(`
      "error[VIBE1001]: Missing x.
        --> src/App.vibe:1:7
      1 | <p>😀 {{ x }}</p>
        |      ^^^^^^^
      fix: Add x.
      docs: https://vibejs.org/v0/errors/VIBE1001"
    `);
  });

  it('gives the same output for the CRLF copy of a source, with no \\r', () => {
    const source = '<template>\n  <p>a</p>\n  <p>b</p>\n</template>\n';
    const crlf = source.replaceAll('\n', '\r\n');
    for (const needle of ['<p>a</p>', 'a</p>\n  <p>b', '<template>\n  <p>a</p>\n  <p>b</p>\n</t']) {
      const output = formatAt(crlf, needle.replaceAll('\n', '\r\n'));
      expect(output).toBe(formatAt(source, needle));
      expect(output).not.toContain('\r');
    }
  });
});

describe('codeFrame', () => {
  it('marks each covered line of a 3-line range, with one caret on an empty line', () => {
    const source = 'ab\n\ncd';
    const index = new LineIndex(source);
    expect(codeFrame(source, index.position(1), index.position(5))).toMatchInlineSnapshot(`
      "1 | ab
        |  ^
      2 |
        | ^
      3 | cd
        | ^"
    `);
  });
});

describe('LineIndex', () => {
  // a b \n \n c d \r \n 😀(2 units) x \r y
  const sample = 'ab\n\ncd\r\n😀x\ry';
  const index = new LineIndex(sample);

  it.each([
    ['offset 0', 0, 1, 1],
    ['a line terminator', 2, 1, 3],
    ['right after \\n, on an empty line', 3, 2, 1],
    ['a line start after an empty line', 4, 3, 1],
    ['the \\r of \\r\\n', 6, 3, 3],
    ['right after \\r\\n', 8, 4, 1],
    ['inside a surrogate pair', 9, 4, 2],
    ['right after a lone \\r', 12, 4, 5],
    ['source.length', 13, 4, 6],
  ])('position at %s', (_, offset, line, column) => {
    expect(index.position(offset)).toStrictEqual({ offset, line, column });
  });

  it('drops \\n and \\r\\n from lineText and keeps a lone \\r', () => {
    expect([1, 2, 3, 4].map((line) => index.lineText(line))).toStrictEqual([
      'ab',
      '',
      'cd',
      '😀x\ry',
    ]);
  });

  it('agrees with a reference loop on every offset', () => {
    let line = 1;
    let column = 1;
    for (let offset = 0; offset <= sample.length; offset++) {
      expect(index.position(offset)).toStrictEqual({ offset, line, column });
      if (sample[offset] === '\n') {
        line++;
        column = 1;
      } else column++;
    }
  });

  it('gives the CRLF copy the same line and column for each LF position', () => {
    const lf = '<p>\n😀 a\n\nb\n';
    const crlf = new LineIndex(lf.replaceAll('\n', '\r\n'));
    const lfIndex = new LineIndex(lf);
    for (let offset = 0; offset <= lf.length; offset++) {
      const { line, column } = lfIndex.position(offset);
      expect(crlf.position(offset + line - 1)).toMatchObject({ line, column });
    }
  });
});

describe('toDiagnostic', () => {
  it('builds a plain diagnostic from a catalog error', () => {
    const start = { offset: 0, line: 1, column: 1 };
    const end = { offset: 4, line: 1, column: 5 };
    const d = toDiagnostic(
      vibeError('VIBE1001', { tag: '<template>' }),
      'src/App.vibe',
      start,
      end,
    );
    expect(d).toStrictEqual({
      code: 'VIBE1001',
      message: 'Missing <template>.',
      fixes: ['Add <template>.'],
      docs: DOCS_BASE + 'VIBE1001',
      file: 'src/App.vibe',
      start,
      end,
    });
    expect('typeChecked' in d).toBe(false);
    expect(structuredClone(d)).toStrictEqual(d);
    expect(JSON.parse(JSON.stringify(d))).toStrictEqual(d);
  });
});
