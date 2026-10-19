# Pipeline

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
