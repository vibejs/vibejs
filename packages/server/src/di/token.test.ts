// oxlint-disable typescript/no-extraneous-class -- classes are tokens here
import { describe, expect, it } from 'vitest';
import { token, tokenName } from './token.ts';

describe('token', () => {
  it('returns a frozen object carrying its description', () => {
    const name = token<string>('app name');
    expect(name).toEqual({ description: 'app name' });
    expect(Object.isFrozen(name)).toBe(true);
  });

  it('creates distinct keys for the same description', () => {
    const a = token<string>('x');
    const b = token<string>('x');
    expect(a).not.toBe(b);
    expect(new Map([[a, 1]]).has(b)).toBe(false);
  });
});

describe('tokenName', () => {
  it('names a class, an anonymous class and a token', () => {
    class Db {}
    expect(tokenName(Db)).toBe('Db');
    expect(tokenName((() => class {})())).toBe('<anonymous class>');
    expect(tokenName(token('config'))).toBe('config');
  });
});
