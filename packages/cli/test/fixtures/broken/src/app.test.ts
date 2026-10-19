import { expect, it } from 'vitest';
import { CountController, UsersController, users } from './handler.ts';
import { sign } from './math.ts';

it('returns the sample user', () => {
  expect(new UsersController().get({ route: users })).toEqual({ id: '1', name: 'Ada' });
  expect(new CountController().count({ route: users })).toBe(10);
});

it('signs numbers', () => {
  expect(sign(2)).toBe(2);
});
