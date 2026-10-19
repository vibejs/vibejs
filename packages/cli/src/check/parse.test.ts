// test/fixtures/tools holds real output of the pinned tools on a copy of test/fixtures/broken,
// with node_modules linked to packages/cli/node_modules. Recorded from that copy with:
//   node node_modules/typescript/bin/tsc -b --pretty false --runExternalCode > tsc.txt
//   node node_modules/oxlint/bin/oxlint --format json > oxlint.json
//   node node_modules/oxfmt/bin/oxfmt --list-different > oxfmt.txt
//   node node_modules/vitest/vitest.mjs run --coverage --includeTaskLocation --reporter=json \
//     --outputFile.json=.vibejs/check/vitest.json --coverage.reporter=json \
//     --coverage.reportsDirectory=.vibejs/check/coverage --coverage.reportOnFailure
// Every file, including .vibejs/check/vitest.json and .vibejs/check/coverage/coverage-final.json,
// is copied with the copy's absolute path rewritten to /project and the repository's to /vibejs.
// tsc-vibe.txt holds the .vibe lines of tsc.txt and the tsc output, recorded the same way, on a
// copy of test/fixtures/clean whose src/Hello.vibe repeats an attribute (`:id="id" :id="id"`) and
// whose src/bad.ts holds a TS2322. tsc-synthetic.txt holds lines the real mapper never prints
// (a position in synthesized code, an unresolved mapper), verbatim from the content-mapper spike
// with the mapper name rewritten to @vibejs-org/language-tools@0.0.0.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ExecResult } from '../ctx.ts';
import type { Diagnostic } from '@vibejs-org/compiler';
import {
  parseCompiler,
  parseCoverage,
  parseOxfmt,
  parseOxlint,
  parseTsc,
  parseVitest,
} from './parse.ts';

const tool = (name: string) =>
  readFileSync(new URL(`../../test/fixtures/tools/${name}`, import.meta.url), 'utf8');
const ok = (stdout: string, code = 0): ExecResult => ({ code, stdout, stderr: '' });
const ROOT = '/project';
const range = (line: number, character: number, length = 0) => ({
  start: { line, character },
  end: { line, character: character + length },
});

describe('parseTsc', () => {
  const vibe = parseTsc(ok(tool('tsc-vibe.txt'), 2), ROOT)!;
  const synthetic = parseTsc(ok(tool('tsc-synthetic.txt'), 2), ROOT)!;

  it.each([
    [vibe[0], 'TS2322', 'src/App.vibe', 'src/App.vibe:6:11', range(5, 10)],
    [vibe[1], 'VIBE1102', 'src/Hello.vibe', 'src/Hello.vibe:6:17', range(5, 16)],
    // Synthesized code: the position is virtual, so no position is reported.
    [synthetic[0], 'TS2322', 'fixtures/q8/Synth.vibe', 'fixtures/q8/Synth.vibe', range(0, 0)],
    [synthetic[1], 'TS18075', '', '', range(0, 0)],
  ])('reads %s at %j', (d, code, file, loc, at) => {
    expect(d).toMatchObject({ source: 'tsc', code, severity: 'error', file, loc, range: at });
  });

  it('extracts two diagnostics of each file and keeps the continuation in the message', () => {
    expect(vibe).toHaveLength(2);
    expect(synthetic).toHaveLength(2);
    expect(synthetic[0].message).toBe(
      "Type 'string' is not assignable to type 'number'.\n  This location is in virtual code produced by the content mapper '@vibejs-org/language-tools@0.0.0' and has no corresponding location in the original file.",
    );
    expect(synthetic[1].message).toBe(
      "The content mapper package '@vibejs-org/language-tools' could not be resolved.",
    );
  });

  it('appends the TS1241 chain lines of tsc.txt to its message', () => {
    const [, ts1241, ts2322] = parseTsc(ok(tool('tsc.txt'), 2), ROOT)!;
    expect(ts1241).toMatchObject({ code: 'TS1241', loc: 'src/handler.ts:29:4' });
    expect(ts1241.message.split('\n')).toHaveLength(6);
    expect(ts1241.message.split('\n')[5]).toMatch(/^ {10}Type 'number' is not assignable/);
    expect(ts2322).toMatchObject({ code: 'TS2322', loc: 'src/math.ts:1:14' });
  });

  it.each([
    ['exit 0 without output', ok(''), []],
    [
      'a warning, an absolute path and CRLF',
      ok('/project/a.ts(1,2): warning TS1: W.\r\n'),
      [expect.objectContaining({ severity: 'warning', file: 'a.ts', loc: 'a.ts:1:2' })],
    ],
    ['an unknown line', ok('Found 1 error.', 2), null],
    ['a continuation without a diagnostic', ok('  stray', 2), null],
    ['a non-zero exit without a diagnostic', ok('', 1), null],
  ])('%s', (_, r, expected) => {
    expect(parseTsc(r, ROOT)).toEqual(expected);
  });
});

