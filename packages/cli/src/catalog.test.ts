import { expect, it } from 'vitest';
import { CATALOG } from './catalog.gen.ts';

it('has unique codes', () => {
  expect(new Set(CATALOG.map((entry) => entry.code)).size).toBe(CATALOG.length);
});

it('links every entry to the docs page of its code', () => {
  expect(CATALOG.filter((entry) => !entry.docs.endsWith(entry.code))).toEqual([]);
});
