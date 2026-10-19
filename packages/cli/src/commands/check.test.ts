import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../catalog.gen.ts';
import type { Ctx, ExecResult } from '../ctx.ts';
import { exitCode, type CheckDiagnostic, type CheckResult } from '../output.ts';
import { check, enrich } from './check.ts';

const fixtures = new URL('../../test/fixtures/', import.meta.url);
const tool = (name: string) => readFileSync(new URL(`tools/${name}`, fixtures), 'utf8');

type Tool = 'tsc' | 'oxlint' | 'oxfmt' | 'vitest';
type Reply = (args: string[], cwd: string) => ExecResult | Promise<ExecResult>;

let root: string;

function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** Installs a stub package: only its package.json, which is all resolveTool reads. */
function install(pkg: string, version: string, bin?: string): void {
  write(`node_modules/${pkg}/package.json`, JSON.stringify({ name: pkg, version, bin }));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibejs-check-'));
  // broken/ holds the sources the recorded output points into (TS1241 reads its line).
  cpSync(new URL('broken', fixtures), root, { recursive: true });
  install('typescript', '7.1.0-dev.20261015.1', 'bin/tsc');
  install('oxlint', '1.88.0', 'bin/oxlint');
  install('oxfmt', '0.73.0', 'bin/oxfmt');
  install('vitest', '5.0.5', 'vitest.mjs');
  install('@vitest/coverage-v8', '5.0.5');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const result = (stdout: string, code = 0, stderr = ''): ExecResult => ({ code, stdout, stderr });

/** Writes the Vitest reports the way `vitest run` does, with /project replaced by the root. */
const vitestWrites =
  (report: string | undefined, coverage: string | undefined, code = 1, stderr = ''): Reply =>
  (args, cwd) => {
    expect(args).toContain(`--outputFile.json=${join(cwd, '.vibejs/check/vitest.json')}`);
    const at = (s: string) => s.replaceAll('/project', JSON.stringify(cwd).slice(1, -1));
    if (report !== undefined) write('.vibejs/check/vitest.json', at(report));
    if (coverage !== undefined) write('.vibejs/check/coverage/coverage-final.json', at(coverage));
    return result('', code, stderr);
  };

const BROKEN: Record<Tool, Reply> = {
  tsc: () => result(tool('tsc.txt'), 2),
  oxlint: () => result(tool('oxlint.json'), 1),
  oxfmt: () => result(tool('oxfmt.txt'), 1),
  vitest: vitestWrites(tool('vitest.json'), tool('coverage-final.json')),
};

const EMPTY_REPORT = JSON.stringify({
  numPassedTests: 2,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [],
});

const CLEAN: Record<Tool, Reply> = {
  tsc: () => result(''),
  oxlint: () => result('{"diagnostics": []}'),
  oxfmt: () => result(''),
  vitest: vitestWrites(EMPTY_REPORT, '{}', 0),
};

/** Runs `vibejs check` against the temp root; `calls` lists each tool run with its arguments. */
async function run(
  values: Record<string, string | boolean> = {},
  replies: Record<string, Reply> = BROKEN,
) {
  const calls: string[][] = [];
  const ctx: Ctx = {
    version: '1.2.3',
    agent: { active: true },
    docsDir: '',
    cwd: join(root, 'src'),
    now: () => 0,
    async exec(file, [bin, ...args], { cwd }) {
      expect(file).toBe(process.execPath);
      expect(cwd).toBe(root);
      const name = basename(bin, '.mjs');
      calls.push([name, ...args]);
      return replies[name](args, cwd);
    },
    out: () => {},
    err: () => {},
  };
  const r = await check.run({ values, positionals: [] }, ctx);
  return { r, calls };
}

describe('the recorded output of broken/', () => {
  it('gives exactly the six seeded diagnostics, enriched, in order, with exit 1', async () => {
    const { r } = await run();
    expect(exitCode(r)).toBe(1);
    expect(r.diagnostics.map((d) => [d.source, d.code, d.loc])).toEqual([
      ['tsc', 'TS1241', 'src/handler.ts:29:4'],
      ['tsc', 'TS2322', 'src/math.ts:1:14'],
      ['vitest', 'test-failed', 'src/app.test.ts:10:1'],
      ['oxlint', 'unicorn(no-useless-spread)', 'src/math.ts:2:22'],
      ['oxfmt', 'VIBE8303', 'src/math.ts'],
      ['coverage', 'VIBE8302', 'src/math.ts:5:3'],
    ]);
    // The snapshot pins every field and the key order of the envelope.
    expect(JSON.stringify(r, null, 2)).toMatchSnapshot();
  });

  it('renders each diagnostic with its continuation lines and one line per step for people', async () => {
    const { r } = await run();
    expect(check.human(r)).toMatchSnapshot();
  });
});

describe('enrich', () => {
  const ts1241 = {
    source: 'tsc',
    code: 'TS1241',
    severity: 'error',
    file: 'a.ts',
    loc: 'a.ts:2:4',
    range: { start: { line: 1, character: 3 }, end: { line: 1, character: 3 } },
    message: 'Unable to resolve signature of method decorator when called as an expression.',
  } satisfies CheckDiagnostic;
  const entry: CatalogEntry = {
    code: 'VIBE6001',
    package: 'language-tools',
    title: 'Unknown directive',
    message: 'Unknown directive {name}.',
    fixes: ['Remove it.'],
    body: '',
    docs: 'https://vibejs.org/v0/errors/VIBE6001',
    retired: false,
  };

  it('links TS1241 on an @Handle( line to the handler docs with the C9 fix', () => {
    expect(enrich(ts1241, [], '  @Handle(users.get)')).toEqual({
      ...ts1241,
      docs: 'https://vibejs.org/v0/server/handlers',
      fixes: [
        'the handler must be `(ctx: Ctx<typeof contract.route>)` and return the route response type; do not cast or use `any`',
      ],
    });
  });

  it.each([['  @Other(x)'], [undefined]])('leaves TS1241 on the line %j unchanged', (line) => {
    expect(enrich(ts1241, [], line)).toBe(ts1241);
  });

  it('gives a VIBE code of the catalog its docs and fixes, and passes others through', () => {
    const vibe = { ...ts1241, code: 'VIBE6001' };
    expect(enrich(vibe, [entry])).toEqual({ ...vibe, docs: entry.docs, fixes: ['Remove it.'] });
    const unknown = { ...ts1241, code: 'VIBE6999' };
    expect(enrich(unknown, [entry])).toBe(unknown);
    const lint = { ...ts1241, code: 'eslint(no-debugger)' };
    expect(enrich(lint, [entry], '@Handle(')).toBe(lint);
  });

  it('does not enrich TS1241 when its file cannot be read', async () => {
    const { r } = await run(
      { only: 'types' },
      { ...CLEAN, tsc: () => result('missing.ts(1,1): error TS1241: Unable to resolve.\n', 2) },
    );
    expect(r.diagnostics[0]).not.toHaveProperty('docs');
  });
});

describe('coverage below 100%', () => {
  it('is a warning only: ok, exit 0, one VIBE8302 per file, with the thresholds off', async () => {
    const vitest = vitestWrites(EMPTY_REPORT, tool('coverage-final.json'), 0);
    const { r, calls } = await run({}, { ...CLEAN, vitest });
    // The user's thresholds opt-in never fails vitest (C9).
    expect(calls.find(([name]) => name === 'vitest')).toEqual(
      expect.arrayContaining([
        '--coverage.thresholds.100=false',
        '--coverage.thresholds.lines=0',
        '--coverage.thresholds.functions=0',
        '--coverage.thresholds.branches=0',
        '--coverage.thresholds.statements=0',
      ]),
    );
    expect(r.ok).toBe(true);
    expect(exitCode(r)).toBe(0);
    expect(r.diagnostics.map((d) => [d.code, d.severity, d.file])).toEqual([
      ['VIBE8302', 'warning', 'src/math.ts'],
    ]);
    expect(r.steps.coverage).toMatchObject({ status: 'passed', warnings: 1, filesBelow100: 1 });
    expect(r.next).toEqual(['vibejs explain VIBE8302']);
  });

  it('gives a clean project ok with no next commands', async () => {
    const { r } = await run({}, CLEAN);
    expect(r).toMatchObject({ ok: true, diagnostics: [] });
    expect(r.next).toBeUndefined();
    expect(r.steps.coverage).toMatchObject({ lines: 100, filesBelow100: 0 });
    expect(r.steps.tests).toMatchObject({ status: 'passed', passed: 2 });
  });
});

it('gives a vitest exit without a failed test (an unhandled error) one error and exit 1', async () => {
  const noise = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
  const vitest = vitestWrites(EMPTY_REPORT, '{}', 1, noise);
  const { r } = await run({ only: 'test' }, { ...CLEAN, vitest });
  expect(exitCode(r)).toBe(1);
  expect(r.error).toBeUndefined();
  expect(r.diagnostics).toHaveLength(1);
  expect(r.diagnostics[0]).toMatchObject({ source: 'vitest', code: 'test-failed', loc: '' });
  expect(r.diagnostics[0].message.split('\n')).toEqual([
    '`vitest` exited with code 1 without a failed test.',
    ...noise.split('\n').slice(0, 40),
  ]);
  expect(r.steps.tests).toMatchObject({ status: 'failed', errors: 1, passed: 2, failed: 0 });
});

describe('required tools', () => {
  it.each([
    ['vitest', () => rmSync(join(root, 'node_modules/vitest'), { recursive: true }), 'vitest'],
    [
      '@vitest/coverage-v8',
      () => rmSync(join(root, 'node_modules/@vitest'), { recursive: true }),
      '@vitest/coverage-v8',
    ],
    ['typescript 7.0.2', () => install('typescript', '7.0.2', 'bin/tsc'), 'typescript@next'],
    ['typescript 6.0.3', () => install('typescript', '6.0.3', 'bin/tsc'), 'typescript@next'],
    ['oxlint without a bin', () => install('oxlint', '1.88.0'), 'oxlint'],
  ])(
    '%s gives VIBE8005 with the install command, exit 2 and no tool run',
    async (_, setup, pkg) => {
      setup();
      write('pnpm-lock.yaml', '');
      const { r, calls } = await run();
      const command = `pnpm add -D ${pkg}`;
      expect(calls).toEqual([]);
      expect(exitCode(r)).toBe(2);
      expect(r).toMatchObject({ ok: false, next: [command], error: { code: 'VIBE8005' } });
      expect(r.error!.fixes).toEqual([`Run \`${command}\` in the project root.`]);
    },
  );

  it('names every missing package in one error, and the 7.1 minimum for typescript alone', async () => {
    install('typescript', '7.0.2', 'bin/tsc');
    expect((await run()).r.error!.message).toBe(
      '`typescript` is missing or older than 7.1; install it with `npm install -D typescript@next`.',
    );
    rmSync(join(root, 'node_modules/oxlint'), { recursive: true });
    expect((await run()).r.error!.message).toBe(
      '`typescript, oxlint` is missing or older than the required version; install it with `npm install -D typescript@next oxlint`.',
    );
  });

  it('checks only the tools of the selected steps', async () => {
    rmSync(join(root, 'node_modules/vitest'), { recursive: true });
    install('typescript', '7.0.2', 'bin/tsc');
    const { r } = await run({ only: 'lint' });
    expect(r.error).toBeUndefined();
  });

  it.each(['7.1.0-dev.20261015.1', '7.1.0', '8.0.0'])('lets typescript %s pass', async (v) => {
    install('typescript', v, 'bin/tsc');
    expect((await run({ only: 'types' }, CLEAN)).r.ok).toBe(true);
  });
});

describe('unreadable tool output', () => {
  const noise = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');

  it('gives exit 2 and VIBE8301 with 40 output lines and keeps the other diagnostics', async () => {
    const { r } = await run({}, { ...BROKEN, tsc: () => result('', 134, noise) });
    expect(exitCode(r)).toBe(2);
    expect(r.error).toMatchObject({
      code: 'VIBE8301',
      message: '`tsc` exited with code 134 and output that vibejs check cannot read.',
    });
    const [crash, ...rest] = r.diagnostics;
    expect(crash).toMatchObject({ source: 'vibejs', code: 'VIBE8301', file: '', loc: '' });
    expect(crash.message.split('\n')).toEqual([
      '`tsc` exited with code 134 and output that vibejs check cannot read.',
      ...noise.split('\n').slice(0, 40),
    ]);
    expect(rest.map((d) => d.source)).toEqual(['vitest', 'oxlint', 'oxfmt', 'coverage']);
    expect(r.steps.types).toMatchObject({ status: 'failed', errors: 1 });
  });

  it('reads the output from stdout when stderr is empty, for each tool', async () => {
    const { r } = await run(
      {},
      {
        tsc: () => result('?', 2),
        oxlint: () => result('not json', 1),
        oxfmt: () => result('', 2),
        vitest: vitestWrites(EMPTY_REPORT, 'not json', 0),
      },
    );
    expect(r.diagnostics.map((d) => d.message.split('\n'))).toEqual([
      ['`tsc` exited with code 2 and output that vibejs check cannot read.', '?'],
      ['`oxlint` exited with code 1 and output that vibejs check cannot read.', 'not json'],
      ['`oxfmt` exited with code 2 and output that vibejs check cannot read.', ''],
      ['`vitest` exited with code 0 and output that vibejs check cannot read.', ''],
    ]);
    expect(r.error!.message).toContain('`tsc`');
    expect(r.steps.coverage.status).toBe('failed');
  });

  it('never reads a stale vitest.json: no new report is VIBE8301', async () => {
    write('.vibejs/check/vitest.json', tool('vitest.json'));
    const { r } = await run(
      {},
      { ...CLEAN, vitest: () => result('', 1, 'Error: Cannot find module vitest.config.ts') },
    );
    expect(exitCode(r)).toBe(2);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0].message).toContain('Cannot find module vitest.config.ts');
    expect(r.steps.coverage.status).toBe('skipped');
    expect(existsSync(join(root, '.vibejs/check/vitest.json'))).toBe(false);
  });
});

