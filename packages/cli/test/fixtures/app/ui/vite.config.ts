import { defaultClientConditions, defaultServerConditions, defineConfig, type Plugin } from 'vite';

/**
 * Raises a C2-shaped error with a VIBE code for a file that contains the marker, and exposes the
 * dev server to in-process tests.
 */
const marker: Plugin = {
  name: 'fixture-marker',
  configureServer(server) {
    Object.assign(globalThis, { fixtureServer: server });
  },
  transform(code, id) {
    if (!code.includes('FIXTURE_ERROR')) return;
    this.error({ message: 'fixture error', code: 'VIBE1001', id, loc: { line: 2, column: 5 } });
  },
};

// The workspace packages run from source, so tests need no build.
export default defineConfig({
  resolve: { conditions: ['vibejs-source', ...defaultClientConditions] },
  ssr: {
    noExternal: [/^@vibejs-org\//],
    resolve: { conditions: ['vibejs-source', ...defaultServerConditions] },
  },
  plugins: [marker],
});
