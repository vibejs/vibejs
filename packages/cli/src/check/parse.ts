// Pure parsers of the tool outputs `vibejs check` reads. Each returns null for output it cannot
// read (VIBE8301). Paths become root-relative POSIX paths.
import { relative, resolve } from 'node:path';
import type { Diagnostic } from '@usevibejs/compiler';
import type { ExecResult } from '../ctx.ts';
import { vibeError } from '../errors.gen.ts';
import { envelopeError, type CheckDiagnostic } from '../output.ts';

/** A 1-based position; `length` extends the range on the same line. */
interface Pos {
  line: number;
  column: number;
  length?: number;
}

const rel = (root: string, file: string) =>
  relative(root, resolve(root, file)).replaceAll('\\', '/');

/** A diagnostic at `pos`; without one, the range is 0:0 and `loc` the bare file. */
function at(
  source: CheckDiagnostic['source'],
  code: string,
  severity: CheckDiagnostic['severity'],
  file: string,
  message: string,
  pos?: Pos,
): CheckDiagnostic {
  const start = { line: (pos?.line ?? 1) - 1, character: (pos?.column ?? 1) - 1 };
  const end = { line: start.line, character: start.character + (pos?.length ?? 0) };
  const loc = pos ? `${file}:${pos.line}:${pos.column}` : file;
  return { source, code, severity, file, loc, range: { start, end }, message };
}

/** The C6 line format; the location is absent on global diagnostics (TS18075). */
const TSC = /^(?:(.+?)\((\d+),(\d+)\): )?(error|warning) ([A-Z]+\d+): (.*)$/;
/** A continuation that marks the position as one in synthesized virtual code. */
const VIRTUAL = 'in virtual code produced by the content mapper';

/** `tsc -b --pretty false` output (stdout). */
export function parseTsc(r: ExecResult, root: string): CheckDiagnostic[] | null {
  const found: {
    severity: 'error' | 'warning';
    code: string;
    file: string;
    message: string;
    pos?: Pos;
  }[] = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    const prev = found.at(-1);
    if (!line) continue;
    if (prev && /^\s/.test(line)) {
      prev.message += `\n${line}`;
      if (line.includes(VIRTUAL)) prev.pos = undefined;
      continue;
    }
    const m = TSC.exec(line);
    if (!m) return null;
    const [, file, row, column, severity, code, message] = m;
    const pos = file ? { line: Number(row), column: Number(column) } : undefined;
    found.push({
      severity: severity === 'warning' ? 'warning' : 'error',
      code,
      file: file ? rel(root, file) : '',
      message,
      pos,
    });
  }
  if (r.code !== 0 && !found.length) return null;
  return found.map((d) => at('tsc', d.code, d.severity, d.file, d.message, d.pos));
}

/** The compiler diagnostics of `.vibe` files, without the `typeChecked` ones tsc finds itself (CONTRACTS C6). */
export function parseCompiler(diagnostics: readonly Diagnostic[], root: string): CheckDiagnostic[] {
  return diagnostics
    .filter((d) => !d.typeChecked)
    .map(({ code, message, docs, fixes, file: path, start, end }) => {
      const file = rel(root, path);
      return {
        source: 'vibejs',
        code,
        severity: 'error',
        file,
        loc: `${file}:${start.line}:${start.column}`,
        range: {
          start: { line: start.line - 1, character: start.column - 1 },
          end: { line: end.line - 1, character: end.column - 1 },
        },
        message,
        docs,
        fixes: [...fixes],
      };
    });
}

interface OxlintReport {
  diagnostics: {
    message: string;
    code: string;
    severity: string;
    url?: string;
    help?: string;
    filename: string;
    labels: { span: Pos }[];
  }[];
}

/** `oxlint --format json` output. */
export function parseOxlint(r: ExecResult, root: string): CheckDiagnostic[] | null {
  try {
    const report: OxlintReport = JSON.parse(r.stdout);
    return report.diagnostics.map((d) => ({
      ...at(
        'oxlint',
        d.code,
        d.severity === 'error' ? 'error' : 'warning',
        rel(root, d.filename),
        d.message,
        d.labels[0]?.span,
      ),
      ...(d.url && { docs: d.url }),
      ...(d.help && { fixes: [d.help] }),
    }));
  } catch {
    return null;
  }
}

const text = (e: Parameters<typeof envelopeError>[0]) => envelopeError(e).message;

/** `oxfmt --list-different` output: one path per line, exit 1 when any file differs. */
export function parseOxfmt(r: ExecResult, root: string): CheckDiagnostic[] | null {
  if (r.code === 0) return [];
  const files = r.stdout.split(/\r?\n/).filter(Boolean);
  if (r.code !== 1 || !files.length) return null;
  return files.map((path) => {
    const file = rel(root, path);
    return at('oxfmt', 'VIBE8303', 'error', file, text(vibeError('VIBE8303', { file })));
  });
}

interface VitestReport {
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  testResults: {
    name: string;
    status: string;
    message: string;
    assertionResults: { status: string; failureMessages: string[]; location?: Pos }[];
  }[];
}

const firstLine = (s: string) => s.split('\n', 1)[0];

