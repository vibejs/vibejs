/// <reference lib="dom" />
// @vitest-environment jsdom
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'tsdown';
import { afterAll, beforeAll, expect, it } from 'vitest';

const fixture = join(import.meta.dirname, '../test/fixtures/prod-counter/main.ts');
const generated = readFileSync(join(import.meta.dirname, 'errors.gen.ts'), 'utf8');
// Inside the package, so that the test runner can import the bundle.
const outDir = join(import.meta.dirname, '../node_modules/.cache/prod-counter');
let file: string;
let code: string;

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

/** The longest placeholder-free part of each VIBE5xxx catalog message. */
const sentences = [...generated.matchAll(/^ {2}VIBE5\d{3}: \["((?:[^"\\]|\\.)*)"/gm)].map(
  ([, message]) => message.split(/\{\w+\}/).reduce((a, b) => (b.length > a.length ? b : a)),
);

/**
 * The VIBE5xxx codes of the ui source that are only passed to `warn()`, which is dev only: a prod
 * bundle drops their `vibeError()` calls. Codes that are also thrown or logged stay.
 */
const warnOnly = (() => {
  const warned = new Set<string>();
  const other = new Set<string>();
  const files = readdirSync(import.meta.dirname, { recursive: true, encoding: 'utf8' });
  for (const name of files.filter((path) => /(?<!\.test(?:-d)?)\.ts$/.test(path))) {
    const text = readFileSync(join(import.meta.dirname, name), 'utf8');
    for (const [, prefix, id] of text.matchAll(/(warn\(\s*)?vibeError\(\s*'(VIBE5\d{3})'/g)) {
      (prefix ? warned : other).add(id);
    }
  }
  return [...warned].filter((id) => !other.has(id));
})();

beforeAll(async () => {
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
  [file] = readdirSync(outDir).filter((name) => name.endsWith('.js') || name.endsWith('.mjs'));
  code = readFileSync(join(outDir, file), 'utf8');
});

it('bundles the counter for prod without HMR code, dev messages or warn-only codes, and it still counts', async () => {
  expect(sentences.length).toBeGreaterThan(20);
  expect(sentences.every((text) => text.length >= 10)).toBe(true);
  expect(warnOnly.length).toBeGreaterThan(15);
  // The codes that the counter path throws or logs in prod.
  expect(warnOnly).not.toContain('VIBE5102');
  for (const text of [
    'createRecord',
    'rerender',
    '__hmrId',
    'at <',
    'location.reload',
    ...sentences,
    ...warnOnly,
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
});

// The counter measures about 10,182 B gzip. What remains is reachable from every app (root attribute
// fallthrough, deep `ref()` reactivity, JSON interpolation), so the C10 budget keeps a small margin above it.
it('bundles the counter for prod in at most 10.5 kB gzip (CONTRACTS C10)', () => {
  expect(gzipSync(code, { level: 9 }).length).toBeLessThanOrEqual(10_752);
});
