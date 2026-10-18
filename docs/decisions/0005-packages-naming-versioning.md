# 0005. Package layout, naming and versioning

- Status: Accepted
- Date: 2026-10-18

## Context

The obvious npm names for the project were taken by unrelated packages: the unscoped `vibejs`, `vibe.js` and `vibe`, and the scopes `@vibe` (monday.com's Vibe design system) and `@vibejs`. The `vibe` command is also used by an unrelated, widely installed CLI. Coding agents tend to guess package names, so a near miss installs an unrelated package. Users also need a small, predictable set of packages that upgrade together.

## Decision

- **Packages.** Eight npm packages: `@vibejs-org/errors`, `@vibejs-org/ui`, `@vibejs-org/compiler`, `@vibejs-org/language-tools`, `@vibejs-org/contract`, `@vibejs-org/server`, `@vibejs-org/cli` and the unscoped scaffolder `create-vibejs`. A new package is added only when code needs it.
- **Names.** The npm scope is `@vibejs-org`, the CLI binary is `vibejs` (never `vibe`), the scaffolder runs as `npm create vibejs@latest`, the repository is `github.com/vibejs/vibejs` and the docs live at `vibejs.org`. The README, the docs and the generated `AGENTS.md` state that vibe.js is not monday.com Vibe (`@vibe/*`) and not the npm packages `vibejs` or `vibe.js`.
- **Versioning.** All npm packages are one Changesets `fixed` group and always share a version. Internal dependencies are published as exact versions. The VS Code extension is versioned on its own. `./internal` and `./tooling` subpaths carry no semver promise. Until v0.1.0 there are no per-change changesets; v0.1.0 ships with a single initial-release changeset.
- **Format and runtime.** Packages are ESM only, with `sideEffects: false` and no top-level await, and support Node `^24.15.0 || >=26`. Node 22 reaches end of life before v0.1.0, and `require(esm)` is stable from Node 24.15, so CommonJS consumers can still load the packages.
- **Repository.** A pnpm workspace; every dependency version lives in a pnpm catalog, and every published manifest is checked by `lint-repo` (license, engines, repository fields, a copy of the root LICENSE).

## Consequences

- Users never need to align versions across vibe.js packages; one version identifies the whole framework.
- A breaking change in any package bumps all of them.
- Exact package names and commands appear in every agent-facing document, which reduces wrong installs.

## Alternatives considered

- **Independent versions per package.** Fewer empty releases, but users and tools would need a compatibility matrix; the compiler and runtime already require matching versions.
- **Other scopes or a new brand name.** Several alternatives were available. `@vibejs-org` mirrors the docs domain vibejs.org and stays close to the `vibejs` GitHub organization.
- **Dual ESM and CommonJS builds.** Wider compatibility with old toolchains, at the cost of two module graphs and dual-package hazards; the supported Node versions load ESM from CommonJS.
