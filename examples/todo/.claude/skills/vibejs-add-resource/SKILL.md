---
name: vibejs-add-resource
description: Adds an API resource to a vibe.js app, from its contract to the server handlers and the UI page that shows it, with tests. Use it when a vibe.js project needs a new endpoint, entity or CRUD feature.
license: MIT
---

# Add a resource to a vibe.js app

`vibejs` means the local CLI command named in AGENTS.md (`pnpm exec vibejs`, `npx --no vibejs` or `yarn vibejs`). Never run a global `vibejs` or `vibe`.

The example adds `users`; use the plural, camelCase name of your resource.

## 1. Plan the contract first

The contract is the single source of the API: the routes, their params, bodies and responses, and the error codes each route can answer with. Decide them before writing code. The UI and the server both import it, so there is no codegen step.

## 2. Preview the generated files

Run `vibejs g resource users --dry-run --json`. It lists every file it would write with its content:

- `contracts/src/users.contract.ts`: the schemas and `defineContract('/users', { ... })` with list, get, create, update and remove routes;
- `server/src/users/`: the service, the controller, the module and a controller test;
- the registrations in `server/src/app.module.ts` and `ui/src/api.ts`.

For an irregular plural, pass `--singular`, as in `vibejs g resource people --singular person --dry-run --json`.

## 3. Generate

Run `vibejs g resource users --json`. Running it again is a no-op.

- `VIBE8401`: a file already exists and differs; nothing was written. Compare with `--dry-run --json`, then pick another name. Pass `--force` only when the user agrees to overwrite their files (in agent mode it needs `VIBEJS_USER_CONSENT` with their words).
- `VIBE8402`: a file such as `server/src/app.module.ts` or `ui/src/api.ts` has another shape, so the generator could not register the new code. The other files are written; apply the exact instruction in the message by hand.

## 4. Shape the contract

Edit `contracts/src/users.contract.ts` to match the plan: the fields of the schemas, the routes, and each route's `errors: { CODE: status }`, such as `errors: { USER_NOT_FOUND: 404 }`.

## 5. Fill in the server

- The service holds the logic. Inject it into a field, never through the constructor: `private readonly users = inject(UsersService)`.
- Each handler is `@Handle(users.route)` on a method that takes one `ctx: Ctx<typeof users.route>` and returns the route's response type. Read `ctx.params`, `ctx.query` and `ctx.body`; they are already validated.
- Answer a declared error with `ctx.fail('USER_NOT_FOUND')`. Only codes from the route's `errors` are allowed.
- A TS1241 error on `@Handle` means the method's parameter or return type does not match the route; fix the types, never cast.

Check it with `vibejs request GET /api/users --json` while `vibejs dev` runs.

## 6. Add the UI

- `vibejs g page Users --json` adds `ui/src/pages/UsersPage.vibe` with a test and registers its route; `vibejs g component UserCard --json` adds a component with a test. Preview both with `--dry-run --json` first.
- In the page, get the API client that `ui/src/api.ts` creates with `createClient`, and load data with `useAsync`:

```ts
const api = inject(API)!;
const { data } = useAsync((signal) => api.users.list(undefined, { signal }));
```

A failed call is a value, never thrown: narrow `data.value?.ok` before reading `data.value.data`, and show `data.value.error.code` otherwise.

## 7. Test and finish

Extend the generated tests to every new branch: each error code, each validation failure and each UI state. Then run `vibejs check --json` until it exits 0; the `vibejs-cover-100` skill covers missing lines.
