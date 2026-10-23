import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const template = (file: string) =>
  readFileSync(new URL(`templates/fullstack/${file}`, import.meta.url), 'utf8');
const json = (file: string) => JSON.parse(template(file));

/** The repo's `catalog` versions, with `typescript` from `catalogs.ts-next`. */
function catalog(): Record<string, string> {
  const yaml = readFileSync(new URL('../../pnpm-workspace.yaml', import.meta.url), 'utf8');
  const versions: Record<string, string> = {};
  let section = '';
  for (const line of yaml.split(/\r?\n/)) {
    if (!line.startsWith(' ')) section = line;
    else if (/^ {2}\S.*:$/.test(line)) section = line.trim();
    const entry = /^ +'?([^':]+)'?: (\S+)$/.exec(line);
    if (entry && ['catalog:', 'ts-next:'].includes(section)) versions[entry[1]] = entry[2];
  }
  return versions;
}

it('pins the third-party tools to the repo catalog and TypeScript to the ts-next pin', () => {
  const { dependencies, devDependencies, overrides, engines } = json('package.json');
  const pins = catalog();
  expect(pins.typescript).toMatch(/^7\.1\.0-dev\./);
  for (const [name, spec] of Object.entries({ ...dependencies, ...devDependencies })) {
    const expected = name.startsWith('@usevibejs/') ? '0.0.0-template' : pins[name];
    expect([name, spec]).toEqual([name, expected]);
  }
  // npm reads a prerelease TypeScript as outside the optional `>=5` peer range of valibot.
  expect(overrides).toEqual({ typescript: '$typescript' });
  expect(engines).toEqual({ node: '^24.15.0 || >=26' });
});

it('excludes only the vibe.js packages from the release age gate', () => {
  expect(template('pnpm-workspace.yaml')).toBe(
    "minimumReleaseAgeExclude:\n  - '@usevibejs/*'\n  - create-vibejs\n",
  );
});

it('has the CONTRACTS C6 ui tsconfig and a decorator-enabled server tsconfig', () => {
  expect(json('ui/tsconfig.json')).toEqual({
    extends: '../tsconfig.base.json',
    compilerOptions: {
      lib: ['es2024', 'dom'],
      types: ['vite/client'],
      verbatimModuleSyntax: true,
      noEmit: true,
    },
    contentMappers: [{ package: '@usevibejs/language-tools', extensions: ['.vibe'] }],
    include: ['src'],
    references: [{ path: '../contracts' }],
  });
  const server = json('server/tsconfig.json');
  expect(server.compilerOptions.experimentalDecorators).toBe(true);
  expect(template('server/tsconfig.json')).not.toContain('emitDecoratorMetadata');
});

it('keeps the 100% coverage opt-in commented and lists the covered files', () => {
  const config = template('vitest.config.ts');
  expect(config).toContain('\n      // thresholds: { 100: true, perFile: true },\n');
  expect(config).toContain(
    "include: ['ui/src/**/*.{ts,vibe}', 'server/src/**/*.ts', 'contracts/src/**/*.ts'],",
  );
});

it('forbids server imports in ui code and enables no type-aware rules', () => {
  const lint = json('.oxlintrc.json');
  expect(lint.options).toBeUndefined();
  const ui = lint.overrides.find((o: { files: string[] }) => o.files.includes('ui/**'));
  const [, { paths, patterns }] = ui.rules['eslint/no-restricted-imports'];
  expect(paths.map((p: { name: string }) => p.name)).toEqual(['@usevibejs/server']);
  expect(patterns[0].group).toContain('@usevibejs/server/*');
});
