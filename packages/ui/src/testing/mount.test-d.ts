// The mount() types: props required with required props, typed events and slot props.
import { expectTypeOf } from 'vitest';
import { Anonymous, Greeting } from '../../test/testing/components.ts';
import type { InjectionKey } from '../runtime/inject.ts';
import { mount, mountComposable } from './mount.ts';

// Props are required exactly when the component has a required prop.
mount(Anonymous);
mount(Anonymous, { attachTo: 'body' });
mount(Greeting, { props: { name: 'Ada' } });
// @ts-expect-error -- `name` is required
mount(Greeting);
// @ts-expect-error -- `props` is required
mount(Greeting, {});
// @ts-expect-error -- `name` is a string
mount(Greeting, { props: { name: 1 } });
// @ts-expect-error -- `size` is not a prop
mount(Greeting, { props: { name: 'Ada', size: 1 } });

const wrapper = mount(Greeting, {
  props: { name: 'Ada', onPick: (id) => expectTypeOf(id).toBeString() },
});
expectTypeOf(wrapper.emitted('pick')).toEqualTypeOf<[id: string][] | undefined>();
expectTypeOf(wrapper.emitted('pick-item')).toEqualTypeOf<
  [id: string, index: number][] | undefined
>();
expectTypeOf(wrapper.emitted()).toEqualTypeOf<Partial<Record<'pick' | 'pick-item', unknown[][]>>>();
// @ts-expect-error -- `close` is not an event
wrapper.emitted('close');
void wrapper.setProps({ count: 2 });
// @ts-expect-error -- `count` is a number
void wrapper.setProps({ count: '2' });
// @ts-expect-error -- a component wrapper has no setValue
void wrapper.setValue('x');

// Slot functions receive the slot props.
mount(Greeting, {
  props: { name: 'Ada' },
  slots: { default: (props) => String(expectTypeOf(props).toEqualTypeOf<{ count: number }>()) },
});
// @ts-expect-error -- `header` is not a slot
mount(Greeting, { props: { name: 'Ada' }, slots: { header: 'x' } });
// @ts-expect-error -- a slot function returns text or nodes
mount(Greeting, { props: { name: 'Ada' }, slots: { default: () => 1 } });

expectTypeOf(mountComposable(() => 1).result).toBeNumber();
// @ts-expect-error -- mountComposable takes only provide and plugins
mountComposable(() => 1, { attachTo: 'body' });

// An InjectionKey is a computed key of `provide`, with no cast.
declare const api: InjectionKey<{ list(): string[] }>;
mount(Anonymous, { provide: { [api]: { list: () => [] } } });
mountComposable(() => 1, { provide: { [api]: { list: () => [] } } });
