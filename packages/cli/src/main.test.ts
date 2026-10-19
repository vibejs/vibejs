import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Ctx, ExecResult } from './ctx.ts';
import { COMMANDS, main, MISTAKES } from './main.ts';
import type { HelpResult, JsonEnvelope } from './output.ts';

const root = mkdtempSync(join(tmpdir(), 'vibejs-main-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});
function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
// The search rows match only this page, so new catalog entries never change their snapshots.
write('docs/guide/quokka.md', '# Quokka guide\n\nA quokka page.\n');
// A project with stub tools for `vibejs check`; `exec` below answers like a clean run.
write('app/package.json', JSON.stringify({ devDependencies: { '@vibejs-org/cli': '0.0.0' } }));
for (const [pkg, version, bin] of [
  ['typescript', '7.1.0', 'tsc'],
  ['oxlint', '1.0.0', 'oxlint'],
  ['oxfmt', '1.0.0', 'oxfmt'],
  ['vitest', '5.0.0', 'vitest'],
  ['@vitest/coverage-v8', '5.0.0'],
]) {
  write(`app/node_modules/${pkg}/package.json`, JSON.stringify({ version, bin }));
}
const REPORT = JSON.stringify({
  numPassedTests: 1,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [],
});
/** What the stub tsc prints; a test sets a type error. */
let tscOutput = '';

async function exec(_: string, [bin]: string[], { cwd }: { cwd: string }): Promise<ExecResult> {
  const name = bin.split(/[/\\]/).at(-1);
  if (name === 'vitest') {
    mkdirSync(join(cwd, '.vibejs/check/coverage'), { recursive: true });
    writeFileSync(join(cwd, '.vibejs/check/vitest.json'), REPORT);
    writeFileSync(join(cwd, '.vibejs/check/coverage/coverage-final.json'), '{}');
  }
  if (name === 'tsc') return { code: tscOutput ? 2 : 0, stdout: tscOutput, stderr: '' };
  return { code: 0, stdout: name === 'oxlint' ? '{"diagnostics": []}' : '', stderr: '' };
}

/** Runs main with a fixed version and a docs dir of one page, in the stub project by default. */
async function run(argv: string[], agent = false, cwd = join(root, 'app')) {
  let stdout = '';
  let stderr = '';
  const ctx: Ctx = {
    version: '1.2.3',
    agent: { active: agent },
    docsDir: join(root, 'docs'),
    cwd,
    now: () => 0,
    exec,
    out: (s) => (stdout += s),
    err: (s) => (stderr += s),
    untilSignal: async () => 'SIGINT',
  };
  const code = await main(argv, ctx);
  return { code, stdout, stderr };
}

/** Asserts exactly one JSON document on stdout and nothing on stderr, and returns it. */
function json({ stdout, stderr }: { stdout: string; stderr: string }): JsonEnvelope {
  expect(stderr).toBe('');
  expect(stdout.endsWith('\n')).toBe(true);
  expect(stdout.slice(0, -1)).not.toContain('\n');
  expect(stdout).not.toContain('\u001b[');
  const parsed: JsonEnvelope = JSON.parse(stdout);
  return parsed;
}

const argvOf = (line: string) => (line ? line.split(' ') : []);

it('answers a missing input in agent mode with VIBE8003, missing[].example and exit 2', async () => {
  const result = await run(['explain'], true);
  expect(result.code).toBe(2);
  expect(json(result)).toEqual({
    ok: false,
    command: 'explain',
    version: '1.2.3',
    next: ['vibejs explain VIBE8003'],
    error: expect.objectContaining({
      code: 'VIBE8003',
      missing: [{ name: 'code', example: 'vibejs explain VIBE8003' }],
    }),
  });
});

describe('unknown commands and options', () => {
  it.each([
    [['g'], 'g', 'g', 'vibejs --help'],
    [['create'], 'create', 'create', 'npm create vibejs@latest'],
    [['toString'], 'toString', 'toString', 'vibejs --help'],
    [['explain', '--bogus', 'VIBE8003'], 'explain', '--bogus', 'vibejs explain --help'],
    [['explain', '--json=yes', 'VIBE8003'], 'explain', '--json', 'vibejs explain --help'],
    [['--bogus'], 'help', '--bogus', 'vibejs --help'],
    [['explain', 'VIBE8003', 'extra'], 'explain', 'extra', 'vibejs explain --help'],
    [['--', '-x'], 'help', '-x', 'vibejs --help'],
    [['typecheck'], 'typecheck', 'typecheck', 'vibejs check --only types'],
    [['lint'], 'lint', 'lint', 'vibejs check --only lint'],
    [['format'], 'format', 'format', 'vibejs check --only format'],
    [['test'], 'test', 'test', 'vibejs check --only test'],
    [['serve'], 'serve', 'serve', 'vibejs dev'],
    [['start'], 'start', 'start', 'vibejs dev'],
    [['check', '--only', 'types,tests'], 'check', 'tests', 'vibejs check --help'],
    [['check', '--max', '0'], 'check', '0', 'vibejs check --help'],
  ])('%j gives VIBE8004 and exit 2', async (argv, command, name, next) => {
    const result = await run(['--json', ...argv]);
    expect(result.code).toBe(2);
    expect(json(result)).toMatchObject({
      ok: false,
      command,
      next: [next],
      error: { code: 'VIBE8004', message: `Unknown command or option \`${name}\`.` },
    });
  });

  it('answers --json=<value> with JSON', async () => {
    const result = await run(['--json=1']);
    expect(result.code).toBe(2);
    expect(json(result)).toMatchObject({ error: { code: 'VIBE8004' } });
  });

  it('suggests only registered commands or the npm create line', () => {
    const names = new Set(COMMANDS.map((c) => `vibejs ${c.name}`));
    const targets = Object.values(MISTAKES).filter((t) => t !== 'npm create vibejs@latest');
    expect(targets.filter((t) => !names.has(t.split(' ', 2).join(' ')))).toEqual([]);
    expect(Object.values(MISTAKES)).toContain('npm create vibejs@latest');
  });
});

describe('command matrix', () => {
  const cases = [
    ['explain VIBE8003', 0],
    ['explain VIBE0000', 1],
    ['explain', 2],
    ['docs VIBE8003', 0],
    ['docs errors/VIBE8004', 0],
    ['docs quokka', 0],
    ['docs', 2],
    ['', 0],
    ['--help', 0],
    ['-h', 0],
    ['explain --help', 0],
    ['docs -h', 0],
    ['--version', 0],
    ['explain --version', 0],
    ['g', 2],
    ['check --only types', 0],
    ['dev', 2],
    ['build', 2],
    ['errors', 0],
    ['logs --level warn', 0],
    ['logs --level fatal', 2],
  ] as const;

  it.each(cases)('JSON: vibejs %s exits %i', async (line, code) => {
    const result = await run([...argvOf(line), '--json']);
    expect(result.code).toBe(code);
    expect(JSON.stringify(json(result))).toMatchSnapshot('stdout');
  });

  it.each(cases)('agent mode: vibejs %s gives the same JSON', async (line) => {
    const agent = await run(argvOf(line), true);
    expect(agent).toEqual(await run([...argvOf(line), '--json']));
  });

  it.each(cases)('human: vibejs %s exits %i', async (line, code) => {
    const result = await run(argvOf(line));
    expect(result.code).toBe(code);
    expect(result.stdout + result.stderr).not.toContain('\u001b[');
    // Failures go to stderr only, results to stdout only.
    expect(code === 0 ? result.stderr : result.stdout).toBe('');
    expect(result.stdout + result.stderr).toMatchSnapshot('output');
  });
});

describe('--help --json', () => {
  it('describes every command with a summary, a usage and examples', async () => {
    const r: HelpResult = JSON.parse((await run(['--help', '--json'])).stdout);
    expect(r).toMatchObject({ ok: true, command: 'help', version: '1.2.3' });
    expect(r.commands.map((c) => c.name)).toEqual(COMMANDS.map((c) => c.name));
    for (const c of r.commands) {
      expect(c.summary).not.toBe('');
      expect(c.usage).toMatch(new RegExp(`^vibejs ${c.name}\\b`));
      expect(c.examples.length).toBeGreaterThan(0);
    }
  });

  it('lists examples that parse with their command options', async () => {
    for (const def of COMMANDS) {
      for (const example of def.examples) {
        const argv = example
          .slice('vibejs '.length)
          .match(/"[^"]*"|\S+/g)!
          .map((arg) => arg.replaceAll('"', ''));
        const r = json(await run([...argv, '--json']));
        // dev and build stop at VIBE8201 in the stub project, after parsing.
        expect({
          example,
          command: r.command,
          parsed: r.ok || r.error?.code === 'VIBE8201',
        }).toEqual({
          example,
          command: def.name,
          parsed: true,
        });
      }
    }
  });

  it('describes one command with <cmd> --help --json', async () => {
    const r: HelpResult = JSON.parse((await run(['docs', '--help', '--json'])).stdout);
    expect(r.ok).toBe(true);
    expect(r.commands.map((c) => c.name)).toEqual(['docs']);
  });
});

it('reads --json after -- as a docs query, not as the flag', async () => {
  const result = await run(['docs', '--', '--json', 'quokka']);
  expect(result.code).toBe(0);
  expect(result.stdout).toMatch(/^guide\/quokka {2}Quokka guide\n/);
});

it('prints the version with --version --json, without a skew check', async () => {
  expect(json(await run(['--version', '--json']))).toEqual({
    ok: true,
    command: 'version',
    version: '1.2.3',
  });
});

it('fails with VIBE8001 and exit 2 outside a project', async () => {
  const result = await run(['check', '--json'], false, join(root, 'docs'));
  expect(result.code).toBe(2);
  expect(json(result)).toMatchObject({ ok: false, command: 'check', error: { code: 'VIBE8001' } });
});

it('prints a check with diagnostics for people on stdout, with exit 1', async () => {
  tscOutput = 'src/a.ts(1,2): error TS2322: Nope.\n';
  try {
    const result = await run(['check', '--only', 'types']);
    expect(result).toMatchObject({ code: 1, stderr: '' });
    expect(result.stdout).toMatch(/^src\/a\.ts:1:2 {2}error {2}TS2322 {2}Nope\.\ntypes: failed /);
  } finally {
    tscOutput = '';
  }
});

it('prints a crashed tool for people: its diagnostic with the output on stdout, the error on stderr', async () => {
  tscOutput = 'Segmentation fault\n';
  try {
    const result = await run(['check', '--only', 'types']);
    expect(result.code).toBe(2);
    expect(result.stdout).toMatch(
      /^ {2}error {2}VIBE8301 {2}`tsc` exited .*\n {4}Segmentation fault\ntypes: failed /,
    );
    expect(result.stderr).toMatch(/^\[VIBE8301\] `tsc` exited with code 2 /);
  } finally {
    tscOutput = '';
  }
});
