import { expect, it } from 'vitest';
import { UsersController, users } from './handler.ts';
import { sign, zero } from './math.ts';

it('returns the sample user', () => {
  expect(new UsersController().get({ route: users })).toEqual({ id: '1', name: 'Ada' });
});

it('signs numbers', () => {
  expect(sign(-2)).toBe(-1);
  expect(sign(2)).toBe(1);
  expect(zero).toBe(0);
});
