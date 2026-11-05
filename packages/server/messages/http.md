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

## VIBE9405: Invalid base path

> The base path {basePath} is not empty and not of the form `/segment` or `/a/b`.

`VibeFactory.create()` mounts every route under `basePath`. A path without a leading slash, with a trailing slash or with an empty segment would make routes unreachable.

### Fix

- Pass `''` for no prefix, or a path such as `/api` without a trailing slash.

## VIBE9406: Static root not found

> The static root {root} does not exist.

`VibeFactory.create()` serves files from `static.root` for GET requests outside `basePath`. A relative root is resolved from the process directory. The application is not created when that directory is missing.

### Fix

- Build the UI before starting the server, so {root} exists.
- Pass the directory `vibejs build` wrote, such as `ui/dist`.

## VIBE9407: Static root is not a directory

> The static root {root} is not a directory.

`static.root` is the directory of the built files. A file cannot be served as a root.

### Fix

- Pass the directory of the built UI, such as `ui/dist`, not a file inside it.

## VIBE9408: Static path escapes the root

> The path {path} escapes the static root.

A static file is read only from inside `static.root`. A request whose path leaves that directory, including through a symbolic link, is rejected. The client receives 500 INTERNAL_ERROR and the escape is logged.

### Fix

- Request a path inside the site, such as `/` or `/assets/index.js`.