const lint = (severity: string, line: number) => ({
  message: severity,
  code: 'eslint(x)',
  severity,
  filename: 'a.ts',
  labels: [{ span: { offset: 0, length: 1, line, column: 1 } }],
});
const failure = (line: number) => ({
  status: 'failed',
  failureMessages: ['Error: x'],
  location: { line, column: 1 },
});

describe('ordering and the cap', () => {
  // 25 diagnostics: 8 tsc errors over two files, 3 failed tests, 6 oxlint (3 errors, 3
  // warnings), 5 unformatted files and 3 partially covered files.
  const tsc = ['b.ts(2,1)', 'a.ts(3,5)', 'a.ts(3,2)', 'b.ts(1,1)', 'a.ts(1,1)', 'c.ts(1,1)']
    .concat(['a.ts(3,2)', 'b.ts(9,9)'])
    .map((at) => `${at}: error TS2322: E.`)
    .join('\n');
  const oxlint = JSON.stringify({
    diagnostics: [1, 2, 3].flatMap((line) => [lint('warning', line), lint('error', line)]),
  });
  const report = JSON.stringify({
    numPassedTests: 0,
    numFailedTests: 3,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [
      {
        name: '/project/a.test.ts',
        status: 'failed',
        message: '',
        assertionResults: [failure(3), failure(1), failure(2)],
      },
    ],
  });
  const partial = { statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1 } } } };
  const file = { ...partial, fnMap: {}, branchMap: {}, s: { 0: 0 }, f: {}, b: {} };
  const coverage = JSON.stringify({
    '/project/x.ts': file,
    '/project/y.ts': file,
    '/project/z.ts': file,
  });
  const MANY: Record<Tool, Reply> = {
    tsc: () => result(tsc, 2),
    oxlint: () => result(oxlint, 1),
    oxfmt: () => result('e.ts\nd.ts\nc.ts\nb.ts\na.ts\n', 1),
    vitest: vitestWrites(report, coverage),
  };

  it('shows 20 by default, errors first by source, file, line and column', async () => {
    const { r } = await run({}, MANY);
    expect(r.truncated).toEqual({ shown: 20, total: 25 });
    expect(r.diagnostics.map((d) => `${d.source} ${d.severity} ${d.loc}`)).toEqual([
      'tsc error a.ts:1:1',
      'tsc error a.ts:3:2',
      'tsc error a.ts:3:2',
      'tsc error a.ts:3:5',
      'tsc error b.ts:1:1',
      'tsc error b.ts:2:1',
      'tsc error b.ts:9:9',
      'tsc error c.ts:1:1',
      'vitest error a.test.ts:1:1',
      'vitest error a.test.ts:2:1',
      'vitest error a.test.ts:3:1',
      'oxlint error a.ts:1:1',
      'oxlint error a.ts:2:1',
      'oxlint error a.ts:3:1',
      'oxfmt error a.ts',
      'oxfmt error b.ts',
      'oxfmt error c.ts',
      'oxfmt error d.ts',
      'oxfmt error e.ts',
      'oxlint warning a.ts:1:1',
    ]);
    expect(r.steps).toMatchObject({
      types: { errors: 8, warnings: 0 },
      lint: { errors: 3, warnings: 3 },
      format: { errors: 5 },
      tests: { errors: 3, failed: 3 },
      coverage: { warnings: 3, filesBelow100: 3 },
    });
    expect(r.next).toEqual(['vibejs explain VIBE8303', 'vibejs check --fix']);
    expect(check.human(r)).toContain('\n(20 of 25 diagnostics shown)\n');
  });

  it('shows --max diagnostics', async () => {
    const { r } = await run({ max: '5' }, MANY);
    expect(r.diagnostics).toHaveLength(5);
    expect(r.truncated).toEqual({ shown: 5, total: 25 });
    // No VIBE code among the five shown.
    expect(r.next).toEqual(['vibejs check --fix']);
  });
});

