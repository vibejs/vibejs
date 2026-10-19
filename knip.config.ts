import type { KnipConfig } from 'knip';

// Entries: package exports and bins (package.json), tsdown configs and the Vitest config (knip
// plugins), and the repo scripts.
export default {
  workspaces: {
    '.': { entry: ['scripts/*.ts'] },
    'packages/*': {},
    'packages/cli': {
      // Run, never imported, by the check tool-contract test from packages/cli/node_modules;
      // the contract package is imported only by the dev fixture app.
      ignoreDependencies: ['oxlint', 'oxfmt', '@vibejs-org/contract'],
    },
    'packages/language-tools': {
      // Imported only by the virtual code the mapper generates, which the typecheck corpus runs.
      ignoreDependencies: ['@vibejs-org/ui'],
    },
    docs: { entry: ['scripts/*.ts'] },
  },
  ignore: ['packages/create-vibejs/templates/**', '**/test/fixtures/**'],
} satisfies KnipConfig;
