# AGENTS.md

vibe.js: npm scope `@usevibejs`, CLI `vibejs` (never `vibe`). Not monday.com Vibe (`@vibe/*`), not the `@vibe.js/*` packages (a different project), not the npm packages `vibejs` or `vibe.js`.

## Before work

- Read `CONTRACTS.md` and the decision records in `docs/decisions/` that touch the change.

## Done

- `pnpm check` exits 0 and `pnpm build` leaves no diff. Also run `pnpm test:integration` when integration tests change.

## Rules

- English only: code, comments, strings, docs, error messages, commit messages and PR titles.
- Tests: `*.test.ts` next to the code in `src`; `*.browser.test.ts` runs in Chromium; `*.integration.test.ts` and `*.vibe.test.ts` run after the build; `*.test-d.ts` is checked by `tsc -b`. Helpers and fixtures go in `packages/<pkg>/test/`.
- Imports: relative imports end in `.ts`; other packages are imported by name (`@usevibejs/errors`), never by their `src`. No default exports (config files excepted).
- Errors: add the entry to `packages/<pkg>/messages/*.md`, run `pnpm errors`, throw `vibeError('VIBE####', args)`, assert the code in a test.
- Coverage is 100% per file. The only ignore hint is `/* v8 ignore next|if|else|start|stop -- @preserve <reason> */`, and it needs a `{ file, reason }` entry in `coverage-ignores.json`. Forked upstream code uses `upstream-defensive:` reasons.
- `__DEV__` is read only inside function bodies and only in `packages/ui/src`. Tests toggle it with `vi.stubGlobal('__DEV__', false)`.
- Decorators: legacy decorators only in `packages/server/src` (and example/template servers). Never `emitDecoratorMetadata` or `reflect-metadata`.
- Dependencies: every spec is `catalog:` (versions live in `pnpm-workspace.yaml`) or `workspace:*`. `catalog:ts-next` is only for language-tools, vscode, cli, examples and docs.
- TypeScript: `pnpm typecheck` (`tsc -b`) runs 7.0.2. Only `catalog:ts-next` consumers run the 7.1 nightly.
- Public text: no local paths, no personal data, and describe vibe.js on its own terms; `scripts/lint-repo.ts` enforces this.

## Git

- PR titles are Conventional Commits (`feat(ui): add ref`); the squash merge uses them.
- Before merging: rebase, then `pnpm install && pnpm errors && pnpm build`.
- `CONTRACTS.md` changes only through a maintainer-approved PR. No per-PR changesets before v0.1.0.
- Never publish or create remote resources (repos, orgs, packages, extensions).
