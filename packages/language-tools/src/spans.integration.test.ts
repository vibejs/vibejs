// The span constants equal the enums of the pinned TypeScript 7.1 (catalog:ts-next).
import { SpanMapFeature, SpanMapKind } from 'typescript/ast';
import { expect, it } from 'vitest';
import { Feature, SpanKind } from './builder.ts';

/** The named members of a numeric TypeScript enum, without its reverse mappings. */
const members = (e: object) => Object.entries(e).filter(([, value]) => typeof value === 'number');

it('has the SpanMapKind and SpanMapFeature values of TypeScript', () => {
  expect(Object.fromEntries(members(SpanMapKind))).toEqual(SpanKind);
  expect(Object.fromEntries(members(SpanMapFeature))).toEqual(Feature);
});
