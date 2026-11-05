import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = '/node_modules/';

/**
 * Whether a `.vibe` file may be compiled. Application files may. A file inside `node_modules` may
 * only when the package that contains it sets `"vibejs": { "sfc": true }`.
 */
export function allowsPackageSfc(file: string): boolean {
  const normalized = file.replaceAll('\\', '/');
  const at = normalized.lastIndexOf(MARKER);
  if (at < 0) return true;
  const segments = normalized.slice(at + MARKER.length).split('/');
  if (segments[0] === '') return false;
  const depth = segments[0].startsWith('@') ? 2 : 1;
  if (segments.length <= depth) return false;
  const packageDir = normalized.slice(0, at) + MARKER + segments.slice(0, depth).join('/');
  let manifest: { vibejs?: { sfc?: unknown } };
  try {
    manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  } catch {
    return false;
  }
  return manifest.vibejs?.sfc === true;
}
