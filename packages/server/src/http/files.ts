import type { FilesBody, UploadedFile } from '@usevibejs/contract';
import { HttpError } from './errors.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The boundary parameter of a multipart content type, without quotes. */
function boundaryOf(header: string): string | undefined {
  const match = /boundary=(?:"([^"]*)"|([^;]+))/i.exec(header);
  const value = (match?.[1] ?? match?.[2])?.trim();
  return value ? value : undefined;
}

/** The index of `needle` in `hay` at or after `from`, or -1. */
function find(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  const last = hay.length - needle.length;
  for (let i = from; i <= last; i++) {
    let same = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        same = false;
        break;
      }
    }
    if (same) return i;
  }
  return -1;
}

/** One disposition parameter: `filename*` (UTF-8), then a quoted value, then a token. */
function parameter(header: string, name: string): string | undefined {
  const star = new RegExp(`${name}\\*=UTF-8''([^;\\s]+)`, 'i').exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return undefined;
    }
  }
  const quoted = new RegExp(`${name}="((?:\\\\.|[^"\\\\])*)"`, 'i').exec(header);
  if (quoted?.[1] !== undefined) return quoted[1].replaceAll('\\"', '"').replaceAll('\\\\', '\\');
  const plain = new RegExp(`${name}=([^;\\s]+)`, 'i').exec(header);
  return plain?.[1];
}

/** True when `type` is listed, or matches a `type/*` pattern. */
function allowed(type: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const expected = pattern.trim().toLowerCase();
    if (expected.endsWith('/*')) return type.startsWith(expected.slice(0, -1));
    return type === expected;
  });
}

function bad(detail: string): HttpError {
  return new HttpError(400, 'BAD_REQUEST', detail);
}

/** The file parts of a multipart body. File bytes are copied out of `body`. */
function parse(body: Uint8Array, spec: FilesBody, marker: Uint8Array): UploadedFile[] {
  let pos = find(body, marker);
  if (pos < 0) throw bad('The multipart body has no boundary.');
  pos += marker.length;
  const files: UploadedFile[] = [];
  let total = 0;
  const headerBreak = encoder.encode('\r\n\r\n');
  while (pos < body.length) {
    if (body[pos] === 45 && body[pos + 1] === 45) break;
    if (body[pos] !== 13 || body[pos + 1] !== 10) throw bad('The multipart body is malformed.');
    pos += 2;
    const headerEnd = find(body, headerBreak, pos);
    if (headerEnd < 0) throw bad('The multipart body is malformed.');
    const header = decoder.decode(body.subarray(pos, headerEnd));
    pos = headerEnd + headerBreak.length;
    const disposition = /^content-disposition:[^\r\n]*/im.exec(header)?.[0] ?? '';
    const name = parameter(disposition, 'name');
    const filename = parameter(disposition, 'filename');
    if (!name || filename === undefined) throw bad('Only file parts are accepted.');
    if (files.length >= spec.maxFiles) {
      throw new HttpError(400, 'VIBE9507', `The upload has more than ${spec.maxFiles} files.`);
    }
    const rawType = /^content-type:\s*([^\r\n;]+)/im.exec(header)?.[1]?.trim().toLowerCase();
    const type = rawType ?? 'application/octet-stream';
    if (!allowed(type, spec.types)) {
      throw new HttpError(
        415,
        'VIBE9508',
        `The file ${filename} has type ${type}, which this route does not allow.`,
      );
    }
    const next = find(body, marker, pos);
    if (next < 0) throw bad('The multipart body is truncated.');
    let end = next;
    if (end >= 2 && body[end - 2] === 13 && body[end - 1] === 10) end -= 2;
    const bytes = body.subarray(pos, end);
    if (total + bytes.byteLength > spec.maxBytes) {
      throw new HttpError(413, 'VIBE9506', `The upload is larger than ${spec.maxBytes} bytes.`);
    }
    total += bytes.byteLength;
    files.push({ name, filename, type, bytes: bytes.slice() });
    pos = next + marker.length;
  }
  return files;
}

/**
 * The file parts of `req`. Reads at most `maxBytes` plus a small per-file header allowance, then
 * stops and cancels the rest. Throws 415 for a non-multipart body, 400 for a malformed body or
 * too many files (VIBE9507), 413 past `maxBytes` (VIBE9506) and 415 for a rejected type (VIBE9508).
 */
export async function readFiles(req: Request, spec: FilesBody): Promise<readonly UploadedFile[]> {
  const header = req.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\b/i.test(header)) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  const boundary = boundaryOf(header);
  if (!boundary) throw bad('The multipart body has no boundary.');
  if (!req.body) throw bad('The request has no body.');
  const cap = spec.maxBytes + 4096 + spec.maxFiles * 512;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const read = await reader.read();
      if (read.done) break;
      size += read.value.byteLength;
      if (size > cap) {
        throw new HttpError(413, 'VIBE9506', `The upload is larger than ${spec.maxBytes} bytes.`);
      }
      chunks.push(read.value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parse(body, spec, encoder.encode(`--${boundary}`));
}
