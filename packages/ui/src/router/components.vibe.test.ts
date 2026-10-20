// @vitest-environment jsdom
// Runs the RouterView and RouterLink suites on their template twins, compiled by the built vibe().
import { expect, test } from 'vitest';
import * as suites from '../../test/router/components.suite.ts';
import TemplateRouterLink from '../../test/router/TemplateRouterLink.vibe';
import TemplateRouterView from '../../test/router/TemplateRouterView.vibe';

suites.RouterViewSuite.run(() => TemplateRouterView);
suites.RouterLinkSuite.run(() => TemplateRouterLink);

test('runs every router component suite on a compiled twin', () => {
  expect(new Set(Object.keys(suites))).toEqual(new Set(['RouterLinkSuite', 'RouterViewSuite']));
});
