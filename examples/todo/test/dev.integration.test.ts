import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { afterAll, expect, it, vi } from 'vitest';
import { copyApp, edit, env, vibejsArgs } from './app.ts';

declare global {
  interface Window {
    marker?: boolean;
  }
}

type Event = { event: string; url?: string; pid?: number; ms?: number; ok?: boolean };

const root = copyApp();
const child = spawn(process.execPath, vibejsArgs('dev', '--json'), { cwd: root, env });
afterAll(() => void child.kill('SIGKILL'));
const events: { at: number; e: Event }[] = [];
let buffer = '';
child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
  const lines = (buffer + chunk).split('\n');
  buffer = lines.pop()!;
  for (const line of lines) events.push({ at: performance.now(), e: JSON.parse(line) });
});

async function ready(): Promise<{ url: string; pid: number }> {
  await vi.waitFor(() => expect(events.map((x) => x.e.event)).toContain('ready'), {
    timeout: 30_000,
    interval: 50,
  });
  const { url, pid } = events.find((x) => x.e.event === 'ready')!.e;
  return { url: url!, pid: pid! };
}

it('serves the UI and the API on one port and is reused by a second dev', async () => {
  const { url, pid } = await ready();
  const html = await fetch(url);
  expect(html.status).toBe(200);
  expect(await html.text()).toContain('<div id="app"></div>');
  expect((await fetch(`${url}api/health`)).status).toBe(200);
  const todos = await fetch(`${url}api/todos`);
  expect(todos.status).toBe(200);
  expect(await todos.json()).toEqual([]);
  expect(await (await fetch(`${url}api/flags`)).json()).toEqual({ removeDone: true });

  const second = spawnSync(process.execPath, vibejsArgs('dev', '--json'), {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  expect(JSON.parse(second.stdout.split('\n')[0])).toEqual(
    expect.objectContaining({ event: 'ready', url, pid, reused: true }),
  );
  expect(second.status).toBe(0);
}, 60_000);

it('keeps state across a template edit and a backend restart, then routes and loads data', async () => {
  const { url } = await ready();
  const browser = await chromium.launch();
  afterAll(() => browser.close());
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const heading = page.locator('section h1');
  const items = page.locator('li');
  const input = page.locator('input[placeholder]');
  const marker = () => page.evaluate(() => window.marker);

  await page.goto(url);
  await expect.poll(() => heading.textContent()).toBe('Todos');
  await input.fill('first');
  await page.locator('form button').click();
  await expect.poll(() => items.allTextContents()).toEqual(['first']);
  await input.fill('typed');
  await page.evaluate(() => (window.marker = true));

  // A template edit rerenders in place: the list, the typed value and the page are kept.
  edit(root, 'ui/src/pages/TodosPage.vibe', '<h1>Todos</h1>', '<h1>My todos</h1>');
  await expect.poll(() => heading.textContent(), { timeout: 10_000 }).toBe('My todos');
  expect(await items.allTextContents()).toEqual(['first']);
  expect(await input.inputValue()).toBe('typed');
  expect(await marker()).toBe(true);

  // A server edit restarts the backend in under a second; Vite and the page stay.
  const edited = performance.now();
  const before = events.length;
  edit(root, 'server/src/todos/todos.service.ts', 'Removes the todo;', 'Deletes the todo;');
  await vi.waitFor(() => expect(events.slice(before).map((x) => x.e.event)).toContain('restart'), {
    timeout: 10_000,
    interval: 20,
  });
  const restart = events.slice(before).find((x) => x.e.event === 'restart')!;
  expect(restart.e.ok).toBe(true);
  expect(restart.at - edited).toBeLessThan(1000);
  expect((await fetch(`${url}api/todos`)).status).toBe(200);
  expect(await marker()).toBe(true);

  // The restarted backend starts empty; a new todo links to its page, loaded with useAsync.
  await input.fill('second');
  await page.locator('form button').click();
  await expect.poll(() => items.allTextContents()).toEqual(['second']);
  await expect.poll(() => page.locator('.remove-done').isVisible()).toBe(true);
  await page.locator('li a').click();
  await expect.poll(() => page.locator('main h1').textContent()).toBe('second');
  expect(page.url()).toMatch(/\/todos\/[\w-]+$/);
  expect(await marker()).toBe(true);

  await page.goto(`${url}todos/missing`);
  await expect.poll(() => page.locator('.error').textContent()).toBe('TODO_NOT_FOUND');
  expect(errors).toEqual([]);
}, 120_000);
