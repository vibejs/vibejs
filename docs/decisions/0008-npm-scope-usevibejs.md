# 0008. npm scope `@usevibejs`

- Status: Accepted
- Date: 2026-10-21

## Context

[0005](0005-packages-naming-versioning.md) chose the npm scope `@vibejs-org`. Before any package was published, the maintainers created the npm organization and settled on a final scope. The scopes closest to the project name are not available: `@vibejs`, `@vibe-js` and `@vibe.js` are already taken on npm, and `@vibe.js/*` belongs to a different project.

## Decision

- The npm scope is `@usevibejs`. The packages are `@usevibejs/errors`, `@usevibejs/ui`, `@usevibejs/compiler`, `@usevibejs/language-tools`, `@usevibejs/contract`, `@usevibejs/server` and `@usevibejs/cli`.
- Every other name stays: the CLI binary `vibejs`, the scaffolder `create-vibejs`, the repository `github.com/vibejs/vibejs` and the docs domain `vibejs.org`.
- The package disambiguation line also states that vibe.js is not the `@vibe.js/*` packages.

## Consequences

- Imports, manifests, templates, docs and the generated `AGENTS.md` block use `@usevibejs`. Nothing was published under the old scope, so no user has to migrate.
- The `@vibe.js/*` scope is one character away from the project name, so agents and users are told explicitly that it is a different project.

## Alternatives considered

- **Keep `@vibejs-org`.** Valid, but the maintainers chose `@usevibejs` as the scope they own and publish under.
- **`@vibejs`, `@vibe-js`, `@vibe.js`.** Taken on npm.
