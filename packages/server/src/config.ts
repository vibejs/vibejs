import type { StandardSchemaV1 } from '@standard-schema/spec';
import { vibeError } from './errors.gen.ts';

/**
 * A config class: its constructor validates each key of `schema` against the environment
 * variable of the same name and freezes the result. It throws VIBE9601 with every failing key.
 */
export function defineConfig<const S extends Record<string, StandardSchemaV1>>(
  schema: S,
): new () => { readonly [K in keyof S]: StandardSchemaV1.InferOutput<S[K]> } {
  // oxlint-disable-next-line typescript/no-extraneous-class -- the class is the provider and DI token
  class Config {
    constructor() {
      const env = (globalThis.process as NodeJS.Process | undefined)?.env;
      const issues: string[] = [];
      for (const [key, field] of Object.entries(schema)) {
        const raw = env?.[key];
        const result = field['~standard'].validate(raw);
        if (result instanceof Promise) throw vibeError('VIBE9602', { key });
        if (result.issues) {
          // Schema messages may quote the received value; a config value can be a secret.
          const hide = (text: string) => (raw ? text.replaceAll(raw, '<value>') : text);
          issues.push(`${key}: ${result.issues.map((issue) => hide(issue.message)).join(', ')}`);
        } else {
          Reflect.set(this, key, result.value);
        }
      }
      if (issues.length > 0) throw vibeError('VIBE9601', { issues: issues.join('; ') });
      Object.freeze(this);
    }
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the constructor sets every key of the schema to its output
  return Config as new () => { readonly [K in keyof S]: StandardSchemaV1.InferOutput<S[K]> };
}
