# Contributing to vibe.js

Thank you for contributing. Read `AGENTS.md` for the short version of the rules, and read `CONTRACTS.md` and the decision records in [`docs/decisions/`](docs/decisions/README.md) before changing anything that crosses packages. By participating you agree to follow the [code of conduct](CODE_OF_CONDUCT.md). Report security problems privately as described in [`SECURITY.md`](SECURITY.md).

For a bug, open an issue with a minimal reproduction. For a feature or a change to a cross-package contract, open an issue first so it can be discussed; a change to a binding decision needs a new decision record.

## Setup

1. Install pnpm 10.14 or later, the first version that downloads the Node version declared in `devEngines.runtime`. pnpm reads `packageManager` from `package.json` and switches to the pinned pnpm 12.
2. Run `pnpm install`. pnpm downloads the Node version pinned by `devEngines` (`^24.15.0`) and runs every `pnpm` script with it. Your system Node is not used.
3. Run `pnpm exec playwright install chromium` once (on Linux, add `--with-deps`). `pnpm check` runs the browser tests in Chromium.
4. Only for bare `node` commands (such as `node scripts/pr-meta.ts`), use Node 24 yourself: `nvm install` reads `.nvmrc`.

## Commands

| Command                                  | What it does                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                             | The local gate: `pnpm errors --check`, `oxfmt --check`, `pnpm lint`, `pnpm test:coverage`                                                                                                                                                                                        |
| `pnpm lint`                              | `tsc -b`, type-aware oxlint, `scripts/lint-repo.ts` and knip                                                                                                                                                                                                                     |
| `pnpm typecheck`                         | `tsc -b` with TypeScript 7.0.2, including the `*.test-d.ts` files                                                                                                                                                                                                                |
| `pnpm test`                              | Vitest, node and dom projects (watch mode; add `--run` for one run)                                                                                                                                                                                                              |
| `pnpm test:coverage`                     | Vitest node, dom and browser projects with the 100% per-file gate                                                                                                                                                                                                                |
| `pnpm test:integration`                  | `pnpm build`, then the integration project against `dist`                                                                                                                                                                                                                        |
| `pnpm e2e [--no-browser]`                | Packs the packages and runs the docs tutorial, an npm app and `examples/todo` in browsers                                                                                                                                                                                        |
| `pnpm build`                             | tsdown, publint and attw for every package                                                                                                                                                                                                                                       |
| `pnpm fmt`                               | Formats the repo with oxfmt                                                                                                                                                                                                                                                      |
| `pnpm errors`                            | Regenerates the error files from `packages/*/messages/*.md`                                                                                                                                                                                                                      |
| `pnpm run docs`                          | `pnpm build`, then the docs site: error pages, CLI reference, snippet check, `llms.txt`                                                                                                                                                                                          |
| `node scripts/use-ts-next.ts [version]`  | Pins the TypeScript catalogs and the template to the newest 7.1 nightly at least `minimumReleaseAge` old, or to the given version                                                                                                                                                |
| `node scripts/agent-eval.ts [--dry-run]` | Maintainers: runs the agent evaluation (paid agent runs; `--dry-run` checks the setup and graders only). Results go to the gitignored `.planning/evals/`. Usage, cost, prerequisites (`claude` and `codex` logged in), isolation and the results layout are in the script header |

## Tests and coverage

- Vitest projects are chosen by file suffix: `*.test.ts` (node, or jsdom under `packages/ui`), `*.browser.test.ts` (Chromium), `*.integration.test.ts` and `*.vibe.test.ts` (after the build, outside coverage). `*.test-d.ts` files are type tests checked by `tsc -b`.
- Tests sit next to the code in `src`. Helpers and fixtures go in `packages/<pkg>/test/`, outside the coverage include.
- Coverage is 100% per file (statements, branches, functions, lines) for `packages/*/src`, `packages/create-vibejs/bin.js`, `scripts/**/*.ts` (except `scripts/e2e.ts` and `scripts/agent-eval.ts`) and `docs/scripts`.
- Prefer a test, or deleting the unreachable branch, over an ignore hint. Deleting code is allowed only for compat, browser and base-mode branches of forked code.
- The only allowed hint is `/* v8 ignore next|if|else|start|stop -- @preserve <reason> */`. Each one needs an entry `{ "file": "<path>", "reason": "<reason>" }` in `coverage-ignores.json`, and an entry without its hint fails. In forked upstream code the reason starts with `upstream-defensive:`. New allowlist entries need maintainer approval in review.
- `__DEV__` is a real global: `packages/ui/vitest.setup.ts` sets it to `true` and a test toggles it with `vi.stubGlobal('__DEV__', false)`. Read it only inside function bodies in `packages/ui/src`.

