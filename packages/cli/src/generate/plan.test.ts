import { existsSync, readFileSync } from 'node:fs';
import { isVibeError } from '@vibejs-org/errors';
import { describe, expect, it } from 'vitest';
import { fixName, names, plan, type FileOp, type GeneratorKind } from './plan.ts';
import { files } from './templates.ts';

const TEMPLATE = new URL('../../../create-vibejs/templates/fullstack/', import.meta.url);
const template = (path: string) => {
  const url = new URL(path, TEMPLATE);
  return existsSync(url) ? readFileSync(url, 'utf8') : undefined;
};

/** The op list without contents. */
const shape = (ops: FileOp[]) =>
  ops.map((op) => Object.fromEntries(Object.entries(op).filter(([key]) => key !== 'content')));

describe('names', () => {
  it.each([
    ['users', undefined, 'users', 'user'],
    ['categories', undefined, 'categories', 'category'],
    ['boxes', undefined, 'boxes', 'box'],
    ['matches', undefined, 'matches', 'match'],
    ['wishes', undefined, 'wishes', 'wish'],
    ['blogPosts', undefined, 'blogPosts', 'blogPost'],
    ['people', 'person', 'people', 'person'],
    ['houses', undefined, 'houses', 'house'],
    ['cases', undefined, 'cases', 'case'],
    ['classes', undefined, 'classes', 'class'],
    ['glass', undefined, 'glass', 'glass'],
    ['news', 'news', 'news', 'news'],
  ])('resource %s (--singular %s) → %s/%s', (name, singular, plural, one) => {
    expect(names('resource', name, singular)).toEqual({ name: plural, singular: one });
  });

  it('takes component names verbatim and adds Page to a page once', () => {
    expect(names('component', 'UserCard')).toEqual({ name: 'UserCard', singular: 'UserCard' });
    expect(names('page', 'Users')).toEqual({ name: 'UsersPage', singular: 'UsersPage' });
    expect(names('page', 'UsersPage')).toEqual({ name: 'UsersPage', singular: 'UsersPage' });
  });

  it.each([
    ['resource', 'my-thing', 'myThing'],
    ['resource', '123', 'users'],
    ['resource', 'delete', 'users'],
    ['resource', 'Users', 'users'],
    ['resource', 'blog_posts', 'blogPosts'],
    ['component', 'userCard', 'UserCard'],
    ['component', 'user-card', 'UserCard'],
    ['page', '2fa', 'Fa'],
    ['page', '', 'Users'],
    ['page', 'Page', 'Users'],
    ['resource', 's', 'users'],
    ['resource', 'app', 'users'],
    ['resource', 'contracts', 'users'],
    ['resource', 'client', 'users'],
    ['resource', 'setup', 'users'],
    ['resource', 'arguments', 'users'],
    ['resource', 'eval', 'users'],
    ['resource', 'controllers', 'users'],
  ] as const)('rejects %s %j with VIBE8403 and suggests %s', (kind, name, fixed) => {
    let error: unknown;
    try {
      names(kind, name);
    } catch (e) {
      error = e;
    }
    expect(isVibeError(error) && error.code).toBe('VIBE8403');
    expect(String(error)).toContain(`\`${name}\` is not a valid ${kind} name; expected a`);
    expect(fixName(kind, name)).toBe(fixed);
  });

  it('checks the --singular word of a resource and ignores it for other kinds', () => {
    expect(() => names('resource', 'people', 'Person')).toThrow('`Person` is not a valid');
    expect(() => names('resource', 'handles', 'handle')).toThrow('`handle` is not a valid');
    expect(() => names('resource', 's')).toThrow('expected a name with a valid singular');
    expect(names('component', 'UserCard', 'x')).toEqual({ name: 'UserCard', singular: 'UserCard' });
  });
});

