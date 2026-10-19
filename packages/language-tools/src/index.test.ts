import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import * as api from './index.ts';

it('exports generate, formatSpans and the span constants', () => {
  expect(Object.keys(api).toSorted()).toEqual(['Feature', 'SpanKind', 'formatSpans', 'generate']);
});

// tsc caches mapper output by `name@version` (dynamicConfig: false) and spawns `exec` from the
// package directory.
it('keeps the content mapper manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  expect(manifest).toMatchObject({
    name: '@vibejs-org/language-tools',
    version: expect.any(String),
  });
  expect(manifest.typescript.contentMapper).toEqual({
    exec: ['node', './dist/server.js'],
    compilerOptions: [],
    dynamicConfig: false,
  });
});
