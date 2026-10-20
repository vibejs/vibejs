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
const PERF = 'packages/language-tools/src/perf.integration.test.ts';

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
        // projects load this config before the compiler's dist exists. Any other error is rethrown.
        plugins: [
          import('@vibejs-org/compiler/vite').then(
            ({ vibe }) => vibe(),
            (error: unknown) => {
              // Node's ESM loader reports ERR_MODULE_NOT_FOUND; knip loads this config through jiti (CJS).
              if (
                error instanceof Error &&
                'code' in error &&
                (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND')
              ) {
                return null;
              }
              throw error;
            },
          ),
        ],
        test: {
          name: 'integration',
          environment: 'node',
          // The tests spawn builds, servers and browsers in parallel, so one can wait for the CPU.
          testTimeout: 60_000,
          include: [
            'packages/*/src/**/*.integration.test.ts',
            'packages/create-vibejs/*.integration.test.ts',
            'docs/scripts/**/*.integration.test.ts',
            'examples/*/test/**/*.integration.test.ts',
            '**/*.vibe.test.ts',
          ],
          exclude: [...configDefaults.exclude, PERF],
        },
      },
      {
        // The time budgets run alone, after the other integration tests: parallel tsc runs would
        // slow the measured thread.
        test: {
          name: 'perf',
          environment: 'node',
          include: [PERF],
          sequence: { groupOrder: 1 },
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
