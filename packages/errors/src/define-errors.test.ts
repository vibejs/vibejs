import { describe, expect, it } from 'vitest';
import { defineErrors, docsUrl } from './define-errors.ts';
import { DOCS_BASE } from './docs-base.gen.ts';
import { isVibeError } from './vibe-error.ts';

const MESSAGES = {
  VIBE9101: [
    'No provider for {token} in module {module}.',
    'Add {token} to providers.',
    'Import a module that exports {token}.',
  ],
  VIBE9102: ['The app is closed.', 'Create a new app.'],
} as const;
const args = { token: 'DB', module: 'AppModule' };

describe('docsUrl', () => {
  it('is DOCS_BASE plus the code, plus encoded args when there are any', () => {
    expect(DOCS_BASE).toBe('https://vibejs.org/v0/errors/');
    expect(docsUrl('VIBE9102')).toBe('https://vibejs.org/v0/errors/VIBE9102');
    expect(docsUrl('VIBE9102', {})).toBe('https://vibejs.org/v0/errors/VIBE9102');
    expect(docsUrl('VIBE9101', { token: 'a b&c', count: 2 })).toBe(
      'https://vibejs.org/v0/errors/VIBE9101?token=a+b%26c&count=2',
    );
  });

  it('keeps the args where URLSearchParams has no size (Safari 16.4, Chrome 111)', () => {
    const size = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, 'size');
    Reflect.deleteProperty(URLSearchParams.prototype, 'size');
    try {
      expect(docsUrl('VIBE9101', args)).toBe(`${DOCS_BASE}VIBE9101?token=DB&module=AppModule`);
    } finally {
      if (size) Object.defineProperty(URLSearchParams.prototype, 'size', size);
    }
  });
});

describe('defineErrors', () => {
  it('formats the message, fixes and docs link from the table', () => {
    const cause = new Error('cause');
    const error = defineErrors(() => MESSAGES)('VIBE9101', args, { cause });
    expect(error.message).toBe(
      [
        '[VIBE9101] No provider for DB in module AppModule.',
        '  Fix: Add DB to providers.',
        '  Fix: Import a module that exports DB.',
        '  Docs: https://vibejs.org/v0/errors/VIBE9101',
      ].join('\n'),
    );
    expect(error).toMatchObject({
      name: 'VibeError',
      code: 'VIBE9101',
      fixes: ['Add DB to providers.', 'Import a module that exports DB.'],
      docs: 'https://vibejs.org/v0/errors/VIBE9101',
      args,
      cause,
    });
    expect(isVibeError(error, 'VIBE9101')).toBe(true);
  });

  it('sets empty args for a placeholder-free code', () => {
    const error = defineErrors(() => MESSAGES)('VIBE9102');
    expect(error.message).toBe(
      '[VIBE9102] The app is closed.\n  Fix: Create a new app.\n  Docs: https://vibejs.org/v0/errors/VIBE9102',
    );
    expect(error.args).toEqual({});
  });

  it('gives only the code and the docs URL when no table is loaded', () => {
    const error = defineErrors<typeof MESSAGES>(() => undefined)('VIBE9101', args);
    expect(error.message).toBe(
      '[VIBE9101] https://vibejs.org/v0/errors/VIBE9101?token=DB&module=AppModule',
    );
    expect(error).toMatchObject({
      name: 'VibeError',
      code: 'VIBE9101',
      fixes: [],
      docs: 'https://vibejs.org/v0/errors/VIBE9101?token=DB&module=AppModule',
      args,
    });
  });
});
