import { HttpError } from './errors.ts';

const JSON_TYPE = /^application\/(?:[\w.-]+\+)?json$/i;

/**
 * The JSON body of `req`, or `undefined` when it is empty. Throws an `HttpError`: 413 past `limit`
 * bytes (the stream is cancelled), 415 for a non-JSON content type, 400 for bad UTF-8 or JSON.
 */
export async function readJson(req: Request, limit: number): Promise<unknown> {
  if (!req.body) return undefined;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, 'BODY_TOO_LARGE');
    }
    chunks.push(read.value);
  }
  if (size === 0) return undefined;
  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!JSON_TYPE.test(type)) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE');
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const text = chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('');
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    throw new HttpError(400, 'INVALID_JSON', undefined, { cause: error });
  }
}
