import { defineConfig } from 'tsdown';
import { base } from '../../tsdown.base.ts';

// The dist reads the dev flag from NODE_ENV, so that consumer bundlers drop dev-only code. A
// plugin, because `define` accepts only identifiers and literals. The identity `define` keeps
// `process.env.NODE_ENV` in the output, which the browser platform would otherwise fold.
const devFlag = {
  name: 'vibejs:dev-flag',
  transform: {
    filter: { code: '__DEV__' },
    handler: (code: string) => ({
      code: code.replaceAll('__DEV__', '(process.env.NODE_ENV !== "production")'),
    }),
  },
};

export default defineConfig({
  ...base,
  platform: 'browser',
  plugins: [devFlag],
  define: { 'process.env.NODE_ENV': 'process.env.NODE_ENV' },
  entry: ['src/index.ts', 'src/internal.ts', 'src/tooling.ts', 'src/router.ts', 'src/testing.ts'],
});