const pos = (line: number, column: number) => ({ offset: 0, line, column });
const diagnostic = (code: Diagnostic['code'], typeChecked?: true): Diagnostic => ({
  code,
  message: 'M.',
  fixes: ['F.'],
  docs: `https://vibejs.org/v0/errors/${code}`,
  file: '/project/src/A.vibe',
  start: pos(3, 1),
  end: pos(4, 12),
  ...(typeChecked && { typeChecked }),
});

describe('parseCompiler', () => {
  it.each([
    ['VIBE1000', undefined, false],
    ['VIBE1102', undefined, false],
    ['VIBE1199', undefined, false],
    ['VIBE1200', undefined, true],
    ['VIBE1201', true, false],
    ['VIBE2001', true, false],
    ['VIBE2004', undefined, true],
    ['VIBE3005', undefined, true],
    ['VIBE4001', undefined, true],
  ] as const)('%s (typeChecked %s) is kept: %s', (code, typeChecked, kept) => {
    expect(parseCompiler([diagnostic(code, typeChecked)], ROOT)).toHaveLength(kept ? 1 : 0);
  });

  it('maps 1-based positions to a 0-based range and the file to a root-relative POSIX path', () => {
    expect(parseCompiler([diagnostic('VIBE3005')], ROOT)).toEqual([
      {
        source: 'vibejs',
        code: 'VIBE3005',
        severity: 'error',
        file: 'src/A.vibe',
        loc: 'src/A.vibe:3:1',
        range: { start: { line: 2, character: 0 }, end: { line: 3, character: 11 } },
        message: 'M.',
        docs: 'https://vibejs.org/v0/errors/VIBE3005',
        fixes: ['F.'],
      },
    ]);
  });

  it('turns Windows separators into slashes', () => {
    const d = { ...diagnostic('VIBE3005'), file: 'src\\ui\\A.vibe' };
    expect(parseCompiler([d], ROOT)[0]).toMatchObject({
      file: 'src/ui/A.vibe',
      loc: 'src/ui/A.vibe:3:1',
    });
  });
});

describe('parseOxlint', () => {
  it('reads tools/oxlint.json with its help and url', () => {
    expect(parseOxlint(ok(tool('oxlint.json'), 1), ROOT)).toEqual([
      {
        source: 'oxlint',
        code: 'unicorn(no-useless-spread)',
        severity: 'error',
        file: 'src/math.ts',
        loc: 'src/math.ts:2:22',
        range: range(1, 21, 3),
        message: 'Using a spread operator here creates a new array unnecessarily.',
        docs: 'https://oxc.rs/docs/guide/usage/linter/rules/unicorn/no-useless-spread.html',
        fixes: ['Consider removing the spread operator.'],
      },
    ]);
  });

  it('reads a warning without help, url or labels', () => {
    const d = { message: 'M', code: 'x(y)', severity: 'warning', filename: 'a.ts', labels: [] };
    expect(parseOxlint(ok(JSON.stringify({ diagnostics: [d] })), ROOT)).toEqual([
      {
        source: 'oxlint',
        code: 'x(y)',
        severity: 'warning',
        file: 'a.ts',
        loc: 'a.ts',
        range: range(0, 0),
        message: 'M',
      },
    ]);
  });

  it.each(['', 'not json', 'null'])('returns null for %j', (stdout) => {
    expect(parseOxlint(ok(stdout, 1), ROOT)).toBeNull();
  });
});

describe('parseOxfmt', () => {
  it('turns each listed path into a VIBE8303 error', () => {
    expect(parseOxfmt(ok(tool('oxfmt.txt'), 1), ROOT)).toEqual([
      {
        source: 'oxfmt',
        code: 'VIBE8303',
        severity: 'error',
        file: 'src/math.ts',
        loc: 'src/math.ts',
        range: range(0, 0),
        message: '`src/math.ts` is not formatted.',
      },
    ]);
  });

  it.each([
    ['exit 0', ok(''), []],
    ['exit 1 without paths', ok('', 1), null],
    ['exit 2', ok('src/a.ts\n', 2), null],
  ])('%s', (_, r, expected) => {
    expect(parseOxfmt(r, ROOT)).toEqual(expected);
  });
});

