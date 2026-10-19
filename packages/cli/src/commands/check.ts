import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS_BASE, type VibeError } from '@vibejs-org/errors';
import { CATALOG, type CatalogEntry } from '../catalog.gen.ts';
import { parseCoverage, parseOxfmt, parseOxlint, parseTsc, parseVitest } from '../check/parse.ts';
import type { CommandDef } from '../command.ts';
import type { Ctx, ExecResult } from '../ctx.ts';
import { vibeError } from '../errors.gen.ts';
import {
  envelopeError,
  type CheckDiagnostic,
  type CheckResult,
  type JsonEnvelope,
  type Step,
} from '../output.ts';
import { findRoot, installCommand, packageManager, resolveTool } from '../project.ts';

const STEPS = ['types', 'lint', 'format', 'test'] as const;
type StepName = (typeof STEPS)[number];

/** The packages each step runs, with the bin it runs (`''`: loaded by the bin before it). */
const TOOLS: Record<StepName, [pkg: string, bin: string][]> = {
  types: [['typescript', 'tsc']],
  lint: [['oxlint', 'oxlint']],
  format: [['oxfmt', 'oxfmt']],
  test: [
    ['vitest', 'vitest'],
    ['@vitest/coverage-v8', ''],
  ],
};

const OUT = '.vibejs/check';
const ARGS: Record<StepName, string[]> = {
  types: ['-b', '--pretty', 'false', '--runExternalCode'],
  lint: ['--format', 'json'],
  format: ['--list-different'],
  test: [
    'run',
    '--coverage',
    '--includeTaskLocation',
    '--reporter=json',
    `--outputFile.json=${OUT}/vitest.json`,
    '--coverage.reporter=json',
    `--coverage.reportsDirectory=${OUT}/coverage`,
    // Coverage is still written when a test fails.
    '--coverage.reportOnFailure',
  ],
};

/** TypeScript 7.1 runs content mappers; a 7.1 nightly (`7.1.0-dev.*`) passes. */
const tsTooOld = (version: string) => {
  const [major, minor] = version.split('.').map(Number);
  return major < 7 || (major === 7 && minor < 1);
};

const TS1241_FIX =
  'the handler must be `(ctx: Ctx<typeof contract.route>)` and return the route response type; do not cast or use `any`';

/** Adds docs and fixes: from the catalog for a VIBE code, from a static map for TS1241 on `@Handle(`. */
export function enrich(
  d: CheckDiagnostic,
  catalog: readonly CatalogEntry[],
  sourceLine?: string,
): CheckDiagnostic {
  const entry = /^VIBE\d{4}$/.test(d.code) && catalog.find((e) => e.code === d.code);
  if (entry) return { ...d, docs: entry.docs, fixes: [...entry.fixes] };
  if (d.code === 'TS1241' && sourceLine?.trimStart().startsWith('@Handle(')) {
    return { ...d, docs: new URL('../server/handlers', DOCS_BASE).href, fixes: [TS1241_FIX] };
  }
  return d;
}

const SEVERITY = ['error', 'warning', 'info'];
const SOURCE = ['vibejs', 'tsc', 'vitest', 'oxlint', 'coverage', 'oxfmt'];

