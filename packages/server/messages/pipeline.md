# Pipeline

## VIBE9501: Response violates the contract

> The value that {route} returned does not match its response schema: {issues}.

With `validateResponses` on (the default), a handler's result is validated against the route's `response` schema before it is sent. A mismatch is a server bug, so the client receives 500 INTERNAL_ERROR and the issues are logged.

### Fix

- Change the handler so that it returns a value that matches the `response` schema, or update the schema in the contract.
- Pass `validateResponses: false` to `VibeFactory.create()` only to diagnose; the client then receives the value unchecked.

## VIBE9502: Undeclared error code

> {route} answered with the error code {code}, which the route does not declare.

A route lists the error codes it raises in `errors`, so that clients can handle each of them. The problem is still sent; this warning shows that the contract is incomplete.

### Fix

- Add the code with the status it answers to the route's `errors`.
- Use a built-in code such as `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN` or `NOT_FOUND` when it fits.

## VIBE9503: Unhandled error

> A request failed with an unexpected error, so the client received 500 INTERNAL_ERROR.

Any error that is not an `HttpError` is logged with its cause and answered with a problem that hides the details. Only `HttpError` values and the declared error codes of a route reach the client.

### Fix

- Read the logged `cause` and fix the code that threw it.
- Throw an `HttpError`, or call `ctx.fail()` with a declared error code, when the error is meant for the client.

## VIBE9504: Invalid cookie name

> The cookie name "{name}" is not a valid token.

Cookie names follow the token rule of RFC 9110: they contain no spaces, separators or control characters.

### Fix

- Use a name made of letters, digits and ``!#$%&'*+-.^_`|~``.

## VIBE9505: Invalid raw result

> {route} declares a raw response but returned a value of type {type}.

A raw route sends its result unparsed, with the declared content type. The result must be a `Response` or a body that `new Response()` accepts.

### Fix

- Return a `Response`, or a `string`, `Blob`, `ArrayBuffer`, typed array, `ReadableStream`, `URLSearchParams` or `FormData` from the handler.
