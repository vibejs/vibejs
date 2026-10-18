import { defineConfig } from 'tsdown';
import { base } from '../../tsdown.base.ts';

export default defineConfig({
  ...base,
  platform: 'browser',
  entry: ['src/index.ts', 'src/internal.ts', 'src/tooling.ts', 'src/router.ts', 'src/testing.ts'],
});
