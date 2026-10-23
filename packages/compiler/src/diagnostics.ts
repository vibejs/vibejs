import type { ErrorCode, VibeError } from '@usevibejs/errors';

/** offset: 0-based UTF-16 index into the whole file; line and column: 1-based, column in UTF-16 units. */
export interface Position {
  offset: number;
  line: number;
  column: number;
}

/** A compiler diagnostic. v1 has no severity: every diagnostic is an error. Plain data, JSON-safe. */
export interface Diagnostic {
  code: ErrorCode;
  message: string;
  fixes: readonly string[];
  docs: string;
  file: string;
  start: Position;
  end: Position;
  /** Set on codes that tsc also reports (1201-1203, 2001, 2007); language tools drop them. */
  typeChecked?: true;
}

/** Line starts plus binary search. `\n` ends a line; a `\r` before it belongs to no line text; a lone `\r` is an ordinary character. */
export class LineIndex {
  readonly #source: string;
  readonly #starts: number[] = [0];

  constructor(source: string) {
    this.#source = source;
    for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) {
      this.#starts.push(i + 1);
    }
  }

  /** The position of `offset`, where `0 <= offset <= source.length` (EOF allowed). */
  position(offset: number): Position {
    let lo = 0;
    let hi = this.#starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.#starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { offset, line: lo + 1, column: offset - this.#starts[lo] + 1 };
  }

  /** The text of a 1-based line, without its terminator. */
  lineText(line: number): string {
    return this.#source.slice(this.#starts[line - 1], this.#starts[line]).replace(/\r?\n$/, '');
  }
}

/** Turns a catalog error into a diagnostic. Callers write `toDiagnostic(vibeError('VIBE####', args), …)`. */
export function toDiagnostic(
  error: VibeError,
  file: string,
  start: Position,
  end: Position,
): Diagnostic {
  // The catalog message without its `[VIBE####] ` prefix and its Fix and Docs lines. Cutting by
  // length keeps an interpolated arg that holds a newline.
  const tail = [...error.fixes.map((fix) => `\n  Fix: ${fix}`), `\n  Docs: ${error.docs}`].join('');
  const message = error.message.slice(error.code.length + 3, error.message.length - tail.length);
  return { code: error.code, message, fixes: error.fixes, docs: error.docs, file, start, end };
}

/** The source lines of [start, end) with caret lines. Ranges of 4 or more lines elide the middle. */
export function codeFrame(source: string, start: Position, end: Position): string {
  const index = new LineIndex(source);
  // A range that ends right after a line terminator covers nothing of the next line.
  const last = end.line > start.line && end.column === 1 ? end.line - 1 : end.line;
  const width = String(last).length;
  const rows = (line: number): string[] => {
    const text = index.lineText(line);
    const from = line === start.line ? start.column - 1 : 0;
    const to = line === end.line ? end.column - 1 : text.length;
    // Tabs stay tabs so the carets line up; any other code point becomes one space.
    const pad = Array.from(text.slice(0, from), (c) => (c === '\t' ? '\t' : ' ')).join('');
    const carets = '^'.repeat(Math.max(1, Array.from(text.slice(from, to)).length));
    const gutter = String(line).padStart(width);
    return [
      text === '' ? `${gutter} |` : `${gutter} | ${text}`,
      `${' '.repeat(width)} | ${pad}${carets}`,
    ];
  };
  if (last - start.line >= 3) return [...rows(start.line), '...', ...rows(last)].join('\n');
  const lines = Array.from({ length: last - start.line + 1 }, (_, i) => start.line + i);
  return lines.flatMap(rows).join('\n');
}

/** The stable text of a diagnostic, read by people, agents and snapshots. */
export function formatDiagnostic(d: Diagnostic, source: string): string {
  return [
    `error[${d.code}]: ${d.message}`,
    `  --> ${d.file}:${d.start.line}:${d.start.column}`,
    codeFrame(source, d.start, d.end),
    ...d.fixes.map((fix) => `fix: ${fix}`),
    `docs: ${d.docs}`,
  ].join('\n');
}
