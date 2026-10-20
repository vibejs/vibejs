import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['contract/**/*.ts', 'server/**/*.ts', 'ui/**/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: { 100: true, perFile: true },
    },
  },
});
