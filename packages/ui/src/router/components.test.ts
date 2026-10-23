import { isVibeError } from '@usevibejs/errors';
import { expect, it } from 'vitest';
import * as suites from '../../test/router/components.suite.ts';
import { handlers, ViewWithSlot } from '../../test/router/components.ts';
import { mount } from '../testing/mount.ts';
import { RouterLink, RouterView } from './components.ts';
import { createMemoryHistory } from './history.ts';
import { createRouter } from './router.ts';

suites.RouterViewSuite.run(() => RouterView);
suites.RouterLinkSuite.run(() => RouterLink);

it('runs every router component suite', () => {
  expect(new Set(Object.keys(suites))).toEqual(new Set(['RouterLinkSuite', 'RouterViewSuite']));
});

it('throws VIBE7115 for slot content in RouterView', () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/' }] });
  const errors: unknown[] = [];
  mount(ViewWithSlot, { plugins: [router, handlers((err) => errors.push(err))] });
  expect(errors).toHaveLength(1);
  expect(isVibeError(errors[0], 'VIBE7115')).toBe(true);
});
