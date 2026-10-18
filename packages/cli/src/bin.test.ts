import { afterEach, expect, it, vi } from 'vitest';
import manifest from '../package.json' with { type: 'json' };

const argv = process.argv;

afterEach(() => {
  process.argv = argv;
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

it('runs main with the process arguments and sets the exit code', async () => {
  vi.stubEnv('VIBEJS_AGENT', '1');
  process.argv = ['node', 'vibejs', '--version'];
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  await import('./bin.ts');
  expect(write.mock.calls).toEqual([
    [`${JSON.stringify({ ok: true, command: 'version', version: manifest.version })}\n`],
  ]);
  expect(process.exitCode).toBe(0);
});
