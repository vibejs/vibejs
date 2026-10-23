// A user test that fails after mounting: its error must end with the rendered HTML.
import type { Component } from '@usevibejs/ui';
import { template } from '@usevibejs/ui/internal';
import { mount } from '@usevibejs/ui/testing';
import { expect, it } from 'vitest';

const t0 = template('<p class="banner">Hello fixture</p>');
const Banner: Component = { name: 'Banner', render: () => t0() };

it('fails with the rendered HTML', () => {
  expect(mount(Banner).text()).toBe('Goodbye');
});
