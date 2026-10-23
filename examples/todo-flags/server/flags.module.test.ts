// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { createClient } from '@usevibejs/contract';
import { JsonLogger, Module } from '@usevibejs/server';
import { Test } from '@usevibejs/server/testing';
import { expect, it } from 'vitest';
import { flags } from '../contract/flags.contract.ts';
import { FLAGS_OPTIONS, FlagsModule } from './flags.module.ts';

it('serves the flags it was configured with', async () => {
  @Module({ imports: [FlagsModule.forRoot({ flags: { beta: true } })] })
  class AppModule {}
  const app = await Test.createTestingModule({
    imports: [AppModule],
    basePath: '/api',
    logger: new JsonLogger({ level: 'silent' }),
  }).compile();
  const api = createClient({ flags }, { baseUrl: '/api', fetch: app.fetch });
  expect(await api.flags.list()).toMatchObject({ ok: true, data: { beta: true } });
  expect(app.get(FLAGS_OPTIONS)).toEqual({ flags: { beta: true } });
  await app.close();
});
