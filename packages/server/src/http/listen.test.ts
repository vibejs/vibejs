// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { defineContract, get } from '@vibejs-org/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLog } from '../../test/log.ts';
import { Controller, Handle, Module } from '../module/decorators.ts';
import type { OnApplicationShutdown, OnModuleDestroy } from '../module/lifecycle.ts';
import { VibeFactory } from './app.ts';
import type { Ctx } from './context.ts';

const api = defineContract('/api', {
  hello: get('/hello', { response: { kind: 'raw', contentType: 'text/plain' } }),
  slow: get('/slow'),
});

let log: string[] = [];
let release: () => void = () => {};
let fail = false;

@Controller(api)
class ApiController implements OnModuleDestroy {
  @Handle(api.hello)
  hello(ctx: Ctx<typeof api.hello>): Response {
    return new Response(`hello ${String(ctx.ip !== undefined)}`);
  }
  @Handle(api.slow)
  async slow(): Promise<void> {
    log.push('slow start');
    await new Promise<void>((resolve) => (release = resolve));
    log.push('slow end');
  }
  onModuleDestroy(): void {
    log.push('onModuleDestroy');
    if (fail) throw new Error('destroy failed');
  }
}

@Module({ controllers: [ApiController] })
class AppModule implements OnApplicationShutdown {
  onApplicationShutdown(signal?: string): void {
    log.push(`onApplicationShutdown(${String(signal)})`);
  }
}

async function create(shutdownTimeout?: number) {
  log = [];
  fail = false;
  const { lines, logger } = captureLog();
  const app = await VibeFactory.create(AppModule, { logger, shutdownTimeout });
  return { app, lines };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('listen', () => {
  it('serves real requests over loopback and logs listening', async () => {
    const { app, lines } = await create();
    const { url } = await app.listen(0, '127.0.0.1');
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(lines).toContainEqual(expect.objectContaining({ level: 'info', msg: 'listening', url }));
    const res = await fetch(new URL('api/hello', url));
    expect(await res.text()).toBe('hello true');
    expect(res.headers.get('x-request-id')).not.toBeNull();
    await expect(app.listen(0)).rejects.toMatchObject({ code: 'VIBE9403', args: { url } });
    await app.close();
    await expect(fetch(new URL('api/hello', url))).rejects.toThrow('fetch failed');
  });

  it('throws VIBE9403 after close started', async () => {
    const { app } = await create();
    void app.close();
    await expect(app.listen(0)).rejects.toMatchObject({ code: 'VIBE9403', args: { url: 'none' } });
  });

  it('throws VIBE9403 and serves nothing when close starts while srvx loads', async () => {
    const { app } = await create();
    const listening = app.listen(0, '127.0.0.1');
    await app.close();
    await expect(listening).rejects.toMatchObject({ code: 'VIBE9403', args: { url: 'none' } });
  });

  it('can listen again after a failed listen', async () => {
    const first = await create();
    const { url } = await first.app.listen(0, '127.0.0.1');
    const { app } = await create();
    await expect(app.listen(Number(new URL(url).port), '127.0.0.1')).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    await expect(app.listen(0, '127.0.0.1')).resolves.toEqual({ url: expect.any(String) });
    await Promise.all([first.app.close(), app.close()]);
  });

  it('listens on port 3000 by default', async () => {
    const close = vi.fn<(force: boolean) => Promise<void>>(async () => {});
    const serve = vi.fn<(options: { port: number }) => object>(() => ({
      url: 'http://localhost:3000/',
      ready: async () => {},
      close,
    }));
    vi.doMock('srvx', () => ({ serve }));
    try {
      const { app } = await create();
      await expect(app.listen()).resolves.toEqual({ url: 'http://localhost:3000/' });
      expect(serve).toHaveBeenCalledWith(expect.objectContaining({ port: 3000 }));
      await app.close();
      expect(close).toHaveBeenCalledWith(false);
    } finally {
      vi.doUnmock('srvx');
    }
  });
});

describe('close', () => {
  it('drains a running request, answers new ones with 503, then runs the hooks', async () => {
    const { app } = await create();
    const slow = app.request('/api/slow');
    await vi.waitFor(() => expect(log).toEqual(['slow start']));
    const closed = app.close('SIGTERM');
    const rejected = await app.request('/api/hello');
    expect(rejected.status).toBe(503);
    expect(log).toEqual(['slow start']);
    release();
    expect((await slow).status).toBe(204);
    await closed;
    expect(log).toEqual([
      'slow start',
      'slow end',
      'onModuleDestroy',
      'onApplicationShutdown(SIGTERM)',
    ]);
  });

  it('force-closes after shutdownTimeout, logs VIBE9402 and still runs the hooks', async () => {
    vi.useFakeTimers();
    const { app, lines } = await create(500);
    await app.listen(0, '127.0.0.1');
    void app.request('/api/slow');
    await vi.waitFor(() => expect(log).toEqual(['slow start']));
    const closed = app.close();
    await vi.advanceTimersByTimeAsync(500);
    await closed;
    expect(lines).toContainEqual(expect.objectContaining({ level: 'warn', code: 'VIBE9402' }));
    expect(lines.find((line) => line.code === 'VIBE9402')?.msg).toContain('1 requests');
    expect(log).toEqual(['slow start', 'onModuleDestroy', 'onApplicationShutdown(undefined)']);
    release();
  });

  it('returns the same promise on every call and runs the hooks once', async () => {
    const { app } = await create();
    const first = app.close('SIGINT');
    expect(app.close()).toBe(first);
    await first;
    expect(log).toEqual(['onModuleDestroy', 'onApplicationShutdown(SIGINT)']);
  });
});

describe('enableShutdownHooks', () => {
  it('closes the app on SIGTERM, then re-raises the signal', async () => {
    const { app } = await create();
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    expect(app.enableShutdownHooks()).toBe(app);
    process.emit('SIGTERM');
    await vi.waitFor(() => expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM'));
    expect(log).toEqual(['onModuleDestroy', 'onApplicationShutdown(SIGTERM)']);
    expect(process.listenerCount('SIGINT')).toBe(0);
  });

  it('logs a failed close and sets the exit code before re-raising', async () => {
    const { app, lines } = await create();
    fail = true;
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const exitCode = process.exitCode;
    app.enableShutdownHooks(['SIGUSR2']);
    process.emit('SIGUSR2');
    await vi.waitFor(() => expect(kill).toHaveBeenCalledWith(process.pid, 'SIGUSR2'));
    expect(process.exitCode).toBe(1);
    process.exitCode = exitCode;
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        msg: 'shutdown failed',
        error: expect.objectContaining({ code: 'VIBE9204' }),
      }),
    );
  });

  it('is a no-op without process', async () => {
    const { app } = await create();
    const once = vi.spyOn(process, 'once');
    vi.stubGlobal('process', undefined);
    expect(app.enableShutdownHooks()).toBe(app);
    vi.unstubAllGlobals();
    expect(once).not.toHaveBeenCalled();
    await app.close();
  });
});
