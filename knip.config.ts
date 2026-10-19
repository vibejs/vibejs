import type { KnipConfig } from 'knip';

// Entries: package exports and bins (package.json), tsdown configs and the Vitest config (knip
// plugins), and the repo scripts.
export default {
  workspaces: {
    '.': { entry: ['scripts/*.ts'] },
    'packages/*': {},
    'packages/cli': {
      // Run, never imported, by the check tool-contract test from packages/cli/node_modules.
      ignoreDependencies: ['oxlint', 'oxfmt'],
    },
  },
  ignore: ['packages/create-vibejs/templates/**', '**/test/fixtures/**'],
} satisfies KnipConfig;
