import type { KnipConfig } from 'knip';

// Entries: package exports and bins (package.json), tsdown configs and the Vitest config (knip
// plugins), and the repo scripts.
export default {
  workspaces: {
    '.': { entry: ['scripts/*.ts'] },
    'packages/*': {},
  },
  ignore: ['packages/create-vibejs/templates/**'],
  // catalogs.ts-next has no consumer until the language tools land, and knip cannot ignore one
  // catalog entry; delete this line when the first catalog:ts-next consumer lands.
  ignoreIssues: { 'pnpm-workspace.yaml': ['catalog'] },
} satisfies KnipConfig;
