// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages-private/dts-test/appUse.test-d.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Edits: the ported cases follow the vibe.js cases; `Plugin<Options>` takes an options tuple
// (`Plugin<[options: PluginOptions]>`). Dropped, not in vibe.js: the `app.component()` case
// (VIBE5301).
import { expectTypeOf } from 'vitest';
import { createApp, type App, type Plugin } from './app.ts';

declare const app: App;

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

// Ported cases.
// A plugin without types accepts anything.
const untyped: Plugin = { install() {} };
app.use(untyped);
app.use(untyped, 2);
app.use(untyped, { anything: 'goes' }, true);

interface PluginOptions {
  option1?: string;
  option2: number;
  option3: boolean;
}
const objectPlugin = { install: (_app: App, _options: PluginOptions) => {} };
const optionalObjectPlugin = { install: (_app: App, _options?: PluginOptions) => {} };
app.use(optionalObjectPlugin);
app.use(optionalObjectPlugin, { option1: 'foo', option2: 1, option3: true });

// @ts-expect-error the options are required
app.use(objectPlugin);
// @ts-expect-error option2 and option3 are required
app.use(objectPlugin, {});
// @ts-expect-error the options are not optional
app.use(objectPlugin, undefined);
app.use(objectPlugin, { option2: 1, option3: true });
// @ts-expect-error the options are required
app.use(objectPlugin.install);
// @ts-expect-error option2 and option3 are required
app.use(objectPlugin.install, {});
app.use(objectPlugin.install, { option1: 'foo', option2: 1, option3: true });

const noOptions = { install: (_app: App) => {} };
app.use(noOptions);
// @ts-expect-error the plugin takes no options
app.use(noOptions, {});
// @ts-expect-error the plugin takes no options
app.use(noOptions.install, undefined);

const multipleArgs = { install: (_app: App, _a: string, _b: number) => {} };
// @ts-expect-error two options are expected
app.use(multipleArgs, 'hey');
app.use(multipleArgs, 'hey', 2);
app.use(multipleArgs.install, 'hey', 2);

const defaultOptions = {
  install: (_app: App, options: PluginOptions = { option2: 2, option3: true }) => {
    expectTypeOf(options).toEqualTypeOf<PluginOptions>();
  },
};
app.use(defaultOptions);
app.use(defaultOptions, undefined);
// @ts-expect-error option2 and option3 are required
app.use(defaultOptions, {});
app.use(defaultOptions, { option2: 1, option3: true });

const typed: Plugin<[options: PluginOptions]> = (_app, options) => {
  expectTypeOf(options).toEqualTypeOf<PluginOptions>();
};
// @ts-expect-error the options are required
app.use(typed);
app.use(typed, { option1: '', option2: 2, option3: true });
const optionalTyped: Plugin<[options?: PluginOptions]> = () => {};
app.use(optionalTyped);
app.use(optionalTyped, { option2: 2, option3: true });
