import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyApp, testCtx } from '../../test/app.ts';
import { main } from '../main.ts';
import { exitCode } from '../output.ts';
import { routes, uiRoutes, type RoutesResult } from './routes.ts';

vi.mock('vite', async (original) => (await import('../../test/app.ts')).sourceVite(original));
vi.setConfig({ testTimeout: 30_000 });

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A copy of the fixture app with the given `app.module.ts` and `routes.ts`. */
function app(files: { module?: string; routes?: string } = {}): string {
  const root = copyApp();
  roots.push(root);
  if (files.module !== undefined)
    writeFileSync(join(root, 'server/src/app.module.ts'), files.module);
  if (files.routes !== undefined) writeFileSync(join(root, 'ui/src/routes.ts'), files.routes);
  return root;
}

// Constructing ThrowingService or initializing its module would throw.
const MODULE = `
import { Controller, Handle, Module, UseFilters, UseGuards, UseInterceptors } from '@vibejs-org/server';
import { health } from '../../contracts/src/health.contract.ts';

export class ThrowingService {
  constructor() { throw new Error('constructed'); }
  onModuleInit() { throw new Error('initialized'); }
}
class Allow { canActivate() { return true; } }
class Timing { intercept(_ctx, next) { return next(); } }
class Fallback { catch() {} }

@Controller(health)
@UseGuards(Allow)
class HealthController {
  @Handle(health.get)
  @UseInterceptors(Timing)
  @UseFilters(Fallback)
  get() { return 'ok'; }
}

@Module({ controllers: [HealthController], providers: [ThrowingService] })
export class AppModule {
  onModuleInit() { throw new Error('initialized'); }
}

export const appOptions = { basePath: '/api' };
`;

const API = [
  {
    method: 'GET',
    path: '/api/health',
    handler: 'HealthController.get',
    guards: ['Allow'],
    interceptors: ['Timing'],
    filters: ['Fallback'],
  },
];

const EMPTY = `import { Module } from '@vibejs-org/server';
@Module({})
export class AppModule {}
export const appOptions = { basePath: '/api' };
`;

const NESTED = `
import { defineRoutes } from '@vibejs-org/ui/router';
import HomePage from './pages/HomePage.vibe';
import { Layout } from '../shared/Layout.vibe';
import { other } from 'some-package';

const extra = [];
export const routes = defineRoutes([
  { path: '/', name: 'home', component: HomePage },
  {
    path: '/admin/',
    component: Layout,
    children: [
      { path: '', name: 'admin', component: () => import('./pages/Admin.vibe') },
      { path: 'users', children: [{ path: ':id', name: 'user', component: () => import('pkg') }] },
      { path: '/absolute', redirect: '/' },
      { path: 'old', redirect: (to) => '/' + to.params.id },
      { path: 'member', component: pages.Member },
      { path: 'computed', component: () => import(file) },
    ],
  },
  { path: \`/t\`, name: String('x'), component: other, children: extra, ['meta']: 1, ...extra },
  { component: Local, meta: {}, 'path': '/quoted' },
  ...extra,
  ,
  makeRoute(),
]);
`;

describe('ui routes', () => {
  it('reads the template routes.ts as it is', () => {
    const text = readFileSync(
      new URL('../../../create-vibejs/templates/fullstack/ui/src/routes.ts', import.meta.url),
      'utf8',
    );
    expect(uiRoutes(text)).toEqual([
      { path: '/', name: 'home', component: 'ui/src/pages/HomePage.vibe' },
    ]);
  });

  it('joins nested paths in source order and lists the dynamic fields', () => {
    expect(uiRoutes(NESTED)).toMatchSnapshot();
  });

  it.each([
    ['a syntax error', 'export const routes = defineRoutes([\n  { path: }\n]);', 'at 2:11'],
    ['no defineRoutes', 'export const routes = [];', 'no `defineRoutes'],
    ['no array literal', 'export const routes = defineRoutes(list);', 'no `defineRoutes'],
  ])('returns VIBE8504 for %s', (_, text, reason) => {
    expect(uiRoutes(text)).toMatchObject({
      code: 'VIBE8504',
      message: expect.stringContaining(reason),
    });
  });
});

