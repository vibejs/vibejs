import * as errors from '@vibejs-org/errors';
import { expect, it } from 'vitest';

it('resolves @vibejs-org/errors to its built dist', () => {
  expect(errors.isVibeError).toBeTypeOf('function');
  expect(import.meta.resolve('@vibejs-org/errors')).toMatch(/\/packages\/errors\/dist\/index\.js$/);
});
