import type { KnipConfig } from 'knip';

// Entries: package exports and bins (package.json), tsdown configs and the Vitest config (knip
// plugins), and the repo scripts.
export default {
  workspaces: {
    '.': { entry: ['scripts/*.ts'] },
    'packages/*': {},
    'packages/cli': {
      // Run, never imported, by the check tool-contract test from packages/cli/node_modules;
      // the contract package is imported only by the dev fixture app; the mapper and ui are
      // loaded only by tsc on the .vibe fixtures, through the linked node_modules.
      ignoreDependencies: [
        'oxlint',
        'oxfmt',
        '@vibejs-org/contract',
        '@vibejs-org/language-tools',
        '@vibejs-org/ui',
      ],
    },
    'packages/ui': {
      // An optional peer by design: only the `./testing` entry imports it, inside the user's tests.
      ignoreDependencies: ['vitest'],
    },
    'packages/language-tools': {
      // Imported only by the virtual code the mapper generates, which the typecheck corpus runs.
      ignoreDependencies: ['@vibejs-org/ui'],
    },
    // The app entry (CONTRACTS C7); the Vitest config and tests come from the knip plugin.
    'examples/*': { entry: ['server/src/app.module.ts'] },
    docs: { entry: ['scripts/*.ts'] },
  },
  ignore: ['packages/create-vibejs/templates/**', '**/test/fixtures/**'],
} satisfies KnipConfig;
