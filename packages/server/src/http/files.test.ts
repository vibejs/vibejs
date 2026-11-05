// oxlint-disable typescript/no-extraneous-class -- modules are plain classes
import { createClient, defineContract, files, post } from '@usevibejs/contract';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { captureLog } from '../../test/log.ts';
import { Controller, Handle, Module } from '../module/decorators.ts';
import { VibeFactory } from './app.ts';
import type { Ctx } from './context.ts';
import { readFiles } from './files.ts';

const spec = files({ maxBytes: 1000, maxFiles: 2, types: ['image/png', 'image/*'] });
const uploads = defineContract('/uploads', {
  create: post('/', {
    body: spec,
    response: v.array(
      v.object({
        name: v.string(),
        filename: v.string(),
        type: v.string(),
        size: v.number(),
      }),
    ),
  }),
});

@Controller(uploads)
class UploadController {
  @Handle(uploads.create)
  create(ctx: Ctx<typeof uploads.create>) {
    return ctx.files.map((file) => ({
      name: file.name,
      filename: file.filename,
      type: file.type,
      size: file.bytes.byteLength,
    }));
  }
}

@Module({ controllers: [UploadController] })
class AppModule {}

const part = (headers: string, bytes = 'hi') => `--bound\r\n${headers}\r\n\r\n${bytes}\r\n`;

function raw(body: string, boundary = 'bound'): Request {
  return new Request('http://localhost/uploads', {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

async function failure(req: Request, limits = spec): Promise<unknown> {
  try {
    await readFiles(req, limits);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('readFiles', () => {
  it('rejects a non-multipart body, a missing boundary and a missing body', async () => {
    const json = new Request('http://localhost/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(await failure(json)).toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    const bareType = new Request('http://localhost/uploads', { method: 'POST' });
    expect(await failure(bareType)).toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
    const untyped = new Request('http://localhost/uploads', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data' },
      body: '--x--',
    });
    expect(await failure(untyped)).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    const quotedEmpty = new Request('http://localhost/uploads', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=""' },
      body: '--',
    });
    expect(await failure(quotedEmpty)).toMatchObject({ code: 'BAD_REQUEST' });
    const nobody = new Request('http://localhost/uploads', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary="abc"' },
    });
    expect(await failure(nobody)).toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('reads quoted, plain and extended filenames, and an empty file list', async () => {
    const quoted = await readFiles(
      raw(
        `${part('Content-Disposition: form-data; name="doc"; filename="a\\"b.png"\r\nContent-Type: image/png', 'png')}${part('Content-Disposition: form-data; name=plain; filename=c.png\r\nContent-Type: image/jpeg')}--bound--\r\n`,
      ),
      spec,
    );
    expect(
      quoted.map((file) => [file.name, file.filename, file.type, file.bytes.byteLength]),
    ).toEqual([
      ['doc', 'a"b.png', 'image/png', 3],
      ['plain', 'c.png', 'image/jpeg', 2],
    ]);
    const star = await readFiles(
      raw(
        `--bound\r\nContent-Disposition: form-data; name="doc"; filename*=UTF-8''a%20b.png\r\nContent-Type: image/png\r\n\r\nxy\r\n--bound--\r\n`,
      ),
      spec,
    );
    expect(star).toMatchObject([{ filename: 'a b.png', type: 'image/png' }]);
    const empty = await readFiles(raw('--bound--\r\n'), spec);
    expect(empty).toEqual([]);
    const bare = await readFiles(
      raw(
        '--bound\r\nContent-Disposition: form-data; name="doc"; filename="a.png"\r\n\r\npng\r\n--bound--',
      ),
      files({ maxBytes: 1000, maxFiles: 1, types: ['application/octet-stream'] }),
    );
    expect(bare).toMatchObject([{ type: 'application/octet-stream', filename: 'a.png' }]);
    const tight = await readFiles(
      raw(
        '--bound\r\nContent-Disposition: form-data; name="a"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nhi--bound--',
      ),
      files({ maxBytes: 10, maxFiles: 1, types: [' Image/PNG '] }),
    );
    expect(tight).toMatchObject([{ filename: 'a.png', bytes: expect.any(Uint8Array) }]);
    expect(tight[0]?.bytes).toEqual(new Uint8Array([104, 105]));
  });

  it('rejects a bad filename encoding, a text field, a truncated body and a boundary without a break', async () => {
    expect(
      await failure(
        raw(
          `--bound\r\nContent-Disposition: form-data; name="doc"; filename*=UTF-8''%zz\r\nContent-Type: image/png\r\n\r\nx\r\n--bound--\r\n`,
        ),
      ),
    ).toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      await failure(
        raw('--bound\r\nContent-Disposition: form-data; name="note"\r\n\r\nhello\r\n--bound--\r\n'),
      ),
    ).toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      await failure(raw('--bound\r\nContent-Disposition: form-data; name="doc"\r\n')),
    ).toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(await failure(raw('--nope--\r\n'))).toMatchObject({ code: 'BAD_REQUEST' });
    expect(await failure(raw('--bound\r\nnot-headers'))).toMatchObject({ code: 'BAD_REQUEST' });
    expect(await failure(raw('--boundXYZ'))).toMatchObject({ code: 'BAD_REQUEST' });
    expect(await failure(raw('--bound\rX'))).toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      await failure(raw('--bound\r\nContent-Type: image/png\r\n\r\nhi\r\n--bound--\r\n')),
    ).toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      await failure(
        raw(
          '--bound\r\nContent-Disposition: form-data; name="a"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nhi',
        ),
      ),
    ).toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects too many files, a rejected type and a payload past maxBytes', async () => {
    const two = raw(
      `${part('Content-Disposition: form-data; name="a"; filename="a.png"\r\nContent-Type: image/png')}${part('Content-Disposition: form-data; name="b"; filename="b.png"\r\nContent-Type: image/png')}--bound--\r\n`,
    );
    expect(
      await failure(two, files({ maxBytes: 1000, maxFiles: 1, types: ['image/png'] })),
    ).toMatchObject({ status: 400, code: 'VIBE9507' });
    const text = () =>
      raw(
        '--bound\r\nContent-Disposition: form-data; name="a"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nhi\r\n--bound--\r\n',
      );
    expect(
      await failure(text(), files({ maxBytes: 1000, maxFiles: 1, types: ['image/*'] })),
    ).toMatchObject({ status: 415, code: 'VIBE9508' });
    expect(
      await failure(text(), files({ maxBytes: 1000, maxFiles: 1, types: ['image/png'] })),
    ).toMatchObject({ code: 'VIBE9508' });
    const big = raw(
      `--bound\r\nContent-Disposition: form-data; name="a"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n${'x'.repeat(50)}\r\n--bound--\r\n`,
    );
    expect(
      await failure(big, files({ maxBytes: 10, maxFiles: 1, types: ['image/png'] })),
    ).toMatchObject({
      status: 413,
      code: 'VIBE9506',
    });
  });

  it('stops reading once the body passes the byte cap', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = new Uint8Array(1000);
        pulled += chunk.byteLength;
        controller.enqueue(chunk);
        if (pulled > 100_000) controller.close();
      },
    });
    const req = new Request('http://localhost/uploads', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=bound' },
      body: stream,
      duplex: 'half',
    });
    const error = await failure(req, files({ maxBytes: 32, maxFiles: 1, types: ['image/png'] }));
    expect(error).toMatchObject({ code: 'VIBE9506' });
    expect(pulled).toBeLessThan(32 + 4096 + 512 + 1000);
  });

  it('cancels and rethrows when the stream fails', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('boom');
      },
    });
    const req = new Request('http://localhost/uploads', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=bound' },
      body: stream,
      duplex: 'half',
    });
    await expect(readFiles(req, spec)).rejects.toThrow('boom');
  });
});

