import type { KnipConfig } from 'knip';

// Entries: package exports and bins (package.json), tsdown configs and the Vitest config (knip
// plugins), and the repo scripts.
export default {
  workspaces: {
    '.': { entry: ['scripts/*.ts'] },
    'packages/*': {},
  },
  ignore: ['packages/create-vibejs/templates/**', 'packages/ui/test/fixtures/**'],
} satisfies KnipConfig;
