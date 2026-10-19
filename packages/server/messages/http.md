# HTTP

## VIBE9401: Route conflict

> {method} {path} matches the same requests as another route; the handlers are {handlers}.

Routes are matched segment by segment. A static segment such as `/users/me` may sit next to a param segment such as `/users/:id`, but two routes with the same method and the same shape, such as `/users/:id` and `/users/:userId`, cannot both be reached.

### Fix

- Rename one of the paths so that the two routes differ in a static segment, or change the method of one of them.

## VIBE9402: Shutdown timeout

> {inFlight} requests were still running after the shutdown timeout of {timeout} ms, so the server was closed with them in flight.

`close()` stops accepting requests and waits for the running ones before it runs the shutdown hooks. After `shutdownTimeout` it closes the open connections and goes on.

### Fix

- Raise `shutdownTimeout` in the options of `VibeFactory.create()`.
- Make long handlers stop early when `ctx.signal` is aborted.

## VIBE9403: Already listening

> listen() was called on an app that already listens or is closing (server: {url}).

An app serves one server. `listen()` cannot be called a second time, or after `close()` has started.

### Fix

- Call `listen()` once per app; create another app with `VibeFactory.create()` for a second server.

## VIBE9404: Wildcard origin with credentials

> cors() was called with `origin: '*'` and `credentials: true`, which browsers reject.

A response that allows credentials must name the requesting origin; browsers ignore `Access-Control-Allow-Origin: *` on credentialed requests.

### Fix

- List the allowed origins explicitly, such as `origin: ['https://app.example.com']`.
- Remove `credentials: true` when the requests carry no cookies or authorization headers.
