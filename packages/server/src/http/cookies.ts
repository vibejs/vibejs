import { vibeError } from '../errors.gen.ts';

export interface CookieOptions {
  /** Default `/`. */
  readonly path?: string;
  readonly domain?: string;
  /** Seconds. */
  readonly maxAge?: number;
  readonly expires?: Date;
  /** Default `true`. */
  readonly httpOnly?: boolean;
  /** Default `true`. */
  readonly secure?: boolean;
  /** Default `Lax`. */
  readonly sameSite?: 'Strict' | 'Lax' | 'None';
}

/** The request cookies, and the `Set-Cookie` headers of the response. */
export interface Cookies {
  get(name: string): string | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string, options?: { readonly path?: string; readonly domain?: string }): void;
}

// An RFC 9110 token.
const TOKEN = /^[\w!#$%&'*+.^`|~-]+$/;

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The first value of each name in a `Cookie` header, URI-decoded (raw when that fails). */
function parse(header: string): Map<string, string> {
  const jar = new Map<string, string>();
  for (const pair of header.split(';')) {
    const at = pair.indexOf('=');
    const name = pair.slice(0, at).trim();
    if (at > 0 && !jar.has(name)) jar.set(name, decode(pair.slice(at + 1).trim()));
  }
  return jar;
}

/** Cookies over the `Cookie` header of `req`; `set` and `delete` append to `headers`. */
export function createCookies(req: Request, headers: Headers): Cookies {
  let jar: Map<string, string> | undefined;
  const set = (name: string, value: string, options: CookieOptions = {}): void => {
    if (!TOKEN.test(name)) throw vibeError('VIBE9504', { name });
    const { path = '/', domain, maxAge, expires, httpOnly = true, secure = true } = options;
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];
    if (domain !== undefined) parts.push(`Domain=${domain}`);
    if (maxAge !== undefined) parts.push(`Max-Age=${Math.floor(maxAge)}`);
    if (expires) parts.push(`Expires=${expires.toUTCString()}`);
    if (httpOnly) parts.push('HttpOnly');
    if (secure) parts.push('Secure');
    parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);
    headers.append('set-cookie', parts.join('; '));
  };
  return {
    get: (name) => (jar ??= parse(req.headers.get('cookie') ?? '')).get(name),
    set,
    delete: (name, options) => set(name, '', { ...options, maxAge: 0, expires: new Date(0) }),
  };
}
