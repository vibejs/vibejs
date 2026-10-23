import * as errors from '@usevibejs/errors';
import { expect, it } from 'vitest';

it('resolves @usevibejs/errors to its built dist', () => {
  expect(errors.isVibeError).toBeTypeOf('function');
  expect(import.meta.resolve('@usevibejs/errors')).toMatch(/\/packages\/errors\/dist\/index\.js$/);
});
