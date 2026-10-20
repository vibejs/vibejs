import { describe, expect, it } from 'vitest';
import {
  appModuleImports,
  contractsObject,
  register,
  routesArray,
  type Target,
} from './register.ts';

const moduleTarget: Target = {
  import: "import { UsersModule } from './users/users.module.ts';",
  element: 'UsersModule',
  key: 'UsersModule',
  find: appModuleImports,
  instruction: 'add UsersModule',
};
const contractTarget: Target = {
  import: "import { users } from '../../contracts/src/users.contract.ts';",
  element: 'users',
  key: 'users',
  find: contractsObject,
  instruction: 'add users',
};
const route = "{ path: '/users', component: () => import('./pages/UsersPage.vibe') }";
const routeTarget: Target = {
  element: route,
  key: '/users',
  find: routesArray,
  multiline: true,
  instruction: 'add the route',
};

const lines = (...list: string[]) => `${list.join('\n')}\n`;

describe('the AppModule imports', () => {
  it('edits the template shape', () => {
    const text = lines(
      "import { Module } from '@vibejs-org/server';",
      "import { HealthModule } from './health/health.module.ts';",
      '',
      '@Module({ imports: [HealthModule] })',
      'export class AppModule {}',
    );
    expect(register(text, moduleTarget)).toEqual({
      text: lines(
        "import { Module } from '@vibejs-org/server';",
        "import { HealthModule } from './health/health.module.ts';",
        "import { UsersModule } from './users/users.module.ts';",
        '',
        '@Module({ imports: [HealthModule, UsersModule] })',
        'export class AppModule {}',
      ),
    });
  });

  it('edits a multi-line shape with and without a trailing comma, after a non-ASCII comment', () => {
    for (const comma of [',', '']) {
      const text = lines(
        '// \u00dcn\u00efc\u00f8d\u00e9 \u{1F600} before the target',
        "import { Module } from '@vibejs-org/server';",
        '@Module({',
        '  imports: [',
        '    HealthModule,',
        `    OtherModule${comma}`,
        '  ],',
        '})',
        'export class AppModule {}',
      );
      expect(register(text, moduleTarget)).toEqual({
        text: lines(
          '// \u00dcn\u00efc\u00f8d\u00e9 \u{1F600} before the target',
          "import { Module } from '@vibejs-org/server';",
          "import { UsersModule } from './users/users.module.ts';",
          '@Module({',
          '  imports: [',
          '    HealthModule,',
          `    OtherModule,`,
          `    UsersModule${comma}`,
          '  ],',
          '})',
          'export class AppModule {}',
        ),
      });
    }
  });

  it('adds the import first in a file without imports, into an empty array', () => {
    const text = '@Module({ imports: [] })\nexport class AppModule {}\n';
    expect(register(text, moduleTarget)).toEqual({
      text: `${moduleTarget.import}\n@Module({ imports: [UsersModule] })\nexport class AppModule {}\n`,
    });
  });

  it('skips a registered module, also as UsersModule.forRoot()', () => {
    const text = '@Module({ imports: [UsersModule] })\nexport class AppModule {}\n';
    expect(register(text, moduleTarget)).toEqual({ registered: true });
    const forRoot = `${moduleTarget.import}\n@Module({ imports: [UsersModule.forRoot()] })\n`;
    expect(register(`${forRoot}export class AppModule {}\n`, moduleTarget)).toEqual({
      registered: true,
    });
  });

  it('adds only the element when the module is imported already', () => {
    const text = `${moduleTarget.import}\n@Module({ imports: [] })\nexport class AppModule {}\n`;
    expect(register(text, moduleTarget)).toEqual({
      text: `${moduleTarget.import}\n@Module({ imports: [UsersModule] })\nexport class AppModule {}\n`,
    });
  });

  it('adds the import after an import that follows the literal', () => {
    const text = lines(
      "import { Module } from '@vibejs-org/server';",
      '@Module({ imports: [HealthModule] })',
      'export class AppModule {}',
      "import { HealthModule } from './health/health.module.ts';",
    );
    expect(register(text, moduleTarget)).toEqual({
      text: lines(
        "import { Module } from '@vibejs-org/server';",
        '@Module({ imports: [HealthModule, UsersModule] })',
        'export class AppModule {}',
        "import { HealthModule } from './health/health.module.ts';",
        "import { UsersModule } from './users/users.module.ts';",
      ),
    });
  });

  it.each([
    ['a renamed AppModule', '@Module({ imports: [] })\nexport class RootModule {}\n'],
    ['a missing imports', '@Module({ controllers: [] })\nexport class AppModule {}\n'],
    ['imports not an array', '@Module({ imports })\nexport class AppModule {}\n'],
    ['no @Module', '@Other({ imports: [] })\nexport class AppModule {}\n'],
    ['no options', '@Module()\nexport class AppModule {}\n'],
    ['an unexported AppModule', '@Module({ imports: [] })\nclass AppModule {}\n'],
    ['a syntax error', '@Module({ imports: [ })\nexport class AppModule {}\n'],
  ])('gives the manual instruction for %s', (_, text) => {
    expect(register(text, moduleTarget)).toEqual({ manual: 'add UsersModule' });
  });
});

