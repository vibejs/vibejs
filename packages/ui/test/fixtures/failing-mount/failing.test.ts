// A user test that fails after mounting: its error must end with the rendered HTML.
import type { Component } from '@vibejs-org/ui';
import { template } from '@vibejs-org/ui/internal';
import { mount } from '@vibejs-org/ui/testing';
import { expect, it } from 'vitest';

const t0 = template('<p class="banner">Hello fixture</p>');
const Banner: Component = { name: 'Banner', render: () => t0() };

it('fails with the rendered HTML', () => {
  expect(mount(Banner).text()).toBe('Goodbye');
});
