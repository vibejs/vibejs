---
name: vibejs-cover-100
description: Brings every file of a vibe.js app to 100% test coverage by adding tests. Use it when vibejs check reports VIBE8302, when coverage drops after a change, or when the user asks for full coverage.
license: MIT
---

# Cover every file of a vibe.js app

`vibejs` means the local CLI command named in AGENTS.md (`pnpm exec vibejs`, `npx --no vibejs` or `yarn vibejs`). Never run a global `vibejs` or `vibe`.

## 1. Find the uncovered code

Run `vibejs check --json` (MCP tool `check`). Each file below 100% statement, branch, function or line coverage is a `VIBE8302` diagnostic with the file and its uncovered lines. Read those lines and work out which input reaches them: an error code, an empty list, a failed request, a guard that says no.

## 2. Add tests, never ignore comments

Write a test next to the file (`*.test.ts`) that drives each uncovered branch through the public behavior. Never add coverage-ignore comments and never exclude files to raise the numbers.

Server code: test through the API with a testing module and the contract client.

```ts
const app = await Test.createTestingModule({
  imports: [AppModule],
  ...appOptions,
  logger: new JsonLogger({ level: 'silent' }),
}).compile();
const api = createClient({ users }, { baseUrl: '/api', fetch: app.fetch });
expect(await api.users.get({ params: { id: 'missing' } })).toMatchObject({
  ok: false,
  error: { code: 'USER_NOT_FOUND', status: 404 },
});
await app.close();
```

`Test` comes from `@vibejs-org/server/testing`, `createClient` from `@vibejs-org/contract`.

UI code: mount the component with `mount()` from `@vibejs-org/ui/testing`, pass the router with `plugins: [router]` and `createMemoryHistory()`, and give the API client a fake `fetch` that returns each response the component handles. Await `flushPromises()` before reading the DOM.

## 3. Repeat until clean

Run `vibejs check --json` again. Repeat steps 1 and 2 until no `VIBE8302` is left and it exits 0.

## 4. Keep it at 100%

`VIBE8302` is a warning, so `vibejs check` still passes below 100%. To make it a failure, uncomment this line in `vitest.config.ts`, with the user's agreement:

```ts
// thresholds: { 100: true, perFile: true },
```
