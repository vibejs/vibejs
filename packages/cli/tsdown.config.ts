import { defineConfig } from 'tsdown';
import { base } from '../../tsdown.base.ts';

// A bin only: no JS API, so no generated exports and no attw.
export default defineConfig({
  ...base,
  platform: 'node',
  entry: ['src/bin.ts'],
  exports: false,
  attw: false,
});
