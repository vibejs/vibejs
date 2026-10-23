import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vibe } from '@usevibejs/compiler/vite';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { expect, it, onTestFinished } from 'vitest';

declare global {
  interface Window {
    marker?: boolean;
    btn?: Element | null;
  }
}

const fixture = fileURLToPath(new URL('../test/fixtures/vite-app', import.meta.url));
const tmp = fileURLToPath(new URL('../test/.tmp', import.meta.url));

it('a dev server keeps state on template and style edits and resets it on a script edit', async () => {
  mkdirSync(tmp, { recursive: true });
  const root = mkdtempSync(join(tmp, 'hmr-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fixture, root, { recursive: true });
  const app = join(root, 'src/App.vibe');
  // No file watcher: its change events for one file are at most one per 50 ms, and an edit inside
  // that window is dropped. Each edit reports its change, as the watcher would.
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [vibe()],
    server: { port: 0, watch: null },
  });
  const edit = (from: string, to: string) => {
    const source = readFileSync(app, 'utf8');
    expect(source).toContain(from);
    writeFileSync(app, source.replace(from, to));
    server.watcher.emit('change', app);
  };
  onTestFinished(() => server.close());
  await server.listen();
  const browser = await chromium.launch();
  onTestFinished(() => browser.close());
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  const button = page.locator('button');
  const text = () => button.textContent();

  await page.goto(server.resolvedUrls!.local[0]);
  await expect.poll(text).toBe('0');
  await page.evaluate(() => (window.marker = true));
  const marker = () => page.evaluate(() => window.marker);
  await button.click();
  await button.click();
  await expect.poll(text).toBe('2');

  // Template: rerendered in place, the count kept.
  edit('<button class="btn"', '<button class="btn edited"');
  await expect.poll(() => button.getAttribute('class')).toMatch(/\bedited\b/);
  expect(await text()).toBe('2');
  expect(await marker()).toBe(true);
  await button.click();
  await expect.poll(text).toBe('3');

  // Style: the CSS swapped, the same button node.
  await page.evaluate(() => (window.btn = document.querySelector('button')));
  const color = () => button.evaluate((b) => getComputedStyle(b).color);
  expect(await color()).toBe('rgb(102, 51, 153)');
  edit('color: rebeccapurple', 'color: rgb(0, 128, 0)');
  await expect.poll(color).toBe('rgb(0, 128, 0)');
  expect(
    await page.evaluate(
      () => window.btn!.isConnected && window.btn === document.querySelector('button'),
    ),
  ).toBe(true);
  expect(await text()).toBe('3');

  // Script: remounted with the new initial value, without a page reload.
  edit('ref(0)', 'ref(10)');
  // A remount re-imports the module, which can outlast the default 1 s poll on a CI runner.
  await expect.poll(text, { timeout: 10_000 }).toBe('10');
  expect(await marker()).toBe(true);

  expect(errors).toEqual([]);
}, 60_000);
