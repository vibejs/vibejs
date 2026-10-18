import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
  expect(out).toHaveBeenCalledWith('to stdout');
  expect(err).toHaveBeenCalledWith('to stderr');
});
