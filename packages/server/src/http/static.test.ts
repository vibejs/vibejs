// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { defineContract, get } from '@usevibejs/contract';
import { isVibeError } from '@usevibejs/errors';
import * as v from 'valibot';
import { afterEach, describe, expect, it } from 'vitest';
import { captureLog } from '../../test/log.ts';
import { Controller, Handle, Module } from '../module/decorators.ts';
import type { OnModuleInit } from '../module/lifecycle.ts';
import { inspect, VibeFactory } from './app.ts';
import {
  errnoCode,
  isMissingPath,
  isStaticPath,
  mediaType,
  openStatic,
  serveStatic,
  staysInside,
} from './static.ts';

const health = defineContract('/health', {
  get: get('/', { response: v.object({ status: v.literal('ok') }) }),
});

@Controller(health)
class HealthController {
  @Handle(health.get)
  get(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

const started: string[] = [];

@Module({ controllers: [HealthController] })
class AppModule implements OnModuleInit {
  onModuleInit(): void {
    started.push('init');
  }
}

const dirs: string[] = [];
afterEach(async () => {
  started.length = 0;
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vibe-static-'));
  dirs.push(dir);
  return dir;
}

async function create(root: string, spa?: boolean, basePath = '/api') {
  const { lines, logger } = captureLog('debug');
  const created = await VibeFactory.create(AppModule, {
    logger,
    basePath,
    static: { root, ...(spa !== undefined && { spa }) },
  });
  return { app: created, lines };
}

describe('path checks', () => {
  it('reads a string code from an error object', () => {
    expect(errnoCode(1)).toBeUndefined();
    expect(errnoCode(null)).toBeUndefined();
    expect(errnoCode({})).toBeUndefined();
    expect(errnoCode({ code: 1 })).toBeUndefined();
    expect(errnoCode({ code: 'ENOENT' })).toBe('ENOENT');
    expect(isMissingPath(Object.assign(new Error('missing'), { code: 'ENOENT' }))).toBe(true);
    expect(isMissingPath(Object.assign(new Error('through a file'), { code: 'ENOTDIR' }))).toBe(
      true,
    );
    expect(isMissingPath(Object.assign(new Error('loop'), { code: 'ELOOP' }))).toBe(false);
  });

  it('serves only paths outside a non-empty base path', () => {
    expect(isStaticPath('/users', '')).toBe(false);
    expect(isStaticPath('/api', '/api')).toBe(false);
    expect(isStaticPath('/api/health', '/api')).toBe(false);
    expect(isStaticPath('/apples', '/api')).toBe(true);
    expect(isStaticPath('/', '/api')).toBe(true);
  });

  it('accepts a relative path inside the root and rejects an escape', () => {
    expect(staysInside('')).toBe(true);
    expect(staysInside('assets/app.js')).toBe(true);
    expect(staysInside('..')).toBe(false);
    expect(staysInside('../secret')).toBe(false);
    expect(staysInside('..\\secret')).toBe(false);
    expect(staysInside('/etc/passwd')).toBe(false);
    expect(staysInside('\\server\\share')).toBe(false);
    expect(staysInside('C:/Windows')).toBe(false);
    expect(staysInside('D:\\secret')).toBe(false);
  });

  it('maps extensions and falls back for an unknown or missing one', () => {
    expect(mediaType('app.JS')).toBe('text/javascript; charset=utf-8');
    expect(mediaType(join('dist', 'index.html'))).toBe('text/html; charset=utf-8');
    expect(mediaType(join('dist', 'app.css'))).toBe('text/css; charset=utf-8');
    expect(mediaType(join('dist', 'readme'))).toBe('application/octet-stream');
    expect(mediaType(join('dist', '.htaccess'))).toBe('application/octet-stream');
    expect(mediaType(join('dist', 'app.wasm'))).toBe('application/wasm');
  });
});

describe('openStatic', () => {
  it('resolves a relative directory and remembers spa', async () => {
    const dir = await temp();
    const opened = await openStatic({ root: relative(process.cwd(), dir), spa: true });
    expect(opened.spa).toBe(true);
    expect(opened.root).toBe(await realpath(dir));
    expect((await openStatic({ root: dir })).spa).toBe(false);
  });

  it('throws VIBE9406 when the root is missing and does not start the app', async () => {
    const dir = await temp();
    const root = join(dir, 'missing');
    const error = await openStatic({ root }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(isVibeError(error, 'VIBE9406')).toBe(true);
    expect(error).toMatchObject({ args: { root }, cause: { code: 'ENOENT' } });
    await expect(
      VibeFactory.create(AppModule, { static: { root }, logger: captureLog().logger }),
    ).rejects.toMatchObject({ code: 'VIBE9406' });
    expect(started).toEqual([]);
    expect(() => inspect(AppModule, { static: { root } })).not.toThrow();
  });

  it('throws VIBE9407 when the root is a file', async () => {
    const dir = await temp();
    const root = join(dir, 'file.txt');
    await writeFile(root, 'x');
    await expect(openStatic({ root })).rejects.toMatchObject({ code: 'VIBE9407', args: { root } });
  });

  it('rethrows a filesystem error that is not a missing path', async () => {
    const dir = await temp();
    const root = join(dir, 'loop');
    await symlink(root, root);
    await expect(openStatic({ root })).rejects.toMatchObject({ code: 'ELOOP' });
  });
});

describe('serveStatic', () => {
  it('returns undefined for a bad percent escape', async () => {
    const dir = await temp();
    const root = await openStatic({ root: dir });
    expect(await serveStatic(root, '%')).toBeUndefined();
  });

  it('serves a file, a directory index and an SPA fallback, on fetch and listen', async () => {
    const dir = await temp();
    await writeFile(join(dir, 'index.html'), '<div id="app"></div>');
    await writeFile(join(dir, 'app.JS'), 'console.log(1)');
    await writeFile(join(dir, 'plain'), 'raw');
    await mkdir(join(dir, 'docs'));
    await writeFile(join(dir, 'docs/index.html'), 'docs');
    await symlink(join(dir, 'index.html'), join(dir, 'home.html'));
    const { app, lines } = await create(dir, true);

    const page = await app.request('/');
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('x-request-id')).not.toBeNull();
    expect(await page.text()).toBe('<div id="app"></div>');
    expect(await (await app.request('/index.html?x=1')).text()).toBe('<div id="app"></div>');
    expect(await (await app.request('/app.JS')).text()).toBe('console.log(1)');
    expect((await app.request('/plain')).headers.get('content-type')).toBe(
      'application/octet-stream',
    );
    expect(await (await app.request('/docs')).text()).toBe('docs');
    expect(await (await app.request('/docs/')).text()).toBe('docs');
    expect(await (await app.request('/home.html')).text()).toBe('<div id="app"></div>');
    expect(await (await app.request('/users/1')).text()).toBe('<div id="app"></div>');

    const api = await app.request('/api/health');
    expect(await api.json()).toEqual({ status: 'ok' });
    const apiFile = await app.request('/api');
    expect(apiFile.status).toBe(404);
    expect(await app.request('/', { method: 'POST' })).toMatchObject({ status: 404 });

    const { url } = await app.listen(0, '127.0.0.1');
    const live = await fetch(new URL('/', url));
    expect(live.status).toBe(200);
    expect(await live.text()).toBe('<div id="app"></div>');
    await app.close();
    expect(lines.some((line) => line.msg === 'listening')).toBe(true);
  });

  it('falls through when the file and the SPA index are missing', async () => {
    const dir = await temp();
    await mkdir(join(dir, 'index.html'));
    const { app } = await create(dir, true);
    expect((await app.request('/missing')).status).toBe(404);
    expect((await app.request('/index.html')).status).toBe(404);
    expect((await app.request('/')).status).toBe(404);
  });

  it('does not fall back when spa is off, and skips static for an empty base path', async () => {
    const dir = await temp();
    await writeFile(join(dir, 'index.html'), 'home');
    await writeFile(join(dir, 'plain.txt'), 'plain');
    const off = await create(dir, false);
    expect(await (await off.app.request('/plain.txt')).text()).toBe('plain');
    expect((await off.app.request('/missing')).status).toBe(404);
    await off.app.close();

    const rootApi = await create(dir, true, '');
    expect((await rootApi.app.request('/plain.txt')).status).toBe(404);
    await rootApi.app.close();
  });

  it('rejects a null byte, a .. segment and a link that leaves the root with VIBE9408', async () => {
    const dir = await temp();
    const outside = await temp();
    await writeFile(join(outside, 'secret.txt'), 'secret');
    await symlink(join(outside, 'secret.txt'), join(dir, 'secret.txt'));
    await symlink(outside, join(dir, 'linked'));
    await writeFile(join(dir, 'file.txt'), 'x');
    await symlink(join(dir, 'loop'), join(dir, 'loop'));
    const { app, lines } = await create(dir, true);

    const encoded = await app.fetch(new Request('http://localhost/foo%5c..%5csecret'));
    expect(encoded.status).toBe(500);
    expect(await encoded.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
    const nul = await app.fetch(new Request('http://localhost/%00'));
    expect(nul.status).toBe(500);
    const link = await app.request('/secret.txt');
    expect(link.status).toBe(500);
    const linked = await app.request('/linked/secret.txt');
    expect(linked.status).toBe(500);
    expect((await app.request('/file.txt/extra')).status).toBe(404);
    const loop = await app.request('/loop');
    expect(loop.status).toBe(500);

    expect(lines.filter((line) => line.code === 'VIBE9408').length).toBeGreaterThanOrEqual(4);
    expect(lines.some((line) => line.code === 'VIBE9503')).toBe(true);
    expect(lines.find((line) => line.code === 'VIBE9408')?.msg).toContain(
      'escapes the static root',
    );
  });
});
