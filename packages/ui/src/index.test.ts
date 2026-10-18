import * as errors from '@vibejs-org/errors';
import { describe, expect, it, vi } from 'vitest';
import { isVibeError, VibeError } from './index.ts';

describe('@vibejs-org/ui', () => {
  it('re-exports VibeError and isVibeError from @vibejs-org/errors', () => {
    expect(VibeError).toBe(errors.VibeError);
    expect(isVibeError).toBe(errors.isVibeError);
  });

  it('stubs __DEV__ to false for one test', () => {
    expect(__DEV__).toBe(true);
    vi.stubGlobal('__DEV__', false);
    expect(__DEV__).toBe(false);
  });

  it('resets __DEV__ to true after a stub', () => {
    expect(__DEV__).toBe(true);
  });
});
