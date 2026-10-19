import { isVibeError } from '@vibejs-org/errors';
import * as v from 'valibot';
import { describe, expect, it, vi } from 'vitest';
import { caught } from '../test/log.ts';
import { defineConfig } from './config.ts';

const AppConfig = defineConfig({
  PORT: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(1)),
  DATABASE_URL: v.pipe(v.string(), v.url()),
  APP_MODE: v.optional(v.picklist(['dev', 'prod']), 'dev'),
});

describe('defineConfig', () => {
  it('validates the environment into a frozen instance', () => {
    vi.stubEnv('PORT', '8080');
    vi.stubEnv('DATABASE_URL', 'postgres://db/app');
    const config = new AppConfig();
    expect({ ...config }).toEqual({
      PORT: 8080,
      DATABASE_URL: 'postgres://db/app',
      APP_MODE: 'dev',
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('throws VIBE9601 with every failing key and none of the values', async () => {
    vi.stubEnv('PORT', '0');
    vi.stubEnv('DATABASE_URL', 'secret-token-value');
    vi.stubEnv('APP_MODE', 'hidden-mode');
    const error = await caught(() => new AppConfig());
    if (!isVibeError(error, 'VIBE9601')) throw new Error('expected VIBE9601');
    const { args, message } = error;
    expect(args.issues).toMatchInlineSnapshot(
      `"PORT: Invalid value: Expected >=1 but received <value>; DATABASE_URL: Invalid URL: Received "<value>"; APP_MODE: Invalid type: Expected ("dev" | "prod") but received "<value>""`,
    );
    for (const value of ['secret-token-value', 'hidden-mode']) expect(message).not.toContain(value);
  });

  it('reports a missing variable', () => {
    vi.stubEnv('PORT', undefined);
    vi.stubEnv('DATABASE_URL', 'https://db.test');
    expect(() => new AppConfig()).toThrow(
      expect.objectContaining({
        code: 'VIBE9601',
        args: { issues: expect.stringMatching(/^PORT: /) },
      }),
    );
  });

  it('reads undefined for every key without process', () => {
    const Config = defineConfig({ NAME: v.optional(v.string(), 'app') });
    vi.stubGlobal('process', undefined);
    const config = new Config();
    vi.unstubAllGlobals();
    expect(config.NAME).toBe('app');
  });

  it('throws VIBE9602 for an asynchronous schema', () => {
    const Config = defineConfig({
      TOKEN: v.pipeAsync(
        v.string(),
        v.checkAsync(async () => true),
      ),
    });
    vi.stubEnv('TOKEN', 'x');
    expect(() => new Config()).toThrow(
      expect.objectContaining({ code: 'VIBE9602', args: { key: 'TOKEN' } }),
    );
  });
});
