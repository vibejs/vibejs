import { describe, expect, it } from 'vitest';
import { vibeError } from './errors.gen.ts';
import { envelopeError, errorText, exitCode, type JsonEnvelope } from './output.ts';

const base = { command: 'explain', version: '1.2.3' };

describe('envelopeError', () => {
  it('keeps the first message line without the code prefix, and the fixes and docs', () => {
    const e = vibeError('VIBE8008', { code: 'VIBE0000' });
    expect(envelopeError(e)).toEqual({
      code: 'VIBE8008',
      message: 'No error code `VIBE0000` in the catalog of this vibejs version.',
      docs: 'https://vibejs.org/v0/errors/VIBE8008',
      fixes: [...e.fixes],
    });
  });

  it('carries the missing inputs', () => {
    const missing = [{ name: 'code', example: 'vibejs explain VIBE8003' }];
    const e = vibeError('VIBE8003', { name: 'code', command: 'explain' });
    expect(envelopeError(e, missing)).toMatchObject({ code: 'VIBE8003', missing });
  });
});

describe('errorText', () => {
  it('renders the VibeError format plus the next commands', () => {
    const r: JsonEnvelope = {
      ...base,
      ok: false,
      next: ['vibejs --help'],
      error: envelopeError(vibeError('VIBE8004', { name: 'g' })),
    };
    expect(errorText(r)).toBe(
      [
        '[VIBE8004] Unknown command or option `g`.',
        '  Fix: Run `vibejs --help` to list the commands and their options.',
        '  Fix: Run the command from `next` in the JSON output.',
        '  Docs: https://vibejs.org/v0/errors/VIBE8004',
        '  Next: vibejs --help',
      ].join('\n'),
    );
  });

  it('renders an error without fixes or next commands', () => {
    const error = { code: 'VIBE8008', message: 'Gone.', docs: 'https://example.com' } as const;
    expect(errorText({ ...base, ok: false, error })).toBe(
      '[VIBE8008] Gone.\n  Docs: https://example.com',
    );
  });
});

const error = (code: `VIBE${number}`) => ({ code, message: '', docs: '' });

describe('exitCode', () => {
  it.each([
    [{ ...base, ok: true }, 0],
    [{ ...base, ok: false, error: error('VIBE8003') }, 2],
    [{ ...base, ok: false, error: error('VIBE8004') }, 2],
    [{ ...base, ok: false, error: error('VIBE8001') }, 2],
    [{ ...base, ok: false, error: error('VIBE8005') }, 2],
    [{ ...base, ok: false, error: error('VIBE8301') }, 2],
    [{ ...base, ok: false, error: error('VIBE8008') }, 1],
    [{ ...base, ok: false }, 1],
  ])('maps %o to %i', (r, code) => {
    expect(exitCode(r)).toBe(code);
  });
});