describe('options', () => {
  it.each([
    [{ only: 'types,bogus' }, 'bogus'],
    [{ only: '' }, ''],
    [{ max: '0' }, '0'],
    [{ max: '1.5' }, '1.5'],
    [{ max: 'x' }, 'x'],
  ])('%j gives VIBE8004 naming the value', async (values, name) => {
    const { r, calls } = await run(values);
    expect(calls).toEqual([]);
    expect(exitCode(r)).toBe(2);
    expect(r.error).toMatchObject({
      code: 'VIBE8004',
      message: `Unknown command or option \`${name}\`.`,
    });
  });

  it('--fix runs oxlint --fix, then oxfmt --write, then the check', async () => {
    const { calls } = await run({ fix: true }, CLEAN);
    expect(calls.slice(0, 2)).toEqual([
      ['oxlint', '--fix'],
      ['oxfmt', '--write'],
    ]);
    expect(calls.slice(2).map(([name]) => name)).toEqual(['tsc', 'oxlint', 'oxfmt', 'vitest']);
  });

  it('--fix with --only types fixes nothing', async () => {
    const { calls } = await run({ fix: true, only: 'types' }, CLEAN);
    expect(calls).toEqual([['tsc', '-b', '--pretty', 'false', '--runExternalCode']]);
  });

  it('--only types runs only tsc and skips the other steps', async () => {
    const { r, calls } = await run({ only: 'types' });
    expect(calls.map(([name]) => name)).toEqual(['tsc']);
    expect(r.steps).toEqual({
      types: { status: 'failed', errors: 2, warnings: 0, ms: 0 },
      lint: { status: 'skipped', errors: 0, warnings: 0, ms: 0 },
      format: { status: 'skipped', errors: 0, warnings: 0, ms: 0 },
      tests: { status: 'skipped', errors: 0, warnings: 0, ms: 0, passed: 0, failed: 0, skipped: 0 },
      coverage: {
        status: 'skipped',
        errors: 0,
        warnings: 0,
        ms: 0,
        lines: 0,
        branches: 0,
        functions: 0,
        statements: 0,
        filesBelow100: 0,
      },
    });
  });

  it('starts all four tools before any of them finishes', async () => {
    const started: string[] = [];
    const finish: (() => void)[] = [];
    const deferred =
      (name: string, reply: Reply): Reply =>
      (args, cwd) => {
        started.push(name);
        return new Promise((resolve) => {
          finish.push(() => resolve(reply(args, cwd)));
        });
      };
    const replies = Object.fromEntries(
      Object.entries(CLEAN).map(([name, reply]) => [name, deferred(name, reply)]),
    );
    const pending = run({}, replies);
    await expect.poll(() => started).toHaveLength(4);
    for (const done of finish) done();
    expect((await pending).r.ok).toBe(true);
  });
});

it('fails with VIBE8001 outside a project', async () => {
  rmSync(join(root, 'package.json'));
  const { r } = await run();
  expect(exitCode(r)).toBe(2);
  expect(r).toMatchObject({ ok: false, error: { code: 'VIBE8001' } });
  expect(r.error!.message).toContain(join(root, 'src'));
});

it('times each step and the whole run with ctx.now', async () => {
  let t = 0;
  const calls: string[] = [];
  const ctx: Ctx = {
    version: '1.2.3',
    agent: { active: true },
    docsDir: '',
    cwd: root,
    now: () => (t += 10),
    exec: async (_, [bin]) => {
      calls.push(bin);
      return CLEAN.tsc([], root);
    },
    out: () => {},
    err: () => {},
  };
  const r: CheckResult = await check.run({ values: { only: 'types' }, positionals: [] }, ctx);
  expect(calls).toHaveLength(1);
  expect(r.steps.types.ms).toBe(10);
  expect(r.durationMs).toBe(30);
});
