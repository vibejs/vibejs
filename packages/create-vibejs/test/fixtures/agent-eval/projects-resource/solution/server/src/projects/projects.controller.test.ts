import { createClient } from '@vibejs-org/contract';
import { JsonLogger } from '@vibejs-org/server';
import { Test } from '@vibejs-org/server/testing';
import { expect, it } from 'vitest';
import { projects } from '../../../contracts/src/projects.contract.ts';
import { AppModule, appOptions } from '../app.module.ts';

it('creates and lists projects', async () => {
  const app = await Test.createTestingModule({
    imports: [AppModule],
    ...appOptions,
    logger: new JsonLogger({ level: 'silent' }),
  }).compile();
  const api = createClient({ projects }, { baseUrl: '/api', fetch: app.fetch }).projects;
  const created = await api.create({ body: { name: 'First' } });
  expect(created).toMatchObject({ ok: true, data: { name: 'First' } });
  expect(await api.list()).toMatchObject({ ok: true, data: [{ name: 'First' }] });
  await app.close();
});
