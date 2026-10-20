import { mount } from '@vibejs-org/ui/testing';
import { expect, it } from 'vitest';
import RatingInput from './RatingInput.vibe';

it('renders one button per star, 5 by default', () => {
  expect(mount(RatingInput, { props: { modelValue: 0 } }).findAll('button')).toHaveLength(5);
  expect(mount(RatingInput, { props: { modelValue: 0, max: 3 } }).findAll('button')).toHaveLength(
    3,
  );
});

it('updates the model and emits change with the clicked star', async () => {
  const updates: number[] = [];
  const wrapper = mount(RatingInput, {
    props: { modelValue: 1, 'onUpdate:modelValue': (value: number) => void updates.push(value) },
  });
  await wrapper.findAll('button')[2].trigger('click');
  expect(updates).toEqual([3]);
  expect(wrapper.emitted('change')).toEqual([[3]]);
});