const run = (root: string, values: Record<string, string> = {}) =>
  routes.run({ values, positionals: [] }, testCtx(root).ctx);

describe('the routes command', () => {
  it('lists the api routes without constructing a provider, and no ui routes without routes.ts', async () => {
    const r = await run(app({ module: MODULE }));
    expect(r).toEqual({ ok: true, command: 'routes', version: '1.2.3', api: API, ui: [] });
    expect(Object.keys(r)).toEqual(['ok', 'command', 'version', 'api', 'ui']);
    expect(exitCode(r)).toBe(0);
  });

  it('--kind api never reads routes.ts', async () => {
    const r = await run(app({ module: MODULE, routes: 'broken(' }), { kind: 'api' });
    expect(r).toEqual({ ok: true, command: 'routes', version: '1.2.3', api: API });
  });

  it('--kind ui never loads the app module', async () => {
    const root = app({ module: 'export class AppModule {', routes: NESTED });
    const r = await run(root, { kind: 'ui' });
    expect(r).toEqual({ ok: true, command: 'routes', version: '1.2.3', ui: uiRoutes(NESTED) });
  });

  it('rejects another --kind as VIBE8004 with the values', async () => {
    const r = await run(app(), { kind: 'x' });
    expect(r).toMatchObject({
      ok: false,
      next: ['vibejs routes --kind api'],
      error: { code: 'VIBE8004', missing: [{ name: 'kind', values: ['api', 'ui'] }] },
      api: [],
      ui: [],
    });
    expect(exitCode(r)).toBe(2);
  });

  it.each([
    [{ routes: 'export const routes = [];' }, {}, 'VIBE8504', 1],
    [{ routes: 'x(' }, { kind: 'ui' }, 'VIBE8504', 1],
    [{ module: 'export class AppModule {' }, {}, 'VIBE8501', 1],
    [{ module: 'export const x = 1;' }, { kind: 'api' }, 'VIBE8202', 1],
  ])('reports %j %j as %s', async (files, values, code, exit) => {
    const r = await run(app(files), values);
    expect(r).toMatchObject({ ok: false, error: { code } });
    expect(r.api ?? []).toEqual([]);
    expect(r.ui ?? []).toEqual([]);
    expect(exitCode(r)).toBe(exit);
  });

  it('reports VIBE8001 outside a project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibejs-routes-'));
    roots.push(dir);
    const r = await run(dir, { kind: 'ui' });
    expect(r).toMatchObject({ ok: false, error: { code: 'VIBE8001' }, ui: [] });
    expect(r.api).toBeUndefined();
    expect(exitCode(r)).toBe(2);
  });
});

describe('output', () => {
  it('prints an API and a UI table for people', async () => {
    const root = app({ module: MODULE, routes: NESTED });
    const t = testCtx(root, false);
    expect(await main(['routes'], t.ctx)).toBe(0);
    expect(t.out.join('')).toMatchSnapshot();
    const empty = testCtx(app({ module: EMPTY }), false);
    expect(await main(['routes'], empty.ctx)).toBe(0);
    expect(empty.out.join('')).toBe('API\n  No routes.\nUI\n  No routes.\n');
  });

  it('answers --help as JSON and as text', async () => {
    const json = testCtx(process.cwd());
    expect(await main(['routes', '--help', '--json'], json.ctx)).toBe(0);
    const help: RoutesResult = JSON.parse(json.out.join(''));
    expect(help).toMatchObject({ ok: true, command: 'help' });
    const text = testCtx(process.cwd(), false);
    await main(['routes', '--help'], text.ctx);
    expect(text.out.join('')).toMatchSnapshot();
  });
});
