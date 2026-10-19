import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../package.json' with { type: 'json' };
import { detectAgentMode, nodeCtx } from './ctx.ts';

// Every variable std-env 4.3 reads to detect an agent, so the host (CI, an agent) cannot leak in.
const AGENT_VARS = [
  'AI_AGENT',
  'CLAUDECODE',
  'CLAUDE_CODE',
  'REPL_ID',
  'GEMINI_CLI',
  'CODEX_SANDBOX',
  'CODEX_THREAD_ID',
  'OPENCODE',
  'AUGMENT_AGENT',
  'GOOSE_PROVIDER',
  'JUNIE_DATA',
  'JUNIE_SHIM_PATH',
  'COPILOT_AGENT',
  'COPILOT_CLI',
  'CURSOR_AGENT',
  'EDITOR',
  'TERM_PROGRAM',
  'VIBEJS_AGENT',
];

beforeEach(() => {
  for (const name of AGENT_VARS) vi.stubEnv(name, undefined);
  vi.stubEnv('PATH', '/usr/bin');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('is off when no agent is detected', () => {
  expect(detectAgentMode()).toEqual({ active: false });
});

it('turns on for an environment std-env recognizes', () => {
  vi.stubEnv('CLAUDECODE', '1');
  expect(detectAgentMode()).toEqual({ active: true, name: 'claude' });
});

it('honors AI_AGENT through std-env', () => {
  vi.stubEnv('AI_AGENT', 'my-agent');
  expect(detectAgentMode()).toEqual({ active: true, name: 'my-agent' });
});

it('is forced on by VIBEJS_AGENT=1', () => {
  vi.stubEnv('VIBEJS_AGENT', '1');
  expect(detectAgentMode()).toEqual({ active: true });
});

it('is forced off by VIBEJS_AGENT=0 even when std-env detects an agent', () => {
  vi.stubEnv('CLAUDECODE', '1');
  vi.stubEnv('VIBEJS_AGENT', '0');
  expect(detectAgentMode()).toEqual({ active: false });
});

it('builds the Node context from package.json, dist/docs and the process streams', () => {
  vi.stubEnv('VIBEJS_AGENT', '1');
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const ctx = nodeCtx();
  ctx.out('to stdout');
  ctx.err('to stderr');
  expect(ctx.version).toBe(manifest.version);
  expect(ctx.agent.active).toBe(true);
  expect(ctx.docsDir.replaceAll('\\', '/')).toMatch(/\/packages\/cli\/dist\/docs$/);
  expect(ctx.cwd).toBe(process.cwd());
  expect(ctx.now()).toBeGreaterThan(0);
  expect(out).toHaveBeenCalledWith('to stdout');
  expect(err).toHaveBeenCalledWith('to stderr');
});

describe('exec', () => {
  const ctx = nodeCtx();
  const cwd = process.cwd();

  it('resolves with the code and output of a child that exits non-zero', async () => {
    const script = "process.stdout.write('out'); process.stderr.write('err'); process.exit(3)";
    expect(await ctx.exec(process.execPath, ['-e', script], { cwd })).toEqual({
      code: 3,
      stdout: 'out',
      stderr: 'err',
    });
  });

  it('resolves with code 0 on success and code 1 when the program cannot start', async () => {
    expect(await ctx.exec(process.execPath, ['-e', ''], { cwd })).toEqual({
      code: 0,
      stdout: '',
      stderr: '',
    });
    expect((await ctx.exec(join(tmpdir(), 'vibejs-no-such-program'), [], { cwd })).code).toBe(1);
  });
});
