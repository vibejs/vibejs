import type { KnipConfig } from 'knip';

// Entries: package exports and bins (package.json), tsdown configs and the Vitest config (knip
// plugins), and the repo scripts.
export default {
  workspaces: {
    '.': { entry: ['scripts/*.ts'] },
    'packages/*': {},
    'packages/cli': {
      // Run, never imported, by the check tool-contract test from packages/cli/node_modules;
      // the contract package is imported only by the dev fixture app; the mapper is loaded
      // only by tsc on the .vibe fixtures, through the linked node_modules.
      ignoreDependencies: ['oxlint', 'oxfmt', '@usevibejs/contract', '@usevibejs/language-tools'],
    },
    'packages/create-vibejs': {
      // Built first: its build script copies the CLI's agent files into the package.
      ignoreDependencies: ['@usevibejs/cli'],
    },
    'packages/ui': {
      // An optional peer by design: only the `./testing` entry imports it, inside the user's tests.
      ignoreDependencies: ['vitest'],
      // The root Vitest config names these as `*.node-test.ts` inside a project include. Knip's
      // Vitest plugin keeps its default test entries and does not read that include, so the
      // defaults are repeated here and the node-test pattern is added.
      vitest: {
        entry: ['**/*.{bench,test,test-d,spec,spec-d}.?(c|m)[jt]s?(x)', '**/*.node-test.ts'],
      },
    },
    'packages/language-tools': {
      // Imported only by the virtual code the mapper generates, which the typecheck corpus runs.
      ignoreDependencies: ['@usevibejs/ui'],
    },
    // The app entries (CONTRACTS C7) and the tests. The Vitest config imports the built vibe()
    // plugin, so knip reads it as a plain entry instead of loading it before the build.
    'examples/*': {
      entry: [
        'server/src/app.module.ts',
        'server/src/main.ts',
        'ui/src/main.ts',
        'ui/vite.config.ts',
        'vitest.config.ts',
      ],
      vitest: { config: [], entry: ['**/*.test.ts'] },
      // Run by `vibejs check`.
      ignoreDependencies: ['oxfmt', 'oxlint'],
    },
    // A local package: its exports are the entries.
    'examples/todo-flags': {},
    docs: {
      entry: ['scripts/*.ts'],
      // Imported only by the snippets of the pages, which check-snippets type-checks with the
      // .vibe content mapper; the tutorial test imports the scaffold helpers of create-vibejs.
      ignoreDependencies: [
        '@usevibejs/compiler',
        '@usevibejs/contract',
        '@usevibejs/language-tools',
        '@usevibejs/server',
        '@usevibejs/ui',
        'create-vibejs',
        'valibot',
      ],
    },
  },
  ignore: ['packages/create-vibejs/templates/**', '**/test/fixtures/**'],
} satisfies KnipConfig;
