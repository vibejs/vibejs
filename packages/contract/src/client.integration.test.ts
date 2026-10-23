import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../test/fixtures/ui-bundle', import.meta.url));
const generated = readFileSync(join(import.meta.dirname, 'errors.gen.ts'), 'utf8');

/** The longest placeholder- and quote-free part of each catalog message and fix. */
const sentences = [...generated.matchAll(/^ {2}VIBE9\d{3}: (\[.*\]),$/gm)].flatMap(([, row]) =>
  [...row.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(([, text]) =>
    text.split(/\{\w+\}|\\"|`/).reduce((a, b) => (b.length > a.length ? b : a)),
  ),
);

it('bundles createClient for the browser from dist without server, node modules or catalog text', async () => {
  const output = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    // What `vite build` defines; under Vitest, NODE_ENV is 'test'.
    define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, rolldownOptions: { input: `${root}/main.ts` } },
  });
  if (!('output' in output)) throw new Error('Expected a single build output.');
  const chunks = output.output.filter((item) => item.type === 'chunk');
  const ids = chunks.flatMap((chunk) => chunk.moduleIds);
  expect(ids).toContainEqual(expect.stringMatching(/\/packages\/contract\/dist\/index\.js$/));
  expect(
    // Vite replaces a Node builtin with the id __vite-browser-external in a browser build.
    ids.filter((id) =>
      /@usevibejs\/server|\/packages\/server\/|srvx|^node:|__vite-browser-external/.test(id),
    ),
  ).toEqual([]);
  const code = chunks.map((chunk) => chunk.code).join('\n');
  expect(code).not.toMatch(/["']node:/);
  expect(sentences.length).toBeGreaterThanOrEqual(5);
  expect(sentences.every((text) => text.length >= 10)).toBe(true);
  for (const text of sentences) expect(code).not.toContain(text);
  // The error factory itself stays: the client still throws VIBE9091.
  expect(code).toContain('VIBE9091');
});
