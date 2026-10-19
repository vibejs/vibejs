import * as v from 'valibot';
import { expectTypeOf } from 'vitest';
import { defineConfig } from './config.ts';

const AppConfig = defineConfig({
  PORT: v.pipe(v.string(), v.transform(Number)),
  NAME: v.optional(v.string(), 'app'),
});
const config = new AppConfig();
expectTypeOf(config).toEqualTypeOf<{ readonly PORT: number; readonly NAME: string }>();
// @ts-expect-error -- config values are read-only
config.PORT = 1;
