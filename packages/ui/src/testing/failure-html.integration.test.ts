import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// The repo's Vitest CLI, run in a child process on a user project that imports the dist; its
// exports map hides the bin.
const VITEST = createRequire(import.meta.url)
  .resolve('vitest/package.json')
  .replace(/package\.json$/, 'vitest.mjs');
const FIXTURE = fileURLToPath(new URL('../../test/fixtures/failing-mount', import.meta.url));

it.each(['default', 'minimal', 'agent'])(
  'ends the error of a failing test with the rendered HTML (%s reporter)',
  (reporter) => {
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      [VITEST, 'run', '--root', FIXTURE, `--reporter=${reporter}`],
      { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CI: '1' } },
    );
    expect(status).toBe(1);
    expect(stdout + stderr).toContain(
      'Rendered HTML of Banner:\n<p class="banner">Hello fixture</p>',
    );
  },
);
