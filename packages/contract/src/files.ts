import { vibeError } from './errors.gen.ts';

/** A multipart file upload. `types` entries are media types; a trailing `/*` matches every subtype. */
export interface FilesBody {
  readonly kind: 'files';
  readonly maxBytes: number;
  readonly maxFiles: number;
  readonly types: readonly string[];
}

/** One file part of a `files()` upload. `bytes.length` of every file sums to at most `maxBytes`. */
export interface UploadedFile {
  readonly name: string;
  readonly filename: string;
  readonly type: string;
  readonly bytes: Uint8Array;
}

/** True for the value `files()` returns. */
export function isFilesBody(value: unknown): value is FilesBody {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'files';
}

/** Why `options` cannot declare an upload, or `undefined` when they can. */
function invalid(options: {
  maxBytes: number;
  maxFiles: number;
  types: readonly string[];
}): string | undefined {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1) {
    return 'a maxBytes that is not a positive integer';
  }
  if (!Number.isSafeInteger(options.maxFiles) || options.maxFiles < 1) {
    return 'a maxFiles that is not a positive integer';
  }
  if (
    !Array.isArray(options.types) ||
    options.types.length === 0 ||
    options.types.some((type) => typeof type !== 'string' || type === '')
  ) {
    return 'a types list that is empty or contains an empty type';
  }
  return undefined;
}

/**
 * Declares a `multipart/form-data` body. The handler reads `ctx.files`. The client sends
 * `FormData`. Throws VIBE9005 when a limit is not a positive integer or `types` is empty.
 */
export function files(options: {
  maxBytes: number;
  maxFiles: number;
  types: readonly string[];
}): FilesBody {
  const reason = invalid(options);
  if (reason !== undefined) throw vibeError('VIBE9005', { reason });
  return {
    kind: 'files',
    maxBytes: options.maxBytes,
    maxFiles: options.maxFiles,
    types: [...options.types],
  };
}
