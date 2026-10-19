import { expectTypeOf } from 'vitest';
import type { TemplateRef } from '../component.ts';
import { ref, type Ref } from '../reactivity/ref.ts';
import { createApp, type App, type Plugin } from './app.ts';
import { inject, provide, type InjectionKey } from './inject.ts';
import { useTemplateRef } from './templateRef.ts';

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

// useTemplateRef(): a readonly shallow ref, null until rendered.
const input = useTemplateRef<HTMLInputElement>('input');
expectTypeOf(input).toEqualTypeOf<TemplateRef<HTMLInputElement>>();
expectTypeOf(input.value).toEqualTypeOf<HTMLInputElement | null>();
// @ts-expect-error a template ref is readonly
input.value = null;
expectTypeOf(useTemplateRef('x').value).toEqualTypeOf<unknown>();

// app.use() infers the options from the plugin.
const withOptions: Plugin<[base: string, retries?: number]> = (a, base, retries) => {
  expectTypeOf(a).toEqualTypeOf<App>();
  expectTypeOf(base).toEqualTypeOf<string>();
  expectTypeOf(retries).toEqualTypeOf<number | undefined>();
};
const object = { install: (_a: App, _options: { debug: boolean }) => {} };
app.use(withOptions, '/api');
app.use(withOptions, '/api', 3);
// @ts-expect-error the base option is required
app.use(withOptions);
// @ts-expect-error retries is a number
app.use(withOptions, '/api', '3');
app.use(object, { debug: true });
// @ts-expect-error debug is a boolean
app.use(object, { debug: 1 });
app.use((a: App) => a.onUnmount(() => {}));
expectTypeOf(app.use(object, { debug: true })).toEqualTypeOf<App>();

// Unsupported APIs exist only to throw.
// @ts-expect-error the unsupported APIs take no arguments
app.component('Name', {});
expectTypeOf(createApp({ render: () => [] })).toEqualTypeOf<App>();
