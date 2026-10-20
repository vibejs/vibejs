import { join } from 'node:path';
import { isVibeError, type VibeError } from '@vibejs-org/errors';
import type * as Server from '@vibejs-org/server';
import type { ModuleRunner } from 'vite/module-runner';
import { vibeError } from '../errors.gen.ts';

export const APP_MODULE = 'server/src/app.module.ts';

export interface LoadedApp {
  server: typeof Server;
  AppModule: Server.ModuleImport;
  /** With a non-empty `basePath`. */
  appOptions: Server.AppOptions & { basePath: string };
}

/**
 * Imports `server/src/app.module.ts` and the project's `@vibejs-org/server` through `runner`;
 * checks the exports (VIBE8202) and the base path (VIBE8205).
 */
export async function loadAppModule(runner: ModuleRunner, root: string): Promise<LoadedApp> {
  const mod: Record<string, unknown> = await runner.import(join(root, APP_MODULE));
  const { AppModule, appOptions } = mod;
  if (typeof AppModule !== 'function' || typeof appOptions !== 'object' || !appOptions) {
    const names = Object.keys(mod);
    const found = names.length ? `the exports ${names.join(', ')}` : 'no exports';
    throw vibeError('VIBE8202', { found });
  }
  const options: Server.AppOptions = appOptions;
  const { basePath } = options;
  // The UI is served at the root, so a root-mounted backend would shadow it.
  if (!basePath) throw vibeError('VIBE8205');
  const server: typeof Server = await runner.import('@vibejs-org/server');
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the server rejects a class that is not a module
  const module = AppModule as Server.ModuleImport;
  return { server, AppModule: module, appOptions: { ...options, basePath } };
}

/**
 * A Vite SSR module runner over `<root>/server`, without a config file, watcher or output;
 * closed after `fn`.
 */
export async function withServerRunner<T>(
  root: string,
  fn: (runner: ModuleRunner) => Promise<T>,
): Promise<T> {
  // Loaded here, so the other commands start without Vite.
  const { createServer, createServerModuleRunner } = await import('vite');
  const vite = await createServer({
    root: join(root, 'server'),
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, watch: null, ws: false },
  });
  const runner = createServerModuleRunner(vite.environments.ssr, { hmr: false });
  try {
    return await fn(runner);
  } finally {
    await runner.close();
    await vite.close();
  }
}

/** A VibeError as itself, any other error as VIBE8501. */
export function loadError(error: unknown): VibeError {
  if (isVibeError(error)) return error;
  const reason = String(error).split('\n', 1)[0];
  return vibeError('VIBE8501', { reason }, { cause: error });
}
