import { mount } from '@vibejs-org/ui/testing';
import { expect, it } from 'vitest';
import RatingInput from './RatingInput.vibe';

it('shows the filled stars and emits the picked one', async () => {
  const updates: number[] = [];
  const wrapper = mount(RatingInput, {
    props: { modelValue: 1, max: 3, 'onUpdate:modelValue': (value) => void updates.push(value) },
  });
  expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['★', '☆', '☆']);
  await wrapper.findAll('button')[1].trigger('click');
  expect(updates).toEqual([2]);
  expect(wrapper.emitted('change')).toEqual([[2]]);
});

it('has 5 empty stars by default', () => {
  expect(
    mount(RatingInput)
      .findAll('button')
      .map((button) => button.text()),
  ).toEqual(Array(5).fill('☆'));
});
