import { playwright } from '@vitest/browser-playwright';
import { defaultClientConditions, defaultServerConditions } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

// Packages resolve to src through the vibejs-source condition, except in the integration project.
const source = {
  resolve: { conditions: ['vibejs-source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['vibejs-source', ...defaultServerConditions] } },
};
const special = ['**/*.browser.test.ts', '**/*.integration.test.ts', '**/*.vibe.test.ts'];
const uiSetup = ['packages/ui/vitest.setup.ts'];

export default defineConfig({
  test: {
    unstubGlobals: true,
    unstubEnvs: true,
    projects: [
      {
        ...source,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'packages/*/src/**/*.test.ts',
            'packages/create-vibejs/*.test.ts',
            'scripts/**/*.test.ts',
            'docs/scripts/**/*.test.ts',
          ],
          exclude: [...configDefaults.exclude, 'packages/ui/**', ...special],
        },
      },
      {
        ...source,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['packages/ui/src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...special],
          setupFiles: uiSetup,
        },
      },
      {
        ...source,
        test: {
          name: 'browser',
          include: ['packages/*/src/**/*.browser.test.ts'],
          setupFiles: uiSetup,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        // The built vibe() compiles `.vibe` imports. Loaded lazily: knip, `pnpm check` and the other
        // projects load this config before the compiler's dist exists.
        plugins: [
          import('@vibejs-org/compiler/vite').then(
            ({ vibe }) => vibe(),
            () => null,
          ),
        ],
        test: {
          name: 'integration',
          environment: 'node',
          include: [
            'packages/*/src/**/*.integration.test.ts',
            'packages/create-vibejs/*.integration.test.ts',
            'docs/scripts/**/*.integration.test.ts',
            '**/*.vibe.test.ts',
          ],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/*/src/**/*.ts',
        'packages/create-vibejs/bin.js',
        'scripts/**/*.ts',
        'docs/scripts/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test-d.ts',
        '**/*.d.ts',
        'scripts/e2e.ts',
        'scripts/agent-eval.ts',
      ],
      thresholds: { 100: true, perFile: true },
    },
  },
});
