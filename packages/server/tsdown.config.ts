import { defineConfig } from 'tsdown';
import { base } from '../../tsdown.base.ts';

export default defineConfig({
  ...base,
  platform: 'node',
  entry: ['src/index.ts', 'src/testing.ts', 'src/openapi.ts'],
});
