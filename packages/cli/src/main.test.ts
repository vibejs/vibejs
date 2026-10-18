import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Ctx } from './ctx.ts';
import { COMMANDS, main, MISTAKES } from './main.ts';
import type { HelpResult, JsonEnvelope } from './output.ts';

const root = mkdtempSync(join(tmpdir(), 'vibejs-main-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Runs main with a fixed version and no docs dir (the catalog-only corpus). */
async function run(argv: string[], agent = false) {
  let stdout = '';
  let stderr = '';
  const ctx: Ctx = {
    version: '1.2.3',
    agent: { active: agent },
    docsDir: join(root, 'missing'),
    out: (s) => (stdout += s),
    err: (s) => (stderr += s),
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
  ])('%j gives VIBE8004 and exit 2', async (argv, command, name, next) => {
    const result = await run([...argv, '--json']);
    expect(result.code).toBe(2);
    expect(json(result)).toMatchObject({
      ok: false,
      command,
      next: [next],
      error: { code: 'VIBE8004', message: `Unknown command or option \`${name}\`.` },
    });
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
    ['docs unknown option', 0],
    ['docs', 2],
    ['', 0],
    ['--help', 0],
    ['-h', 0],
    ['explain --help', 0],
    ['docs -h', 0],
    ['--version', 0],
    ['explain --version', 0],
    ['g', 2],
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
        expect({ example, command: r.command, ok: r.ok }).toEqual({
          example,
          command: def.name,
          ok: true,
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

it('prints the version with --version --json, without a skew check', async () => {
  expect(json(await run(['--version', '--json']))).toEqual({
    ok: true,
    command: 'version',
    version: '1.2.3',
  });
});
