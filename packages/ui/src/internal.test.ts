import { expect, expectTypeOf, test } from 'vitest';
import * as internal from './internal.ts';
import type { Block, ComponentInstance, Fragment } from './internal.ts';

test('exports exactly the ABI v1 helpers of C3 and hmr', () => {
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
      'createComponent',
      'createDynamicComponent',
      'createSlot',
      'useModel',
      'setRef',
      'hmr',
    ]),
  );
  expectTypeOf<Block>().toEqualTypeOf<Node | Fragment | ComponentInstance | Block[]>();
});
