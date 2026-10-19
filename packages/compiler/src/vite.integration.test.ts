import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { vibe } from '@vibejs-org/compiler/vite';
import { build } from 'vite';
import { expect, it, vi } from 'vitest';

const app = fileURLToPath(new URL('../test/fixtures/vite-app', import.meta.url));

it('the built ./vite entry builds the fixture app', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const result = await build({
    root: app,
    configFile: false,
    logLevel: 'silent',
    build: { write: false },
    plugins: [vibe()],
  });
  if (!('output' in result)) throw new Error('Expected a single build output.');
  const { output } = result;
  const css = output.flatMap((f) => (f.type === 'asset' ? [String(f.source)] : [])).join('\n');
  expect(css).toMatch(/\.btn\[data-vb-[0-9a-f]{8}\]/);
});

it('the built . entry does not import vite', () => {
  const index = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8');
  expect(index).not.toMatch(/from\s*["']vite["']/);
});
