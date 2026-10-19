import { expect, expectTypeOf, test } from 'vitest';
import * as internal from './internal.ts';
import type { Block, Fragment } from './internal.ts';

test('exports exactly the ABI draft helpers', () => {
  expect(new Set(Object.keys(internal))).toEqual(
    new Set([
      'template',
      'child',
      'next',
      'nthChild',
      'txt',
      'renderEffect',
      'setText',
      'setAttr',
      'setProp',
      'setClass',
      'setStyle',
      'setHtml',
      'setDynamicProps',
      'toDisplayString',
      'on',
      'withModifiers',
      'withKeys',
      'insert',
      'createIf',
      'createKeyed',
      'createFor',
      'applyVShow',
      'applyTextModel',
      'applyCheckboxModel',
      'applyRadioModel',
      'applySelectModel',
    ]),
  );
  expectTypeOf<Block>().toEqualTypeOf<Node | Fragment | Block[]>();
});
