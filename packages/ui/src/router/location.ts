import type { LocationQuery, LocationQueryRaw } from './types.ts';

export interface ParsedLocation {
  /** Percent-encoded, as `URL` encodes it. */
  path: string;
  query: LocationQuery;
  hash: string;
  fullPath: string;
}

/** Parses `raw` relative to `currentPath`. */
export function parseLocation(raw: string, currentPath: string): ParsedLocation {
  const url = new URL(raw, 'http://x' + currentPath);
  const entries = new Map<string, string | string[]>();
  for (const [key, value] of url.searchParams) {
    const previous = entries.get(key);
    entries.set(key, previous === undefined ? value : [previous, value].flat());
  }
  // fromEntries defines own properties, so that a `__proto__` key stays a plain key.
  const query: LocationQuery = Object.fromEntries(entries);
  const search = stringifyQuery(query);
  const fullPath = url.pathname + (search ? '?' + search : '') + url.hash;
  return { path: url.pathname, query, hash: url.hash, fullPath };
}

/** The query string without `?`; `null` and `undefined` values are dropped. */
export function stringifyQuery(query: LocationQueryRaw): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== null && item !== undefined) search.append(key, String(item));
    }
  }
  return search.toString();
}