describe('the contracts object', () => {
  it('edits the template shape and an exported multi-line shape', () => {
    const imports = "import { health } from './health.ts';\n";
    expect(register(`${imports}const contracts = { health };\n`, contractTarget)).toEqual({
      text: `${imports}${contractTarget.import}\nconst contracts = { health, users };\n`,
    });
    const multi = `${imports}export const contracts = {\n  health,\n  'todos': todos,\n};\n`;
    expect(register(multi, contractTarget)).toEqual({
      text: `${imports}${contractTarget.import}\nexport const contracts = {\n  health,\n  'todos': todos,\n  users,\n};\n`,
    });
  });

  it('fills an empty object', () => {
    expect(register('const contracts = {};\n', contractTarget)).toEqual({
      text: `${contractTarget.import}\nconst contracts = { users };\n`,
    });
  });

  it('skips a registered contract, also as a key-value property', () => {
    expect(register('const contracts = { users };\n', contractTarget)).toEqual({
      registered: true,
    });
    expect(register("const contracts = { 'users': users };\n", contractTarget)).toEqual({
      registered: true,
    });
  });

  it.each([
    ['no contracts', 'const other = { health };\n'],
    ['contracts not an object', 'const contracts = make();\n'],
    ['a destructured contracts', 'const { contracts } = api;\n'],
    ['a function', 'export function contracts() {}\n'],
  ])('gives the manual instruction for %s', (_, text) => {
    expect(register(text, contractTarget)).toEqual({ manual: 'add users' });
  });
});

describe('the routes array', () => {
  it('breaks the single-line template array onto lines', () => {
    const text = lines(
      "import HomePage from './pages/HomePage.vibe';",
      '',
      "export const routes = defineRoutes([{ path: '/', component: HomePage }]);",
    );
    expect(register(text, routeTarget)).toEqual({
      text: lines(
        "import HomePage from './pages/HomePage.vibe';",
        '',
        'export const routes = defineRoutes([',
        "  { path: '/', component: HomePage },",
        `  ${route},`,
        ']);',
      ),
    });
  });

  it('appends to a multi-line array and fills an empty one', () => {
    const multi = "const routes = defineRoutes([\n  { path: '/', component: Home },\n]);\n";
    expect(register(multi, routeTarget)).toEqual({
      text: `const routes = defineRoutes([\n  { path: '/', component: Home },\n  ${route},\n]);\n`,
    });
    expect(register('const routes = defineRoutes([]);\n', routeTarget)).toEqual({
      text: `const routes = defineRoutes([\n  ${route},\n]);\n`,
    });
    expect(register('const routes = defineRoutes([\n]);\n', routeTarget)).toEqual({
      text: `const routes = defineRoutes([\n  ${route},\n]);\n`,
    });
  });

  it('keeps a trailing comment on the last element', () => {
    for (const comma of [',', '']) {
      const text = `const routes = defineRoutes([\n  { path: '/', component: H }${comma} // home\n]);\n`;
      expect(register(text, routeTarget)).toEqual({
        text: `const routes = defineRoutes([\n  { path: '/', component: H }, // home\n  ${route}${comma}\n]);\n`,
      });
    }
  });

  it('appends after a last element that shares the line of the closing bracket', () => {
    const text = "const routes = defineRoutes([\n  { path: '/', component: H }]);\n";
    expect(register(text, routeTarget)).toEqual({
      text: `const routes = defineRoutes([\n  { path: '/', component: H },\n  ${route}]);\n`,
    });
  });

  it('skips a registered path, whatever its component', () => {
    const text = "const routes = defineRoutes([{ path: '/users', component: Users }, ...more]);\n";
    expect(register(text, routeTarget)).toEqual({ registered: true });
  });

  it.each([
    ['a plain array', 'export const routes = [];\n'],
    ['another call', 'export const routes = makeRoutes([]);\n'],
    ['no array argument', 'export const routes = defineRoutes(list);\n'],
    ['no declaration', 'defineRoutes([]);\n'],
    ['a declaration without init', 'let routes;\n'],
  ])('gives the manual instruction for %s', (_, text) => {
    expect(register(text, routeTarget)).toEqual({ manual: 'add the route' });
  });
});

it('ignores elements without a name: spreads, holes, computed keys and non-string paths', () => {
  expect(register('const contracts = { [users]: x, ...rest };\n', contractTarget)).toEqual({
    text: `${contractTarget.import}\nconst contracts = { [users]: x, ...rest, users };\n`,
  });
  const text = 'const routes = defineRoutes([, { path: 1 }, { ...a }]);\n';
  expect(register(text, routeTarget)).toMatchObject({ text: expect.stringContaining(route) });
});
