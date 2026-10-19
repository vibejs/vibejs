import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'jsdom', include: ['failing.test.ts'] } });