const order = (a: CheckDiagnostic, b: CheckDiagnostic) =>
  SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity) ||
  SOURCE.indexOf(a.source) - SOURCE.indexOf(b.source) ||
  (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
  a.range.start.line - b.range.start.line ||
  a.range.start.character - b.range.start.character;

const read = (file: string) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

const sourceLine = (root: string, d: CheckDiagnostic) =>
  read(join(root, d.file))?.split(/\r?\n/)[d.range.start.line];

const ZERO = { line: 0, character: 0 };

/** The VIBE8301 error of a tool whose output did not parse, and its diagnostic with 40 lines of that output. */
function unreadable(tool: string, r: ExecResult): [VibeError, CheckDiagnostic] {
  const e = vibeError('VIBE8301', { tool, exitCode: r.code });
  const output = (r.stderr.trim() || r.stdout.trim()).split(/\r?\n/).slice(0, 40).join('\n');
  const d: CheckDiagnostic = {
    source: 'vibejs',
    code: 'VIBE8301',
    severity: 'error',
    file: '',
    loc: '',
    range: { start: ZERO, end: ZERO },
    message: `${envelopeError(e).message}\n${output}`,
  };
  return [e, d];
}

/** A step over its diagnostics; `undefined` diagnostics mean it did not run. */
const step = (ds: CheckDiagnostic[] | null | undefined, ms = 0): Step => {
  const errors = ds?.filter((d) => d.severity === 'error').length ?? 0;
  const status = !ds ? 'skipped' : errors ? 'failed' : 'passed';
  return { status, errors, warnings: (ds?.length ?? 0) - errors, ms };
};

const TOTALS = { lines: 0, branches: 0, functions: 0, statements: 0, filesBelow100: 0 };

function failed(ctx: Ctx, error: JsonEnvelope['error'], next?: string[]): CheckResult {
  const skipped = step(undefined);
  return {
    ok: false,
    command: 'check',
    version: ctx.version,
    next,
    error,
    durationMs: 0,
    steps: {
      types: skipped,
      lint: skipped,
      format: skipped,
      tests: { ...skipped, passed: 0, failed: 0, skipped: 0 },
      coverage: { ...skipped, ...TOTALS },
    },
    diagnostics: [],
  };
}

const usage = (ctx: Ctx, name: string) =>
  failed(ctx, envelopeError(vibeError('VIBE8004', { name })), ['vibejs check --help']);

export const check: CommandDef<CheckResult> = {
  name: 'check',
  summary: 'Type-check, lint, format-check and test the project with coverage, concurrently.',
  usage: 'vibejs check [--only types,lint,format,test] [--fix] [--max N]',
  examples: ['vibejs check', 'vibejs check --only types,lint', 'vibejs check --fix --max 50'],
  options: {
    only: { type: 'string', description: 'Run only these steps: types, lint, format, test.' },
    fix: { type: 'boolean', description: 'Apply lint fixes and format the files first.' },
    max: { type: 'string', description: 'Show at most N diagnostics (default 20).' },
  },
  positionals: [],
  async run({ values }, ctx) {
    const only = typeof values.only === 'string' ? values.only.split(',') : [...STEPS];
    const bad = only.find((s) => !(STEPS as readonly string[]).includes(s));
    if (bad !== undefined) return usage(ctx, bad);
    const max = typeof values.max === 'string' ? values.max : '20';
    if (!/^[1-9]\d*$/.test(max)) return usage(ctx, max);

    const root = findRoot(ctx.cwd);
    if (!root) return failed(ctx, envelopeError(vibeError('VIBE8001', { cwd: ctx.cwd })));

    const bins: Partial<Record<StepName, string>> = {};
    const missing: string[] = [];
    for (const s of STEPS.filter((name) => only.includes(name))) {
      for (const [pkg, bin] of TOOLS[s]) {
        const tool = resolveTool(root, pkg, bin);
        if (!tool || (pkg === 'typescript' && tsTooOld(tool.version))) missing.push(pkg);
        else if (bin) bins[s] = tool.bin;
      }
    }
    if (missing.length) {
      // ponytail: `typescript@next` until TypeScript 7.1 is stable, then plain `typescript`.
      const pkgs = missing.map((pkg) => (pkg === 'typescript' ? 'typescript@next' : pkg));
      const install = installCommand(packageManager(root), pkgs);
      const minimum = missing.includes('typescript') ? '7.1' : 'any version';
      const e = vibeError('VIBE8005', { tool: missing.join(', '), minimum, install });
      return failed(ctx, envelopeError(e), [install]);
    }

    const start = ctx.now();
    const exec = (bin: string, args: string[]) =>
      ctx.exec(process.execPath, [bin, ...args], { cwd: root });
    if (values.fix) {
      if (bins.lint) await exec(bins.lint, ['--fix']);
      if (bins.format) await exec(bins.format, ['--write']);
    }
    // A report left by an earlier run is never read.
    rmSync(join(root, OUT), { recursive: true, force: true });
    const runs = await Promise.all(
      STEPS.map(async (s) => {
        const bin = bins[s];
        if (!bin) return undefined;
        const at = ctx.now();
        const r = await exec(bin, ARGS[s]);
        return { r, ms: ctx.now() - at };
      }),
    );
    const [types, lint, format, tests] = runs;

    const errors: VibeError[] = [];
    const or8301 = (tool: string, r: ExecResult, ds: CheckDiagnostic[] | null | undefined) => {
      if (ds) return ds;
      const [e, d] = unreadable(tool, r);
      errors.push(e);
      return [d];
    };
    const tsc = types && or8301('tsc', types.r, parseTsc(types.r, root));
    const oxlint = lint && or8301('oxlint', lint.r, parseOxlint(lint.r, root));
    const oxfmt = format && or8301('oxfmt', format.r, parseOxfmt(format.r, root));
    const report = tests && parseVitest(read(join(root, OUT, 'vitest.json')), root);
    const totals =
      report && parseCoverage(read(join(root, OUT, 'coverage/coverage-final.json')), root);
    const vitest = tests && or8301('vitest', tests.r, report?.diagnostics);
    // Without a test report there is no coverage to read.
    const coverage = tests && report && or8301('vitest', tests.r, totals?.diagnostics);

    const all = [tsc, oxlint, oxfmt, vitest, coverage]
      .flatMap((ds) => ds ?? [])
      .map((d) => enrich(d, CATALOG, d.code === 'TS1241' ? sourceLine(root, d) : undefined))
      .toSorted(order);
    const shown = all.slice(0, Number(max));
    const explain = shown.find((d) => /^VIBE\d{4}$/.test(d.code));
    const next = [
      ...(explain ? [`vibejs explain ${explain.code}`] : []),
      ...(all.some((d) => d.source === 'oxfmt') ? ['vibejs check --fix'] : []),
    ];
    const first = errors.at(0);
    const error = first && envelopeError(first);
    return {
      ok: !error && !all.some((d) => d.severity === 'error'),
      command: 'check',
      version: ctx.version,
      next: next.length ? next : undefined,
      error,
      durationMs: ctx.now() - start,
      steps: {
        types: step(tsc, types?.ms),
        lint: step(oxlint, lint?.ms),
        format: step(oxfmt, format?.ms),
        tests: {
          ...step(vitest, tests?.ms),
          passed: report?.passed ?? 0,
          failed: report?.failed ?? 0,
          skipped: report?.skipped ?? 0,
        },
        coverage: {
          ...step(coverage, tests?.ms),
          lines: totals?.lines ?? 0,
          branches: totals?.branches ?? 0,
          functions: totals?.functions ?? 0,
          statements: totals?.statements ?? 0,
          filesBelow100: totals?.filesBelow100 ?? 0,
        },
      },
      diagnostics: shown,
      truncated: all.length > shown.length ? { shown: shown.length, total: all.length } : undefined,
    };
  },
  human(r) {
    const lines = r.diagnostics.map(
      (d) => `${d.loc}  ${d.severity}  ${d.code}  ${d.message.split('\n', 1)[0]}`,
    );
    if (r.truncated) lines.push(`(${r.truncated.shown} of ${r.truncated.total} diagnostics shown)`);
    for (const [name, { status, errors, warnings, ms, ...counts }] of Object.entries(r.steps)) {
      const extra = Object.entries(counts).map(([key, n]) => `, ${key} ${n}`);
      lines.push(
        `${name}: ${status} (${errors} errors, ${warnings} warnings, ${Math.round(ms)} ms${extra.join('')})`,
      );
    }
    return lines.join('\n');
  },
};
