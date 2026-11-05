import { describe, expect, it } from 'vitest';
import { files, isFilesBody } from './files.ts';
import { get, post } from './route.ts';

const limits = { maxBytes: 1000, maxFiles: 2, types: ['image/png', 'image/*'] };

describe('files', () => {
  it('returns a frozen-shaped upload declaration and copies types', () => {
    const types = ['image/png'];
    const body = files({ maxBytes: 8, maxFiles: 1, types });
    types.push('text/plain');
    expect(body).toEqual({ kind: 'files', maxBytes: 8, maxFiles: 1, types: ['image/png'] });
    expect(post('/uploads', { body }).def.body).toBe(body);
  });

  it.each([
    [{ ...limits, maxBytes: 0 }, 'a maxBytes that is not a positive integer'],
    [{ ...limits, maxBytes: 1.5 }, 'a maxBytes that is not a positive integer'],
    [{ ...limits, maxFiles: 0 }, 'a maxFiles that is not a positive integer'],
    [{ ...limits, types: [] }, 'a types list that is empty or contains an empty type'],
    [{ ...limits, types: [''] }, 'a types list that is empty or contains an empty type'],
  ])('throws VIBE9005 for %j', (options, reason) => {
    expect(() => files(options)).toThrow(
      expect.objectContaining({ code: 'VIBE9005', args: { reason } }),
    );
  });

  it('throws VIBE9005 when a type is not a string', () => {
    const options = { maxBytes: 1000, maxFiles: 2, types: ['image/png', 1] };
    // @ts-expect-error types are strings
    expect(() => files(options)).toThrow(
      expect.objectContaining({
        code: 'VIBE9005',
        args: { reason: 'a types list that is empty or contains an empty type' },
      }),
    );
  });

  it('is rejected on a GET route with VIBE9004', () => {
    const body = files(limits);
    // @ts-expect-error a GET route takes no body
    expect(() => get('/search', { body })).toThrow(expect.objectContaining({ code: 'VIBE9004' }));
  });
});

describe('isFilesBody', () => {
  it('is true only for a files() value', () => {
    expect(isFilesBody(files(limits))).toBe(true);
    expect(isFilesBody({ kind: 'files' })).toBe(true);
    expect(isFilesBody(null)).toBe(false);
    expect(isFilesBody(1)).toBe(false);
    expect(isFilesBody({})).toBe(false);
    expect(isFilesBody({ kind: 'raw' })).toBe(false);
  });
});
