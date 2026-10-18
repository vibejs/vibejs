import { afterEach, expect, it, vi } from 'vitest';
import manifest from '../package.json' with { type: 'json' };

const argv = process.argv;

afterEach(() => {
  process.argv = argv;
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

// The cold import transforms the whole CLI module graph under coverage, which can take seconds on
// a busy machine.
it('runs main with the process arguments and sets the exit code', { timeout: 30_000 }, async () => {
  vi.stubEnv('VIBEJS_AGENT', '1');
  process.argv = ['node', 'vibejs', '--version'];
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  await import('./bin.ts');
  expect(write.mock.calls).toEqual([
    [`${JSON.stringify({ ok: true, command: 'version', version: manifest.version })}\n`],
  ]);
  expect(process.exitCode).toBe(0);
});
