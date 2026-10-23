import * as errors from '@usevibejs/errors';
import { expect, it } from 'vitest';
import { isVibeError, VibeError } from './index.ts';

it('re-exports VibeError and isVibeError in a real browser', () => {
  expect(navigator.userAgent).toContain('Chrome');
  expect(VibeError).toBe(errors.VibeError);
  expect(isVibeError).toBe(errors.isVibeError);
});
