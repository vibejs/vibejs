import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyApp, testCtx } from '../../test/app.ts';
import { main } from '../main.ts';
import { exitCode } from '../output.ts';
import { di, type DiResult } from './di.ts';

vi.mock('vite', async (original) => (await import('../../test/app.ts')).sourceVite(original));
vi.setConfig({ testTimeout: 30_000 });

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A copy of the fixture app with `server/src/app.module.ts` replaced by `source`. */
function app(source?: string): string {
  const root = copyApp();
  roots.push(root);
  if (source !== undefined) writeFileSync(join(root, 'server/src/app.module.ts'), source);
  return root;
}

// Constructing ThrowingService or initializing its module would throw.
const GRAPH = `
import { Logger, Module } from '@usevibejs/server';

export class ThrowingService {
  constructor() { throw new Error('constructed'); }
  onModuleInit() { throw new Error('initialized'); }
}
export class Clock {}

@Module({ global: true, providers: [Clock], exports: [Clock] })
class CoreModule {}

@Module({ providers: [ThrowingService], exports: [ThrowingService] })
class UsersModule {
  onModuleInit() { throw new Error('initialized'); }
}

@Module({ imports: [UsersModule], providers: [{ provide: Logger, useValue: null }] })
class AdminModule {}

@Module({ imports: [CoreModule, UsersModule, AdminModule] })
export class AppModule {}

export const appOptions = { basePath: '/api' };
`;

const run = (root: string, values: Record<string, string> = {}) =>
  di.run({ values, positionals: [] }, testCtx(root).ctx);

describe('the module graph', () => {
  it('lists every module without constructing a provider', async () => {
    const r = await run(app(GRAPH));
    expect(r).toEqual({
      ok: true,
      command: 'di',
      version: '1.2.3',
      modules: [
        {
          path: 'AppModule > CoreModule',
          global: true,
          imports: [],
          exports: ['Clock'],
          providers: ['Clock'],
        },
        {
          path: 'AppModule > UsersModule',
          global: false,
          imports: [],
          exports: ['ThrowingService'],
          providers: ['ThrowingService'],
        },
        {
          path: 'AppModule > AdminModule',
          global: false,
          imports: ['UsersModule'],
          exports: [],
          providers: ['Logger'],
        },
        {
          path: 'AppModule',
          global: false,
          imports: ['CoreModule', 'UsersModule', 'AdminModule'],
          exports: [],
          providers: [],
        },
      ],
    });
    expect(exitCode(r)).toBe(0);
  });

  it.each([
    [{ module: 'UsersModule' }, ['AppModule > UsersModule']],
    [{ module: 'AppModule' }, ['AppModule']],
    [{ module: 'Users' }, []],
    [{ token: 'ThrowingService' }, ['AppModule > UsersModule']],
    [{ token: 'Logger' }, ['AppModule > AdminModule']],
    [{ token: 'Clock' }, ['AppModule > CoreModule']],
    [{ module: 'AdminModule', token: 'Logger' }, ['AppModule > AdminModule']],
    [{ module: 'UsersModule', token: 'Logger' }, []],
  ])('filters by %o', async (values, paths) => {
    const r = await run(app(GRAPH), values);
    expect(r.ok).toBe(true);
    expect(r.modules.map((m) => m.path)).toEqual(paths);
    expect(r.next).toEqual(paths.length ? undefined : ['vibejs di']);
  });
});

describe('failures', () => {
  it.each([
    ['a syntax error', 'export class AppModule {', 'VIBE8501', 1],
    ['wrong exports', 'export const x = 1;', 'VIBE8202', 1],
    [
      'a scan error',
      "import { Module } from '@usevibejs/server';\nclass Plain {}\n@Module({ imports: [Plain] })\nexport class AppModule {}\nexport const appOptions = { basePath: '/api' };",
      'VIBE9201',
      1,
    ],
  ])('reports %s as its code', async (_, source, code, exit) => {
    const r = await run(app(source));
    expect(r).toMatchObject({ ok: false, command: 'di', error: { code }, modules: [] });
    expect(exitCode(r)).toBe(exit);
  });

  it('reports VIBE8001 outside a project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibejs-di-'));
    roots.push(dir);
    const r = await run(dir);
    expect(r).toMatchObject({ ok: false, error: { code: 'VIBE8001' }, modules: [] });
    expect(exitCode(r)).toBe(2);
  });
});

describe('output', () => {
  it('prints one block per module for people', async () => {
    const t = testCtx(app(GRAPH), false);
    expect(await main(['di'], t.ctx)).toBe(0);
    expect(t.out.join('')).toMatchSnapshot();
    const none = testCtx(t.ctx.cwd, false);
    expect(await main(['di', '--module', 'Nope'], none.ctx)).toBe(0);
    expect(none.out.join('')).toBe('No module matches.\n');
  });

  it('answers --help as JSON and as text', async () => {
    const json = testCtx(process.cwd());
    expect(await main(['di', '--help', '--json'], json.ctx)).toBe(0);
    const help: DiResult = JSON.parse(json.out.join(''));
    expect(help).toMatchObject({ ok: true, command: 'help' });
    const text = testCtx(process.cwd(), false);
    await main(['di', '--help'], text.ctx);
    expect(text.out.join('')).toMatchSnapshot();
  });
});
