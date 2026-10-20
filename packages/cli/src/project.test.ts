import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findRoot,
  installCommand,
  packageManager,
  projectCompiler,
  resolveTool,
  vibeFiles,
} from './project.ts';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'vibejs-project-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function write(path: string, content: unknown): void {
  mkdirSync(dirname(join(tmp, path)), { recursive: true });
  writeFileSync(join(tmp, path), typeof content === 'string' ? content : JSON.stringify(content));
}

describe('findRoot', () => {
  it('finds the nearest package.json that depends on @vibejs-org/cli', () => {
    write('app/package.json', { devDependencies: { '@vibejs-org/cli': '0.1.0' } });
    write('app/packages/lib/package.json', { dependencies: { other: '1.0.0' } });
    write('app/packages/broken/package.json', '{');
    mkdirSync(join(tmp, 'app/packages/broken/src'));
    expect(findRoot(join(tmp, 'app/packages/lib'))).toBe(join(tmp, 'app'));
    expect(findRoot(join(tmp, 'app/packages/broken/src'))).toBe(join(tmp, 'app'));
    write('app/packages/web/package.json', { dependencies: { '@vibejs-org/cli': '0.1.0' } });
    expect(findRoot(join(tmp, 'app/packages/web'))).toBe(join(tmp, 'app/packages/web'));
  });

  it('returns undefined when no ancestor depends on it', () => {
    write('a/package.json', {});
    expect(findRoot(join(tmp, 'a'))).toBeUndefined();
  });
});

describe('packageManager', () => {
  it.each([
    [{ packageManager: 'yarn@4.5.0' }, 'pnpm-lock.yaml', 'yarn'],
    [{ packageManager: 'unknown@1.0.0' }, 'bun.lock', 'bun'],
    [{}, 'pnpm-lock.yaml', 'pnpm'],
    [{}, 'yarn.lock', 'yarn'],
    [{}, 'bun.lock', 'bun'],
    [{}, 'bun.lockb', 'bun'],
    [{}, 'package-lock.json', 'npm'],
    [{}, undefined, 'npm'],
  ])('%j with %s is %s', (manifest, lockfile, pm) => {
    write('package.json', manifest);
    if (lockfile) write(lockfile, '');
    expect(packageManager(tmp)).toBe(pm);
  });
});

it.each([
  ['pnpm', 'pnpm add -D vitest @vitest/coverage-v8'],
  ['npm', 'npm install -D vitest @vitest/coverage-v8'],
  ['yarn', 'yarn add -D vitest @vitest/coverage-v8'],
  ['bun', 'bun add -d vitest @vitest/coverage-v8'],
] as const)('installCommand for %s', (pm, command) => {
  expect(installCommand(pm, ['vitest', '@vitest/coverage-v8'])).toBe(command);
});

describe('resolveTool', () => {
  it('walks up to node_modules and reads the bin as a string or a map', () => {
    write('node_modules/oxlint/package.json', { version: '1.0.0', bin: 'bin/oxlint' });
    write('app/node_modules/vitest/package.json', { version: '5.0.0', bin: { vitest: 'v.mjs' } });
    const app = join(tmp, 'app');
    expect(resolveTool(app, 'oxlint', 'oxlint')).toEqual({
      bin: join(tmp, 'node_modules/oxlint/bin/oxlint'),
      version: '1.0.0',
    });
    expect(resolveTool(app, 'vitest', 'vitest')).toEqual({
      bin: join(app, 'node_modules/vitest/v.mjs'),
      version: '5.0.0',
    });
  });

  it('gives an empty bin for a package without it, and undefined for a missing package', () => {
    write('node_modules/@vitest/coverage-v8/package.json', { version: '5.0.0' });
    expect(resolveTool(tmp, '@vitest/coverage-v8', '')).toEqual({ bin: '', version: '5.0.0' });
    expect(resolveTool(tmp, 'missing', 'missing')).toBeUndefined();
  });
});

describe('vibeFiles', () => {
  it('lists the .vibe files under a directory, root-relative and sorted', () => {
    for (const file of ['ui/src/b/B.vibe', 'ui/src/A.vibe', 'ui/Top.vibe', 'server/S.vibe'])
      write(file, '');
    for (const skipped of ['node_modules/x/X.vibe', 'ui/dist/D.vibe', 'ui/.cache/C.vibe'])
      write(skipped, '');
    write('ui/src/Dir.vibe/inner.ts', '');
    const all = ['server/S.vibe', 'ui/Top.vibe', 'ui/src/A.vibe', 'ui/src/b/B.vibe'];
    expect(vibeFiles(tmp)).toEqual(all.map((f) => join(f)));
    expect(vibeFiles(tmp, 'ui/src')).toEqual(
      ['ui/src/A.vibe', 'ui/src/b/B.vibe'].map((f) => join(f)),
    );
    expect(vibeFiles(tmp, 'missing')).toEqual([]);
  });
});

describe('projectCompiler', () => {
  it('reports VIBE8005 with the install command when the project has none', async () => {
    write('pnpm-lock.yaml', '');
    const e = await projectCompiler(tmp);
    expect(e).toMatchObject({ code: 'VIBE8005' });
    expect(e).toHaveProperty('fixes', [
      'Run `pnpm add -D @vibejs-org/compiler` in the project root.',
    ]);
  });
});
