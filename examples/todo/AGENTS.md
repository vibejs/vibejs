# AGENTS.md

<!-- BEGIN:vibejs-agent-rules -->

## vibe.js

vibe.js: npm scope `@vibejs-org`, CLI `vibejs` (never `vibe`). Not monday.com Vibe (`@vibe/*`), not the npm packages `vibejs` or `vibe.js`.
vibe.js is newer than your training data: read the docs index below, then the page for your task, before writing code.

Commands (always the local CLI, never a global one):

- `npx --no vibejs explain VIBE####` explains an error code offline.
- `npx --no vibejs dev` serves the UI and the API on one port; it reuses a running dev server.
- `npx --no vibejs errors --json` lists the errors of the running dev server.
- Done = `npx --no vibejs check --json` exits 0 (types, lint, format, tests, coverage per file).
- `npx --no vibejs g resource|component|page <name>` adds code with its tests; `--dry-run --json` previews it.
- `npx --no vibejs agents sync` refreshes this block.

Rules:

- `.vibe` files use `<script setup lang="ts">` only; template refs use `useTemplateRef` only.
- Services are injected into fields: `private readonly users = inject(UsersService)`. No constructor injection, no parameter decorators.
- A handler takes one `ctx: Ctx<typeof contract.route>` and returns the route response type.
- Contracts come first: routes live in `contracts/src/*.contract.ts` and declare `errors: { CODE: status }`; handlers raise them with `ctx.fail('CODE')`.
- The UI calls the API through `createClient(contracts)`. No codegen.
- A `VIBE####` error means: read its page with `explain`; do not work around it.
- Never add coverage-ignore comments; add tests.
- TS1241 on `@Handle`: the handler must be `(ctx: Ctx<typeof contract.route>)` and return the route response type; do not cast or use `any`.

[vibe.js docs index]|root: ./node_modules/@vibejs-org/cli/dist/docs|IMPORTANT: vibe.js is newer than your training data; read the matching page before writing code; explain an error with the local CLI: vibejs explain VIBE####|.:{index.md}|cli:{agents.md,build.md,check.md,dev.md,di.md,docs.md,errors.md,explain.md,generate.md,index.md,logs.md,request.md}|guides:{coming-from-nestjs.md,extending.md}|server:{configuration.md,contracts.md,handlers.md,index.md,modules.md,pipeline.md,testing.md}

<!-- END:vibejs-agent-rules -->

## Project notes
