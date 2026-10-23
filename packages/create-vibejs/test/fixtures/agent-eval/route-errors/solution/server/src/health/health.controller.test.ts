import { createClient } from '@usevibejs/contract';
import { JsonLogger } from '@usevibejs/server';
import { Test } from '@usevibejs/server/testing';
import { expect, it } from 'vitest';
import { health } from '../../../contracts/src/health.contract.ts';
import { AppModule, appOptions } from '../app.module.ts';

async function setup() {
  const app = await Test.createTestingModule({
    imports: [AppModule],
    ...appOptions,
    logger: new JsonLogger({ level: 'silent' }),
  }).compile();
  return { app, api: createClient({ health }, { baseUrl: '/api', fetch: app.fetch }).health };
}

it('answers GET /api/health with ok', async () => {
  const { app, api } = await setup();
  expect(await api.get()).toMatchObject({ ok: true, data: { status: 'ok' } });
  await app.close();
});

it('answers each known service with ok and others with UNKNOWN_SERVICE', async () => {
  const { app, api } = await setup();
  for (const service of ['api', 'db']) {
    expect(await api.service({ params: { service } })).toMatchObject({
      ok: true,
      data: { service, status: 'ok' },
    });
  }
  expect(await api.service({ params: { service: 'nope' } })).toMatchObject({
    ok: false,
    error: { code: 'UNKNOWN_SERVICE', status: 404 },
  });
  await app.close();
});
