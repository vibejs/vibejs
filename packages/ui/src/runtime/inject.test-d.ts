// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages-private/dts-test/inject.test-d.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Edits: `expectType` became `expectTypeOf`; the vibe.js cases come first. Dropped, not in
// vibe.js: the Options API `provide` option of `defineComponent`.
import { expectTypeOf } from 'vitest';
import { ref, type Ref } from '../reactivity/ref.ts';
import type { App } from './app.ts';
import { hasInjectionContext, inject, provide, type InjectionKey } from './inject.ts';

declare const app: App;
const key: InjectionKey<Ref<number>> = Symbol();

// provide() checks the value of a typed key; other keys take any value.
provide(key, ref(1));
// @ts-expect-error the key provides a Ref<number>
provide(key, 'a');
provide('name', 'a');
provide(1, { any: true });
app.provide(key, ref(1));
// @ts-expect-error the key provides a Ref<number>
app.provide(key, 1);
expectTypeOf(app.provide('name', 1)).toEqualTypeOf<App>();

// inject(): undefined without a default; the default's type, or a factory's result.
expectTypeOf(inject(key)).toEqualTypeOf<Ref<number> | undefined>();
expectTypeOf(inject<string>('name')).toEqualTypeOf<string | undefined>();
expectTypeOf(inject(key, ref(0))).toEqualTypeOf<Ref<number>>();
expectTypeOf(inject('name', 'guest')).toEqualTypeOf<string>();
expectTypeOf(inject(key, () => ref(0), true)).toEqualTypeOf<Ref<number>>();
// @ts-expect-error the default must match the key
inject(key, 'a');
// @ts-expect-error a factory default needs treatDefaultAsFactory
inject(key, () => ref(0));
expectTypeOf(hasInjectionContext()).toEqualTypeOf<boolean>();

// Ported cases.
provide('foo', 123);
provide(123, 123);
const numberKey: InjectionKey<number> = Symbol();
provide(numberKey, 1);
// @ts-expect-error the key provides a number
provide(numberKey, 'foo');
// @ts-expect-error the key provides a number
provide(numberKey, null);
expectTypeOf(inject(numberKey)).toEqualTypeOf<number | undefined>();
expectTypeOf(inject(numberKey, 1)).toEqualTypeOf<number>();
expectTypeOf(inject(numberKey, () => 1, true)).toEqualTypeOf<number>();
expectTypeOf(inject('foo', () => 1)).toExtend<() => number>();
expectTypeOf(inject('foo', () => 1, false)).toExtend<() => number>();
expectTypeOf(inject('foo', () => 1, true)).toEqualTypeOf<number>();

// #8201
interface Cube {
  size: number;
}
const injectionKeyRef = Symbol('key') as InjectionKey<Ref<Cube>>;
// @ts-expect-error the ref holds a Cube
provide(injectionKeyRef, ref({}));
// an explicit type parameter
provide<Cube>('cube', { size: 123 });
provide<Cube>(123, { size: 123 });
provide<Cube>(injectionKeyRef, { size: 123 });
// @ts-expect-error size is a number
provide<Cube>('cube', { size: 'foo' });
// @ts-expect-error size is a number
provide<Cube>(123, { size: 'foo' });
// #10602
// @ts-expect-error the ref holds a Cube
app.provide(injectionKeyRef, ref({}));