`scripts/lint-repo.ts` enforces what oxlint and tsc cannot: the ignore hints, the `__DEV__` and decorator scope, dependency specs, tsconfig references, published manifests and LICENSE copies, `// Upstream:` headers against `THIRD-PARTY-NOTICES.md` (project, commit and file), the paths the notices name, third-party `alwaysBundle` entries, the `.nvmrc` pin, English-only text, and public-text hygiene (no local paths, no email addresses outside an allowlist, no positioning of vibe.js relative to other frameworks). Each finding is one `file:line:col rule message` line.

## Pull requests

- The PR title is a Conventional Commits title (`type(scope)!: summary`, with type `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore` or `revert`). The `pr-meta` CI job checks it, because the squash merge uses it as the commit message.
- Everything is English: code, comments, docs, error messages, commit messages and PR titles.
- Fill in the PR template: what the change does and, for each acceptance criterion, the test or command that proves it.
- A PR merges after green required CI and a maintainer review.
- By submitting a pull request you agree that your contribution is licensed under the [MIT License](LICENSE) of this repository.

## Merging

- `main` is protected, and PRs merge one at a time.
- Before merging, rebase on `main`, then run `pnpm install && pnpm errors && pnpm build` and commit the regenerated files.
- The `@usevibejs/ui` export map is fixed. `CONTRACTS.md` changes only through a maintainer-approved PR, and a change to a binding decision adds a record in `docs/decisions/`.
- Only maintainers publish packages or create remote resources (repositories, packages, extensions).

## Releases

- The 8 npm packages version together (one changesets `fixed` group).
- There are no per-PR changesets before v0.1.0. v0.1.0 ships with a single "Initial release" changeset, added when the release is prepared.
- After v0.1.0, every PR with a user-visible change adds a changeset with `pnpm changeset`.
- The CI `build` job runs `pnpm pack-check`: it packs every public package and checks that the tarball holds only built output, `README.md`, `LICENSE` and the notices, that every entry point exists, and that dependency specs are resolved.

### Release runbook (maintainers)

`.github/workflows/release.yml` runs only when a maintainer dispatches it from `main`. It publishes through npm trusted publishing (OIDC) with provenance and holds no npm token.

One-time setup:

1. Create the npm organization `@usevibejs`.
2. Create a GitHub App with contents and pull-requests write access, install it on the repository, and add its client ID as the `RELEASE_APP_CLIENT_ID` repository variable and its private key as the `RELEASE_APP_PRIVATE_KEY` secret. The release PR is opened with the App's token, so that CI runs on it.
3. Bootstrap: a trusted publisher can only be bound to a package that exists. Publish the real 0.1.0 builds of the 8 packages once with a short-lived npm token and `--tag next` (v0.1 ships on `next` until TypeScript 7.1 is stable), check `npm dist-tag ls` for each package, bind each package's trusted publisher to `vibejs/vibejs` and `release.yml`, set each package to "require two-factor authentication and disallow tokens", and revoke the token.

Every release after that:

1. Merge the PRs with their changesets.
2. Dispatch the Release workflow. It opens or updates the "chore: release" PR, which bumps the versions and changelogs.
3. Merge the "chore: release" PR.
4. Dispatch the Release workflow again. With no pending changesets it publishes the new versions.

The VS Code extension releases on its own: bump the version in `packages/vscode/package.json`, merge, and push a `vscode-v<version>` tag. `.github/workflows/vscode.yml` publishes it to the Visual Studio Marketplace and Open VSX with the `VSCE_PAT` and `OVSX_PAT` secrets.

## Upgrading forked code

