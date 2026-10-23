import { createClient } from '@usevibejs/contract';
import { JsonLogger } from '@usevibejs/server';
import { Test } from '@usevibejs/server/testing';
import { expect, it } from 'vitest';
import { health } from '../../../contracts/src/health.contract.ts';
import { AppModule, appOptions } from '../app.module.ts';

it('answers GET /api/health with ok', async () => {
  const app = await Test.createTestingModule({
    imports: [AppModule],
    ...appOptions,
    logger: new JsonLogger({ level: 'silent' }),
  }).compile();
  const api = createClient({ health }, { baseUrl: '/api', fetch: app.fetch });
  expect(await api.health.get()).toMatchObject({ ok: true, data: { status: 'ok' } });
  await app.close();
});
