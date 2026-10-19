import type { ValidationIssue } from '@vibejs-org/contract';
import { vibeError } from '../errors.gen.ts';
import type { Logger } from '../logger.ts';

// The server builds against the Node types, which have no global `HeadersInit`.
type HeadersInit = NonNullable<RequestInit['headers']>;

/** An error meant for the client: it is answered as an `application/problem+json` response. */
export class HttpError extends Error {
  override name = 'HttpError';
  readonly status: number;
  readonly code: string;
  readonly detail: string | undefined;
  readonly headers: HeadersInit | undefined;
  readonly errors: readonly ValidationIssue[] | undefined;

  constructor(
    status: number,
    code: string,
    detail?: string,
    options?: { cause?: unknown; headers?: HeadersInit; errors?: readonly ValidationIssue[] },
  ) {
    super(detail ?? code, options);
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.headers = options?.headers;
    this.errors = options?.errors;
  }
}

const TITLES: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/** The RFC 9457 response of `error`; the body never includes the error's cause. */
export function problem(error: HttpError, requestId: string): Response {
  const { status, code, detail, errors } = error;
  const title = TITLES[status] ?? 'Error';
  const body = { type: 'about:blank', title, status, code, detail, errors, requestId };
  const res = Response.json(body, { status, headers: error.headers });
  res.headers.set('content-type', 'application/problem+json');
  return res;
}

/**
 * The problem of an `HttpError` with an integer status in 400-599; anything else is logged as
 * VIBE9503 and answered with a 500.
 */
export function renderError(error: unknown, requestId: string, log: Logger): Response {
  const valid = error instanceof HttpError && Number.isInteger(error.status);
  if (valid && error.status >= 400 && error.status <= 599) return problem(error, requestId);
  const { message, code } = vibeError('VIBE9503', undefined, { cause: error });
  log.error(message, { code, cause: error });
  return problem(new HttpError(500, 'INTERNAL_ERROR'), requestId);
}
