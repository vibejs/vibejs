import { describe, expect, it } from 'vitest';
import { readJson } from './body.ts';
import { HttpError } from './errors.ts';

const post = (body: string | Uint8Array | null, type?: string) =>
  new Request('http://localhost/', {
    method: 'POST',
    body,
    headers: type === undefined ? {} : { 'content-type': type },
  });

async function failure(req: Request, limit = 100): Promise<unknown> {
  try {
    await readJson(req, limit);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('readJson', () => {
  it('reads application/json and application/*+json, ignoring parameters and case', async () => {
    expect(await readJson(post('{"a":1}', 'application/json'), 100)).toEqual({ a: 1 });
    expect(await readJson(post('[1]', 'Application/Problem+JSON; charset=utf-8'), 100)).toEqual([
      1,
    ]);
  });

  it('returns undefined for no body and an empty body, whatever the content type', async () => {
    expect(await readJson(new Request('http://localhost/'), 100)).toBeUndefined();
    expect(await readJson(post(''), 100)).toBeUndefined();
  });

  it('rejects other content types with 415 and bodies past the limit with 413', async () => {
    expect(await failure(post(new Uint8Array([0x7b, 0x7d])))).toMatchObject({ status: 415 });
    for (const type of [undefined, 'text/plain', 'application/jsonx', 'multipart/form-data']) {
      expect(await failure(post('{}', type))).toMatchObject({ status: 415 });
    }
    expect(await failure(post('[1,2]', 'application/json'), 4)).toMatchObject({ status: 413 });
    expect(await readJson(post('[1,2]', 'application/json'), 5)).toEqual([1, 2]);
  });

  it('rejects bad JSON and bad UTF-8 with 400 INVALID_JSON and keeps the cause', async () => {
    const bad = await failure(post('{', 'application/json'));
    expect(bad).toBeInstanceOf(HttpError);
    expect(bad).toMatchObject({
      status: 400,
      code: 'INVALID_JSON',
      cause: expect.any(SyntaxError),
    });
    const bytes = new Uint8Array([0x22, 0xff, 0x22]);
    expect(await failure(post(bytes, 'application/json'))).toMatchObject({ code: 'INVALID_JSON' });
  });
});