describe('files() route', () => {
  it('gives the handler the files and answers limit and type failures as problems', async () => {
    const { lines, logger } = captureLog('debug');
    const app = await VibeFactory.create(AppModule, { logger, bodyLimit: 8 });
    const form = new FormData();
    form.append('doc', new File(['png'], 'a.png', { type: 'image/png' }));
    form.append('doc', new File(['jpg'], 'b.jpg', { type: 'image/jpeg' }));
    const api = createClient(uploads, { baseUrl: '', fetch: app.fetch });
    await expect(api.create({ body: form })).resolves.toMatchObject({
      ok: true,
      data: [
        { name: 'doc', filename: 'a.png', type: 'image/png', size: 3 },
        { name: 'doc', filename: 'b.jpg', type: 'image/jpeg', size: 3 },
      ],
    });

    const text = new FormData();
    text.set('doc', new File(['no'], 'c.txt', { type: 'text/plain' }));
    const rejected = await api.create({ body: text });
    expect(rejected).toMatchObject({
      ok: false,
      error: { code: 'VIBE9508', status: 415, title: 'Unsupported Media Type' },
    });
    expect(lines.some((line) => line.code === 'VIBE9502')).toBe(false);
    expect(rejected.response?.headers.get('content-type')).toBe('application/problem+json');

    const huge = new FormData();
    huge.set('doc', new File(['x'.repeat(2000)], 'big.png', { type: 'image/png' }));
    await expect(api.create({ body: huge })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VIBE9506', status: 413 },
    });
    await app.close();
  });

  it('still answers a JSON body past bodyLimit with 413', async () => {
    const { logger } = captureLog();
    const app = await VibeFactory.create(AppModule, { logger, bodyLimit: 8 });
    const res = await app.request('/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '17' },
      body: '{"a":"0123456789"}',
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: 'BODY_TOO_LARGE' });
    await app.close();
  });
});
