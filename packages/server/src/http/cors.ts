import { vibeError } from '../errors.gen.ts';
import type { Middleware } from './app.ts';

export interface CorsOptions {
  /** `'*'`, the allowed origins, or a predicate over the `Origin` header. */
  readonly origin: '*' | readonly string[] | ((origin: string) => boolean);
  readonly credentials?: boolean;
  /** Preflight methods; default `GET, HEAD, PUT, PATCH, POST, DELETE`. */
  readonly methods?: readonly string[];
  /** Preflight headers; default the requested ones. */
  readonly allowHeaders?: readonly string[];
  readonly exposeHeaders?: readonly string[];
  /** Seconds a preflight result may be cached. */
  readonly maxAge?: number;
}

const METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];

/** A middleware that answers CORS preflights and adds the CORS headers to every response. */
export function cors(options: CorsOptions): Middleware {
  const { origin, credentials = false, methods = METHODS, allowHeaders, exposeHeaders } = options;
  if (origin === '*' && credentials) throw vibeError('VIBE9404');
  const allows = (value: string): boolean =>
    origin === '*' || (typeof origin === 'function' ? origin(value) : origin.includes(value));

  return async (req, next) => {
    const from = req.headers.get('origin');
    const allowed = from !== null && allows(from);
    const preflight =
      req.method === 'OPTIONS' && from !== null && req.headers.has('access-control-request-method');
    const res = preflight ? new Response(null, { status: 204 }) : await next();
    // Responses such as `Response.redirect()` have immutable headers; a copy has mutable ones.
    const out = new Response(res.body, res);
    out.headers.append('vary', 'Origin');
    if (!allowed) return out;
    out.headers.set('access-control-allow-origin', origin === '*' ? '*' : from);
    if (credentials) out.headers.set('access-control-allow-credentials', 'true');
    if (preflight) {
      out.headers.set('access-control-allow-methods', methods.join(', '));
      const headers = allowHeaders?.join(', ') ?? req.headers.get('access-control-request-headers');
      if (headers) out.headers.set('access-control-allow-headers', headers);
      if (options.maxAge !== undefined) {
        out.headers.set('access-control-max-age', String(options.maxAge));
      }
    } else if (exposeHeaders) {
      out.headers.set('access-control-expose-headers', exposeHeaders.join(', '));
    }
    return out;
  };
}