const report = (testResults: unknown[]) =>
  JSON.stringify({
    numPassedTests: 0,
    numFailedTests: 1,
    numPendingTests: 2,
    numTodoTests: 1,
    testResults,
  });

describe('parseVitest', () => {
  it('reads tools/vitest.json: one failed assertion at its location, and the counts', () => {
    expect(parseVitest(tool('vitest.json'), ROOT)).toEqual({
      diagnostics: [
        {
          source: 'vitest',
          code: 'test-failed',
          severity: 'error',
          file: 'src/app.test.ts',
          loc: 'src/app.test.ts:10:1',
          range: range(9, 0),
          message: 'AssertionError: expected 1 to be 2 // Object.is equality',
        },
      ],
      passed: 1,
      failed: 1,
      skipped: 0,
    });
  });

  it('reports an assertion without a location and a suite error at 0:0', () => {
    const r = parseVitest(
      report([
        {
          name: '/project/a.test.ts',
          status: 'failed',
          message: '',
          assertionResults: [{ status: 'failed', failureMessages: ['Error: boom\n    at x'] }],
        },
        {
          name: '/project/b.test.ts',
          status: 'failed',
          message: 'SyntaxError: Unexpected token\n  at b.test.ts',
          assertionResults: [],
        },
        { name: '/project/c.test.ts', status: 'passed', message: '', assertionResults: [] },
      ]),
      ROOT,
    )!;
    expect(r.diagnostics.map((d) => [d.loc, d.range, d.message])).toEqual([
      ['a.test.ts', range(0, 0), 'Error: boom'],
      ['b.test.ts', range(0, 0), 'SyntaxError: Unexpected token'],
    ]);
    expect(r).toMatchObject({ passed: 0, failed: 1, skipped: 3 });
  });

  it.each([undefined, '', '{"testResults": 1}'])('returns null for the report %j', (r) => {
    expect(parseVitest(r, ROOT)).toBeNull();
  });
});

const loc = (line: number, column: number, endColumn: number | null = null) => ({
  start: { line, column },
  end: { line, column: endColumn },
});

describe('parseCoverage', () => {
  it('reads tools/coverage-final.json: one warning for the partially covered file', () => {
    expect(parseCoverage(tool('coverage-final.json'), ROOT)).toEqual({
      diagnostics: [
        {
          source: 'coverage',
          code: 'VIBE8302',
          severity: 'warning',
          file: 'src/math.ts',
          loc: 'src/math.ts:5:3',
          range: range(4, 2),
          message: '`src/math.ts` is not fully covered: statements 5:14; branches 5:3.',
        },
      ],
      lines: 100,
      branches: 50,
      functions: 100,
      statements: 91.67,
      filesBelow100: 1,
    });
  });

  it('lists uncovered statements, branches and functions by kind, implicit else included', () => {
    const file = {
      statementMap: { 0: loc(1, 0, 10), 1: loc(2, 2), 2: loc(2, 9) },
      fnMap: { 0: { decl: loc(3, 16, 20) } },
      branchMap: { 0: { loc: loc(4, 2), locations: [loc(4, 2), { start: {}, end: {} }] } },
      s: { 0: 1, 1: 0, 2: 0 },
      f: { 0: 0 },
      b: { 0: [1, 0] },
    };
    const r = parseCoverage(JSON.stringify({ '/project/src/a.ts': file }), ROOT)!;
    expect(r.diagnostics[0]).toMatchObject({ loc: 'src/a.ts:2:3', range: range(1, 2) });
    expect(r.diagnostics[0].message).toBe(
      '`src/a.ts` is not fully covered: statements 2:3, 2:10; branches 4:3; functions 3:17-3:20.',
    );
    expect(r).toMatchObject({ lines: 50, branches: 50, functions: 0, statements: 33.33 });
  });

  it('gives 100% and no diagnostics for a fully covered file and for an empty report', () => {
    const file = {
      statementMap: { 0: loc(1, 0) },
      fnMap: {},
      branchMap: {},
      s: { 0: 3 },
      f: {},
      b: {},
    };
    const full = { diagnostics: [], lines: 100, branches: 100, functions: 100, statements: 100 };
    expect(parseCoverage(JSON.stringify({ '/project/a.ts': file }), ROOT)).toEqual({
      ...full,
      filesBelow100: 0,
    });
    expect(parseCoverage('{}', ROOT)).toEqual({ ...full, filesBelow100: 0 });
  });

  it.each([undefined, 'not json', '{"a.ts": {}}'])('returns null for the report %j', (r) => {
    expect(parseCoverage(r, ROOT)).toBeNull();
  });
});
