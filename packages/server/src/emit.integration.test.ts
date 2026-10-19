import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { runFixture } from './module/fixture.ts';

const pkg = fileURLToPath(new URL('..', import.meta.url));
const tsc = join(
  dirname(createRequire(import.meta.url).resolve('typescript/package.json')),
  'bin/tsc',
);
const fixture = pathToFileURL(join(pkg, '.tsbuild/emit/module/fixture.js')).href;

function node(...args: string[]) {
  return spawnSync(process.execPath, args, { cwd: pkg, encoding: 'utf8' });
}

it('runs the tsc emit of the decorated fixture on Node with the same log as Oxc', async () => {
  const build = node(tsc, '-p', 'tsconfig.emit.json', '--pretty', 'false');
  expect(build.stdout + build.stderr).toBe('');
  expect(build.status).toBe(0);

  const script = `const { runFixture } = await import(${JSON.stringify(fixture)});
process.stdout.write(JSON.stringify(await runFixture()));`;
  const run = node('--input-type=module', '-e', script);
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  expect(JSON.parse(run.stdout)).toEqual(await runFixture());
});
