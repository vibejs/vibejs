# 0003. Contract-first typed client/server bridge with Standard Schema

- Status: Accepted
- Date: 2026-10-18

## Context

The UI and the server are written in the same repository and the same language, so a request's path, input, response and errors can be checked by the compiler on both sides. The bridge must not pull server code into the browser bundle, must not need a code generation step that can go stale, and must not lock users into one validation library.

## Decision

- An API is declared once as a contract: `defineContract(prefix, routes)`, with routes built by `get`, `post`, `put`, `patch` and `del`. Each route names its path and, optionally, `params`, `query`, `headers`, `body` and `response` schemas, a success status, and its error codes with their HTTP status (`errors: { USER_NOT_FOUND: 404 }`).
- Schemas are [Standard Schema](https://standardschema.dev) validators, so any compliant library can be used. The project template uses valibot.
- `@vibejs-org/contract` is isomorphic: it imports nothing from `node:*` or from the server, and `*.contract.ts` files import only the contract package and a schema library.
- The server implements a contract with `@Controller(contract)` and `@Handle(route)`. Inputs are validated before the handler runs; the handler returns the response type and raises declared errors with `ctx.fail('CODE', detail?)`.
- The UI calls a contract through `createClient(contracts, { baseUrl })`. A call returns an `ApiResult` that is narrowed on `.ok`; it never throws for HTTP or network failures.
- Error responses are RFC 9457 `application/problem+json` with a required `code`.
- OpenAPI 3.1 is generated from the contracts, using the JSON Schema that Standard Schema libraries expose.

## Consequences

- Changing a route's shape is a type error in every handler and every call site, with no generated files to refresh.
- The UI bundle contains only contracts, schemas and the client, never server code; a lint rule forbids importing the server package from UI code.
- Error codes and their statuses cannot drift between server, client and OpenAPI, because all three read them from the contract.
- Request validation, OpenAPI and agent tooling share one schema source.

## Alternatives considered

- **Generate a client from an OpenAPI document.** Language-neutral, but it adds a generation step and a second source of truth that can fall out of date.
- **Infer the client from the server implementation's types.** No separate contract file, but the client then depends on server types, which couples the two builds and makes accidental server imports in UI code easier.
- **Bind one validation library.** A simpler integration, but it forces that library on every application.
