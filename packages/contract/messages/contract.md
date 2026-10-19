# Contracts

## VIBE9001: Invalid route path

> The path "{path}" has the invalid segment "{segment}".

A route path is `/` or one or more segments, each starting with `/`. A static segment uses only letters, digits and `.`, `_`, `~`, `-`, and is never `.` or `..`, because URL parsing removes those; a param segment is `:` followed by a name that starts with a letter or `_`. A contract prefix follows the same rules, is never `/` and has no trailing slash. Wildcard, optional and pattern segments are not supported.

### Fix

- Write the path as `/` or as segments such as `/users/:userId/posts`.
- Remove the trailing slash, the empty segment or the unsupported characters from "{path}".

## VIBE9002: Duplicate path param

> The path "{path}" declares the param ":{param}" more than once.

Param names must be unique in the full path of a route, which is the contract prefix followed by the route path.

### Fix

- Rename one of the ":{param}" params so that every param name in the prefix and the route path is unique.

## VIBE9003: Not a route

> The contract entry "{key}" is not a route built with get, post, put, patch or del.

`defineContract` accepts only the values that the route builders return. A plain object, `undefined` or a route that is already bound to a contract is rejected.

### Fix

- Build "{key}" with `get`, `post`, `put`, `patch` or `del`, for example `{key}: get('/')`.
- Pass the route builders' results to `defineContract`, not the routes of another contract.

## VIBE9004: Body on a GET route

> The GET route "{path}" declares a body.

A GET request cannot carry a body: `fetch` rejects it and many servers and proxies drop it. Inputs of a GET route travel in its path params, query and headers.

### Fix

- Move the inputs of "{path}" into `query`, or declare the route with `post` if it needs a body.
