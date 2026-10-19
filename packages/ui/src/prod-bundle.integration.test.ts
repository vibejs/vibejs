/// <reference lib="dom" />
// @vitest-environment jsdom
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'tsdown';
import { afterAll, expect, it } from 'vitest';

const fixture = join(import.meta.dirname, '../test/fixtures/prod-counter/main.ts');
const generated = readFileSync(join(import.meta.dirname, 'errors.gen.ts'), 'utf8');
// Inside the package, so that the test runner can import the bundle.
const outDir = join(import.meta.dirname, '../node_modules/.cache/prod-counter');

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

/** The longest placeholder-free part of each VIBE5xxx catalog message. */
const sentences = [...generated.matchAll(/^ {2}VIBE5\d{3}: \["((?:[^"\\]|\\.)*)"/gm)].map(
  ([, message]) => message.split(/\{\w+\}/).reduce((a, b) => (b.length > a.length ? b : a)),
);

it('bundles the counter for prod in at most 7 kB gzip, without HMR code or dev messages, and it still counts', async () => {
  await build({
    config: false,
    entry: [fixture],
    outDir,
    platform: 'browser',
    minify: true,
    dts: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    deps: { alwaysBundle: [/.*/] },
  });
  const [file] = readdirSync(outDir).filter(
    (name) => name.endsWith('.js') || name.endsWith('.mjs'),
  );
  const code = readFileSync(join(outDir, file), 'utf8');
  expect(sentences.length).toBeGreaterThan(20);
  expect(sentences.every((text) => text.length >= 10)).toBe(true);
  for (const text of [
    'createRecord',
    'rerender',
    '__hmrId',
    'at <',
    'location.reload',
    ...sentences,
  ]) {
    expect(code).not.toContain(text);
  }

  document.body.innerHTML = '<div id="app"></div>';
  await import(pathToFileURL(join(outDir, file)).href);
  const button = document.querySelector('button')!;
  expect(button.textContent).toBe('0');
  button.click();
  button.click();
  await new Promise((resolve) => setTimeout(resolve));
  expect(button.textContent).toBe('2');
  // The size budget (CONTRACTS C10): 7 kB gzip. Checked last so the content and behavior checks above always run.
  const gzip = gzipSync(code, { level: 9 }).length;
  expect(gzip).toBeLessThanOrEqual(7168);
});