`packages/compiler` and `packages/ui` contain files derived from other projects. Each one starts with an `// Upstream: <repo>@<sha> <path> (<license>)` header. Each forked compiler source also lists its `Edits to re-apply on an upgrade:` in that header, and `scripts/lint-repo.ts` requires the list there; the forked UI sources do not carry the list yet. To move a fork to a new upstream release:

1. For each file listed in the package's `THIRD-PARTY-NOTICES.md`, diff the upstream path between the pinned commit and the new release tag.
2. Apply the upstream changes, then re-apply every edit listed in the file's header. Update the list when an edit changes or is no longer needed.
3. Update the commit SHA in each header and the version and commit in `THIRD-PARTY-NOTICES.md`. `scripts/lint-repo.ts` fails while a header's commit or file is missing from its project's section of the notices.
4. Port the upstream changes to the ported specs (the test files listed in the notices) and run `pnpm check`.
5. Re-check every `upstream-defensive:` entry in `coverage-ignores.json`: delete the hint and its entry when the branch is gone or now covered.

## Dependencies

- Dependabot opens one weekly PR for npm updates. `oxc-parser` is a group of its own, so a parser bump is tested alone.
- `oxc-parser` is on 0.x, where the caret range of the catalog admits patches only. A minor bump is made by hand: edit its range in the `catalog` of `pnpm-workspace.yaml`, run `pnpm install`, and merge only with green `test` and `integration` jobs.

## Error messages

Every error a package throws has a code (`VIBE####`) and an entry in `packages/<pkg>/messages/*.md`. `pnpm errors` turns those files into the typed `vibeError()` of the package, the CLI catalog and the docs pages. `pnpm check` runs `pnpm errors --check`.

### Entry format

````md
# Dependency injection

## VIBE9101: Missing provider

> No provider for {token} in module {module}.

Prose that explains the error. It appears only in the docs, never in runtime code.

### Fix

- Add {token} to `providers` in the `@Module()` of {module}.
- Import a module that exports {token}.

### Example

```ts
// optional
```
````

- One `## VIBE####: Title` heading per entry.
- Exactly one `>` message line, right after the heading: one concrete sentence that names the values involved.
- At least one paragraph of prose follows the message line and explains when the error happens.
- `### Fix` with at least one bullet. Write each fix as an imperative alternative ("Add …", "Import …").
- `### Example` is optional.
- Placeholders are `{camelCase}`. Every placeholder becomes a required, type-checked argument.
- To retire an entry, append `(retired)` to its title. The docs page stays and the runtime entry goes away. A code is never reused.

### Code ranges

A code outside its package's ranges fails `pnpm errors --check`. Unlisted sub-ranges are reserved until they are assigned in `CONTRACTS.md` (section C2).

| Package dir    | Ranges                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| errors         | 0001–0999                                                                                                 |
| compiler       | 1000–4999 (compiler 1000–4899, compiler/vite 4900–4999)                                                   |
| ui             | 5000–5999 (runtime 5000–5899, ui/tooling 5900–5999), 7000–7999 (router 71xx, testing 72xx, useAsync 73xx) |
| language-tools | 6000–6099, 6200–6999                                                                                      |
| vscode         | 6100–6199                                                                                                 |
| cli            | 8000–8099, 8200–8999                                                                                      |
| create-vibejs  | 8100–8199                                                                                                 |
| contract       | 9000–9099                                                                                                 |
| server         | 9100–9899                                                                                                 |

### Workflow

1. Add or edit the entry in `packages/<pkg>/messages/*.md`.
2. Run `pnpm errors`. It regenerates `packages/<pkg>/src/errors.gen.ts` (committed) and the CLI catalog (not committed).
3. Throw it: `throw vibeError('VIBE9101', { token, module })`. The code autocompletes and the arguments are type-checked.
4. Test it: `expect(() => run()).toThrow(expect.objectContaining({ code: 'VIBE9101' }))`, or `expect(error).toMatchObject({ code: 'VIBE9101' })`.

`pnpm errors --check` fails when a live code has no `'VIBE####'` literal in a non-test source file of its package, or none in a `*.test.ts` of that package.

To warn instead of throwing, ui uses `warn(vibeError(…))` (dev only, routed to `app.config.warnHandler`) and server uses `logger.warn`.
