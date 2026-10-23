import { vibe } from '@usevibejs/compiler/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [vibe()],
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['ui/src/**/*.test.ts', 'test/*.test.ts'],
          // Run from the repo's integration project, after the build.
          exclude: ['**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/src/**/*.test.ts', 'contracts/src/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['ui/src/**/*.{ts,vibe}', 'server/src/**/*.ts', 'contracts/src/**/*.ts'],
      exclude: ['**/*.test.ts', 'ui/src/main.ts', 'server/src/main.ts'],
      thresholds: { 100: true, perFile: true },
    },
  },
});
