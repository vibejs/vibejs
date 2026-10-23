import { rmSync } from 'node:fs';
import { isVibeError, VibeError } from '@usevibejs/errors';
import type { ModuleRunner } from 'vite/module-runner';
import { afterEach, expect, it, vi } from 'vitest';
import { copyApp, edit } from '../../test/app.ts';
import { vibeError } from '../errors.gen.ts';
import { APP_MODULE, loadAppModule, loadError, withServerRunner } from './app-module.ts';

vi.mock('vite', async (original) => (await import('../../test/app.ts')).sourceVite(original));
vi.setConfig({ testTimeout: 30_000 });

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function app(from?: string, to?: string): string {
  const root = copyApp();
  roots.push(root);
  if (from !== undefined) edit(root, APP_MODULE, from, to!);
  return root;
}

const load = (root: string) => withServerRunner(root, (runner) => loadAppModule(runner, root));

it('loads AppModule, appOptions and the project server package', async () => {
  const root = app();
  const { server, AppModule, appOptions } = await load(root);
  expect(appOptions).toEqual({ basePath: '/api' });
  expect(server.inspect(AppModule, appOptions).routes).toMatchObject([
    { method: 'GET', path: '/api/health', handler: 'HealthController.get' },
  ]);
});

it('rejects a module without AppModule or appOptions with VIBE8202', async () => {
  await expect(load(app('export const appOptions', 'const appOptions'))).rejects.toMatchObject({
    code: 'VIBE8202',
    args: { found: 'the exports AppModule' },
  });
  const root = app();
  edit(root, APP_MODULE, 'export class AppModule', 'class AppModule');
  edit(root, APP_MODULE, 'export const appOptions', 'const appOptions');
  await expect(load(root)).rejects.toMatchObject({
    code: 'VIBE8202',
    args: { found: 'no exports' },
  });
});

it('rejects an empty base path with VIBE8205', async () => {
  await expect(load(app("basePath: '/api'", "basePath: ''"))).rejects.toMatchObject({
    code: 'VIBE8205',
  });
});

it('closes the runner when the callback throws', async () => {
  let used: ModuleRunner | undefined;
  const failure = new Error('fixture');
  await expect(
    withServerRunner(app(), async (runner) => {
      used = runner;
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(used?.isClosed()).toBe(true);
});

it('keeps a VibeError and wraps any other error as VIBE8501', () => {
  const coded = vibeError('VIBE8202', { found: 'no exports' });
  expect(loadError(coded)).toBe(coded);
  const cause = new SyntaxError('Unexpected token\n  at app.module.ts:1:1');
  const wrapped = loadError(cause);
  expect(isVibeError(wrapped, 'VIBE8501')).toBe(true);
  expect(wrapped).toBeInstanceOf(VibeError);
  expect(wrapped.args).toEqual({ reason: 'SyntaxError: Unexpected token' });
  expect(wrapped.cause).toBe(cause);
});
