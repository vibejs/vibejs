import { createClient } from '@usevibejs/contract';
import { inspect, JsonLogger } from '@usevibejs/server';
import { Test } from '@usevibejs/server/testing';
import { expect, it } from 'vitest';
import { health } from '../../contracts/src/health.contract.ts';
import { AppModule, appOptions } from './app.module.ts';

it('describes the routes and modules without constructing anything', () => {
  expect(inspect(AppModule, appOptions)).toMatchSnapshot();
});

it('answers the health check', async () => {
  const app = await Test.createTestingModule({
    imports: [AppModule],
    ...appOptions,
    logger: new JsonLogger({ level: 'silent' }),
  }).compile();
  const api = createClient({ health }, { baseUrl: '/api', fetch: app.fetch });
  expect(await api.health.check()).toMatchObject({ ok: true, data: { status: 'ok' } });
  await app.close();
});
