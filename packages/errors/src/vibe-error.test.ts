import { describe, expect, it, vi } from 'vitest';
import { isVibeError, VibeError, type VibeErrorInit } from './vibe-error.ts';

const init: VibeErrorInit = {
  code: 'VIBE0001',
  message: '[VIBE0001] Something failed.',
  fixes: ['Do the other thing.'],
  docs: 'https://vibejs.org/v0/errors/VIBE0001',
  args: { name: 'x', count: 2 },
};

describe('VibeError', () => {
  it('carries the C2 fields', () => {
    const cause = new Error('cause');
    const error = new VibeError(init, { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ ...init, name: 'VibeError', cause });
  });
});

describe('isVibeError', () => {
  it('recognizes a VibeError, with or without a code', () => {
    const error = new VibeError(init);
    expect(isVibeError(error)).toBe(true);
    expect(isVibeError(error, 'VIBE0001')).toBe(true);
    expect(isVibeError(error, 'VIBE0002')).toBe(false);
  });

  it('recognizes the brand of another copy of the package', () => {
    const copy = { [Symbol.for('vibejs.error')]: true, code: 'VIBE0001' };
    expect(isVibeError(copy, 'VIBE0001')).toBe(true);
  });

  it('recognizes an error created by a second module instance', async () => {
    vi.resetModules();
    const second = await import('./index.ts');
    const error = new second.VibeError(init);
    expect(second.VibeError).not.toBe(VibeError);
    expect(error).not.toBeInstanceOf(VibeError);
    expect(isVibeError(error)).toBe(true);
    expect(isVibeError(error, 'VIBE0001')).toBe(true);
    expect(isVibeError(error, 'VIBE0002')).toBe(false);
    expect(isVibeError(new Error('[VIBE0001] Something failed.'))).toBe(false);
  });

  it('rejects everything else', () => {
    for (const value of [undefined, null, 'VIBE0001', new Error('x'), { code: 'VIBE0001' }]) {
      expect(isVibeError(value)).toBe(false);
    }
  });
});
