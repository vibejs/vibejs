import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../test/fixtures/ui-bundle', import.meta.url));

it('bundles createClient for the browser from dist without server or node modules', async () => {
  const output = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    build: { write: false, rolldownOptions: { input: `${root}/main.ts` } },
  });
  if (!('output' in output)) throw new Error('Expected a single build output.');
  const chunks = output.output.filter((item) => item.type === 'chunk');
  const ids = chunks.flatMap((chunk) => chunk.moduleIds);
  expect(ids).toContainEqual(expect.stringMatching(/\/packages\/contract\/dist\/index\.js$/));
  expect(
    ids.filter((id) => /@vibejs-org\/server|\/packages\/server\/|srvx|^node:/.test(id)),
  ).toEqual([]);
  expect(chunks.map((chunk) => chunk.code).join('\n')).not.toMatch(/["']node:/);
});