/** The Vitest JSON report (`--reporter=json --includeTaskLocation`). */
export function parseVitest(
  report: string | undefined,
  root: string,
): { diagnostics: CheckDiagnostic[]; passed: number; failed: number; skipped: number } | null {
  try {
    const r: VitestReport = JSON.parse(report!);
    const diagnostics: CheckDiagnostic[] = [];
    for (const result of r.testResults) {
      const file = rel(root, result.name);
      const failed = result.assertionResults.filter((a) => a.status === 'failed');
      for (const a of failed) {
        const message = firstLine(a.failureMessages[0]);
        diagnostics.push(at('vitest', 'test-failed', 'error', file, message, a.location));
      }
      // A file that failed outside any test: a syntax error or a throw at import.
      if (result.status === 'failed' && !failed.length) {
        diagnostics.push(at('vitest', 'test-failed', 'error', file, firstLine(result.message)));
      }
    }
    return {
      diagnostics,
      passed: r.numPassedTests,
      failed: r.numFailedTests,
      skipped: r.numPendingTests + r.numTodoTests,
    };
  } catch {
    return null;
  }
}

/** An istanbul location: lines 1-based, columns 0-based; v8 leaves end columns null. */
interface Loc {
  start: { line: number; column: number };
  end: { line: number; column: number | null };
}

interface FileCoverage {
  statementMap: Record<string, Loc>;
  fnMap: Record<string, { decl: Loc }>;
  branchMap: Record<
    string,
    { loc: Loc; locations: { start: Partial<Loc['start']>; end: Partial<Loc['end']> }[] }
  >;
  s: Record<string, number>;
  f: Record<string, number>;
  b: Record<string, number[]>;
}

/** An implicit else has the empty location `{ start: {}, end: {} }`. */
const isLoc = (l: FileCoverage['branchMap'][string]['locations'][number]): l is Loc =>
  l.start.line !== undefined;

const KINDS = ['lines', 'branches', 'functions', 'statements'] as const;
type Kind = (typeof KINDS)[number];

const point = ({ line, column }: Loc['start']) => `${line}:${column + 1}`;
const span = ({ start, end }: Loc) =>
  end.column === null ? point(start) : `${point(start)}-${end.line}:${end.column}`;

/** The uncovered locations of one file by kind, and its covered and total counts per kind. */
function fileCoverage(c: FileCoverage) {
  const statements = Object.entries(c.statementMap);
  const lines = new Map<number, number>();
  for (const [id, loc] of statements) {
    lines.set(loc.start.line, Math.max(lines.get(loc.start.line) ?? 0, c.s[id]));
  }
  const branches = Object.entries(c.branchMap).flatMap(([id, branch]) =>
    branch.locations.map((loc, i) => ({
      count: c.b[id][i],
      // An implicit else has an empty location: report the branch itself.
      loc: isLoc(loc) ? loc : branch.loc,
    })),
  );
  const counts: Record<Kind, number[]> = {
    lines: [...lines.values()],
    branches: branches.map((b) => b.count),
    functions: Object.values(c.f),
    statements: Object.values(c.s),
  };
  const uncovered = {
    statements: statements.filter(([id]) => c.s[id] === 0).map(([, loc]) => loc),
    branches: branches.filter((b) => b.count === 0).map((b) => b.loc),
    functions: Object.entries(c.fnMap)
      .filter(([id]) => c.f[id] === 0)
      .map(([, fn]) => fn.decl),
  };
  return { counts, uncovered };
}

const percent = (covered: number, total: number) =>
  total ? Math.round((covered / total) * 10_000) / 100 : 100;

/** The istanbul `coverage-final.json` report: one VIBE8302 warning per file below 100%. */
export function parseCoverage(
  report: string | undefined,
  root: string,
): {
  diagnostics: CheckDiagnostic[];
  lines: number;
  branches: number;
  functions: number;
  statements: number;
  filesBelow100: number;
} | null {
  try {
    const files: Record<string, FileCoverage> = JSON.parse(report!);
    const diagnostics: CheckDiagnostic[] = [];
    const totals = Object.fromEntries(KINDS.map((k) => [k, { covered: 0, total: 0 }]));
    for (const [path, data] of Object.entries(files)) {
      const { counts, uncovered } = fileCoverage(data);
      for (const kind of KINDS) {
        totals[kind].covered += counts[kind].filter((n) => n > 0).length;
        totals[kind].total += counts[kind].length;
      }
      const ranges = Object.entries(uncovered).filter(([, locs]) => locs.length);
      if (!ranges.length) continue;
      const file = rel(root, path);
      const list = ranges.map(([kind, locs]) => `${kind} ${locs.map(span).join(', ')}`).join('; ');
      const first = Object.values(uncovered)
        .flat()
        .map((loc) => loc.start)
        .toSorted((a, b) => a.line - b.line || a.column - b.column)[0];
      const message = text(vibeError('VIBE8302', { file, uncovered: list }));
      const pos = { line: first.line, column: first.column + 1 };
      diagnostics.push(at('coverage', 'VIBE8302', 'warning', file, message, pos));
    }
    const pct = (kind: Kind) => percent(totals[kind].covered, totals[kind].total);
    return {
      diagnostics,
      lines: pct('lines'),
      branches: pct('branches'),
      functions: pct('functions'),
      statements: pct('statements'),
      filesBelow100: diagnostics.length,
    };
  } catch {
    return null;
  }
}
