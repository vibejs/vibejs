import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// The repo's TypeScript; its exports map hides the bin.
const TSC = createRequire(import.meta.url)
  .resolve('typescript/package.json')
  .replace(/package\.json$/, 'bin/tsc');
const FIXTURE = fileURLToPath(new URL('../../test/fixtures/typed-routes', import.meta.url));

// The fixture is a user project: it registers its router and resolves the package to dist.
it('type-checks the registered routes, the lazy page and 300 routes', () => {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [TSC, '-p', FIXTURE, '--extendedDiagnostics', '--pretty', 'false'],
    { encoding: 'utf8' },
  );
  expect(stderr).toBe('');
  expect(stdout).not.toContain('TS7022');
  expect(stdout).not.toContain('error TS');
  expect(status).toBe(0);
  // Reported, not gated.
  for (const line of stdout.split('\n')) {
    if (/^(Check time|Instantiations):/.test(line)) process.stdout.write(`typed-routes ${line}\n`);
  }
});
