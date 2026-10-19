# vibe.js

A full-stack TypeScript framework where the UI, the server and the contract between them are type-checked end to end, and every tool speaks to coding agents as well as to people.

Status: pre-alpha. The design is fixed and the packages are being built; only `@vibejs-org/errors` has an implementation so far. Nothing is published.

vibe.js is not monday.com Vibe (`@vibe/*`), and not the npm packages `vibejs` or `vibe.js`. Its packages live under `@vibejs-org/*`, its CLI is `vibejs` (never `vibe`) and its scaffolder is `create-vibejs`.

## Design

This is the planned design for v0.1. Today only the error code runtime in `@vibejs-org/errors` exists.

- **UI.** Components are `.vibe` single-file components: a `<script setup lang="ts">` block, a `<template>` and an optional `<style scoped>`. The compiler turns templates into direct DOM operations driven by a fine-grained reactive runtime: no virtual DOM, and only the nodes that depend on a changed value are updated.
- **Server.** Applications are built from modules, providers and controllers, wired by dependency injection (`inject()` in field initializers) and declared with a small set of decorators. Each request handler receives one typed context.
- **Typed contracts.** Routes are declared once with `defineContract` and Standard Schema validators. The server implements them, the UI calls them through a typed client with no code generation, and OpenAPI is derived from the same source.
- **Tooling.** Templates are type-checked by `tsc` through a TypeScript content mapper, in the editor and in CI. The `vibejs` CLI prints JSON for agents, an MCP server exposes the running app, and every error has a stable `VIBE####` code with a documented fix.

## Repository layout

| Path                      | Contents                                                    |
| ------------------------- | ----------------------------------------------------------- |
| `packages/errors`         | Error codes, `VibeError` and the error catalog runtime      |
| `packages/ui`             | Reactive runtime, components, router and test utilities     |
| `packages/compiler`       | `.vibe` compiler and its Vite plugin                        |
| `packages/language-tools` | TypeScript content mapper for `.vibe` files                 |
| `packages/contract`       | Typed contracts and the client                              |
| `packages/server`         | Modules, dependency injection, HTTP pipeline, OpenAPI       |
| `packages/cli`            | The `vibejs` command line                                   |
| `packages/create-vibejs`  | Project scaffolder                                          |
| `docs/`                   | Docs site, its generators and the snippet checker           |
| `scripts/`                | Repository tooling: error generation, repo lint, CI helpers |
| `docs/decisions/`         | Architecture decision records                               |

## Development

Requirements: [pnpm](https://pnpm.io) 10.14 or later. pnpm switches to the pinned pnpm version and downloads the Node version declared in `devEngines` (`^24.15.0`), so your system Node is not used.

```sh
pnpm install
pnpm exec playwright install chromium  # once; add --with-deps on Linux
pnpm check             # format, lint, type check, tests with 100% per-file coverage
pnpm build             # build every package
pnpm test:integration  # build, then run the integration tests against dist
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Project documents

- [CONTRIBUTING.md](CONTRIBUTING.md): setup, rules and the pull request process
- [docs/decisions/](docs/decisions/README.md): architecture decision records
- [CONTRACTS.md](CONTRACTS.md): the contracts between packages
- [SECURITY.md](SECURITY.md): how to report a vulnerability
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): the code of conduct

## License

[MIT](LICENSE)