describe('plan on the template', () => {
  it('creates a resource and registers it in app.module.ts and api.ts', () => {
    const ops = plan('resource', names('resource', 'users'), template);
    expect(shape(ops)).toEqual([
      { op: 'create', path: 'contracts/src/users.contract.ts' },
      { op: 'create', path: 'server/src/users/users.service.ts' },
      { op: 'create', path: 'server/src/users/users.controller.ts' },
      { op: 'create', path: 'server/src/users/users.module.ts' },
      { op: 'create', path: 'server/src/users/users.controller.test.ts' },
      { op: 'update', path: 'server/src/app.module.ts', reason: 'register' },
      { op: 'update', path: 'ui/src/api.ts', reason: 'register' },
    ]);
    expect(ops.find((o) => o.path === 'server/src/app.module.ts')).toMatchObject({
      content: expect.stringContaining('@Module({ imports: [HealthModule, UsersModule] })'),
    });
    expect(ops.find((o) => o.path === 'ui/src/api.ts')).toMatchObject({
      content: expect.stringContaining('const contracts = { health, users };'),
    });
  });

  it('creates a component without a registration', () => {
    expect(shape(plan('component', names('component', 'UserCard'), template))).toEqual([
      { op: 'create', path: 'ui/src/components/UserCard.vibe' },
      { op: 'create', path: 'ui/src/components/UserCard.test.ts' },
    ]);
  });

  it('creates a page and adds a lazy route', () => {
    const ops = plan('page', names('page', 'Users'), template);
    expect(shape(ops)).toEqual([
      { op: 'create', path: 'ui/src/pages/UsersPage.vibe' },
      { op: 'create', path: 'ui/src/pages/UsersPage.test.ts' },
      { op: 'update', path: 'ui/src/routes.ts', reason: 'register' },
    ]);
    expect(ops[2]).toMatchObject({
      content: expect.stringContaining(
        "  { path: '/users', component: () => import('./pages/UsersPage.vibe') },\n]);",
      ),
    });
  });

  it('always returns the content of create and update ops', () => {
    for (const kind of ['resource', 'component', 'page'] as GeneratorKind[]) {
      const n = names(kind, kind === 'resource' ? 'users' : 'Users');
      for (const op of plan(kind, n, template)) expect(op).toHaveProperty('content');
    }
  });
});

/** Answers only `server/src/app.module.ts`, with a file of another shape. */
const otherShape = (p: string) => (p === 'server/src/app.module.ts' ? 'export {};\n' : undefined);

describe('plan on a generated project', () => {
  const n = names('resource', 'users');
  const generated: Record<string, string | undefined> = {};
  for (const op of plan('resource', n, template))
    if ('content' in op) generated[op.path] = op.content;

  it('skips identical files and registered elements', () => {
    expect(shape(plan('resource', n, (path) => generated[path]))).toEqual([
      ...Object.keys(files('resource', n)).map((path) => ({
        op: 'skip',
        path,
        reason: 'identical',
      })),
      { op: 'skip', path: 'server/src/app.module.ts', reason: 'registered' },
      { op: 'skip', path: 'ui/src/api.ts', reason: 'registered' },
    ]);
  });

  it('reports a changed file as a conflict', () => {
    const path = 'server/src/users/users.service.ts';
    const read = (p: string) => (p === path ? '// mine\n' : generated[p]);
    expect(plan('resource', n, read).filter((o) => o.op === 'conflict')).toEqual([
      { op: 'conflict', path },
    ]);
  });

  it('gives VIBE8402 manual ops for a missing or unknown registration target', () => {
    expect(plan('resource', n, otherShape).filter((o) => o.op === 'manual')).toEqual([
      {
        op: 'manual',
        path: 'server/src/app.module.ts',
        code: 'VIBE8402',
        instruction:
          "Register `UsersModule` in `server/src/app.module.ts` by hand: add `import { UsersModule } from './users/users.module.ts';` and `UsersModule` to the `imports` of `@Module` on `AppModule`.",
      },
      {
        op: 'manual',
        path: 'ui/src/api.ts',
        code: 'VIBE8402',
        instruction:
          "Register `users` in `ui/src/api.ts` by hand: add `import { users } from '../../contracts/src/users.contract.ts';` and `users` to the `const contracts = {...}` object.",
      },
    ]);
    expect(plan('page', names('page', 'Users'), () => undefined).at(-1)).toEqual({
      op: 'manual',
      path: 'ui/src/routes.ts',
      code: 'VIBE8402',
      instruction:
        "Register `{ path: '/users', component: () => import('./pages/UsersPage.vibe') }` in `ui/src/routes.ts` by hand: add `{ path: '/users', component: () => import('./pages/UsersPage.vibe') }` to the `defineRoutes([...])` array.",
    });
  });
});
