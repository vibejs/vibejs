import { realpath, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { vibeError } from '../errors.gen.ts';

/** Files served for GET requests outside `basePath`. */
export interface StaticOptions {
  /** The directory of files, such as `ui/dist`. A relative path resolves from the process directory. */
  readonly root: string;
  /** Serve `index.html` when the path misses a file. */
  readonly spa?: boolean;
}

/** A checked static root. `root` is absolute and real. */
export interface StaticRoot {
  readonly root: string;
  readonly spa: boolean;
}

const TYPES: Readonly<Record<string, string>> = {
  css: 'text/css; charset=utf-8',
  gif: 'image/gif',
  html: 'text/html; charset=utf-8',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  wasm: 'application/wasm',
  webmanifest: 'application/manifest+json',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

/** The `code` of a filesystem error, when it has one. */
export function errnoCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/** True for a path that is not there, including a path through a file. */
export function isMissingPath(error: unknown): boolean {
  const code = errnoCode(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** True when `pathname` is outside the API prefix. An empty prefix owns every path. */
export function isStaticPath(pathname: string, basePath: string): boolean {
  if (basePath === '') return false;
  return pathname !== basePath && !pathname.startsWith(`${basePath}/`);
}

/** The media type of `file`, or `application/octet-stream` for an unknown extension. */
export function mediaType(file: string): string {
  const base = file.slice(file.lastIndexOf(sep) + 1);
  const dot = base.lastIndexOf('.');
  const name = dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
  return TYPES[name] ?? 'application/octet-stream';
}

/**
 * True when `from` is the output of `path.relative(root, file)` for a file inside `root`.
 * A drive path is a result on another Windows drive.
 */
export function staysInside(from: string): boolean {
  if (from === '') return true;
  if (from === '..' || from.startsWith('../') || from.startsWith('..\\')) return false;
  if (from.startsWith('/') || from.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(from)) return false;
  return true;
}

/**
 * Checks `options.root` and returns it real and absolute. Throws VIBE9406 when it is missing and
 * VIBE9407 when it is not a directory.
 */
export async function openStatic(options: StaticOptions): Promise<StaticRoot> {
  const requested = options.root;
  let root: string;
  try {
    root = await realpath(requested);
  } catch (error) {
    // Anything other than a missing path is rethrown.
    if (errnoCode(error) === 'ENOENT')
      throw vibeError('VIBE9406', { root: requested }, { cause: error });
    throw error;
  }
  if (!(await stat(root)).isDirectory()) throw vibeError('VIBE9407', { root: requested });
  return { root, spa: options.spa === true };
}

/**
 * The relative path of a URL pathname. `undefined` for a bad percent escape, which the router
 * answers as 400. Throws VIBE9408 when a segment is `..` or the path contains a null byte.
 */
function relativePath(pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0')) throw vibeError('VIBE9408', { path: pathname });
  const segments = decoded.split(/[\\/]+/).filter((segment) => segment !== '');
  if (segments.includes('..')) throw vibeError('VIBE9408', { path: pathname });
  return segments.join('/');
}

/** The file `candidate` names inside `root`, following one directory to its `index.html`. */
async function locate(root: string, candidate: string, depth: number): Promise<string | undefined> {
  if (depth > 1) return undefined;
  let real: string;
  try {
    real = await realpath(candidate);
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw error;
  }
  if (!staysInside(relative(root, real))) throw vibeError('VIBE9408', { path: candidate });
  if ((await stat(real)).isDirectory()) return locate(root, join(real, 'index.html'), depth + 1);
  return real;
}

/**
 * The response for a GET of `pathname`, or `undefined` when the file is missing and there is no
 * SPA fallback. Throws VIBE9408 when the path leaves the root, including through a symbolic link.
 */
export async function serveStatic(
  root: StaticRoot,
  pathname: string,
): Promise<Response | undefined> {
  const rel = relativePath(pathname);
  if (rel === undefined) return undefined;
  const file = await locate(root.root, join(root.root, rel), 0);
  const fallback =
    file === undefined && root.spa && rel !== 'index.html'
      ? await locate(root.root, join(root.root, 'index.html'), 0)
      : undefined;
  const target = file ?? fallback;
  if (target === undefined) return undefined;
  return new Response(await readFile(target), { headers: { 'content-type': mediaType(target) } });
}
