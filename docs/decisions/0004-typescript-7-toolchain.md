# 0004. TypeScript 7 toolchain and content-mapper type checking

- Status: Accepted
- Date: 2026-10-18

## Context

As of 2026-10-18, the stable TypeScript is 7.0.2, the native compiler released on 2026-07-08. It has no JavaScript API and loads no language-service plugins, which is how template type checkers for single-file components have traditionally worked. TypeScript 7.1 adds content mappers: `tsc` and its language server start an external process that turns a custom file type into TypeScript plus span maps, and report diagnostics, hover, definitions and other features at the original positions. Content mappers are available in 7.1 nightlies; the 7.1 stable release is planned for 2026-11-24, and the TypeScript team has committed to backward-compatible protocol changes during 7.x.

A prototype content mapper run against a pinned 7.1 nightly confirmed that `tsc -b --runExternalCode` reports template type errors at exact `.vibe` line and column positions, that the language server serves hover, definitions and diagnostics for `.vibe` files, and that mapper error codes render as `VIBE####`.

## Decision

- The repository builds and type-checks with TypeScript 7.0 (`tsc -b`, pinned in the pnpm catalog), together with Vite 8, Vitest 5, tsdown, oxlint and oxfmt.
- `.vibe` files are type-checked by `@usevibejs/language-tools`, a TypeScript 7.1 content mapper. CI type-checks applications with `tsc -b --runExternalCode`; there is no separate type-checking CLI. Editors get the same results through the TypeScript language server, and a VS Code extension registers the mapper.
- Until 7.1 is stable, the packages that need content mappers (language tools, the VS Code extension, the CLI, examples and docs) use a separate `catalog:ts-next` entry: an exact 7.1 nightly at least three days old. A non-blocking CI job runs the repository against the newest nightly that passes the repository's three-day release-age policy to catch protocol changes early.
- When 7.1.x stable has been out for at least three days, one change moves the whole repository to it and removes `catalog:ts-next`.
- If no stable 7.1 exists by 2027-01-31, an adapter for the TypeScript 6 JavaScript API is built around the same code generation.
- The code generation is host-agnostic: one function from `.vibe` text to TypeScript, span maps and diagnostics, written to content-mapper constraints (strict mode only, no suppression comments in generated code, UTF-16 offsets).

## Consequences

- Applications use the current TypeScript compiler and its speed, with no second TypeScript version installed.
- Template type checking depends on a feature that is not yet in a stable release; the separate catalog and the nightly CI job contain that risk until 7.1 ships.
- Any editor with a TypeScript 7.1 language server can type-check `.vibe` files.

## Alternatives considered

- **A language-service plugin on the TypeScript 6 JavaScript API.** A mature and well-documented approach today, but it requires staying on TypeScript 6, and TypeScript 7 editors load no such plugins. It remains the fallback above.
- **Plain `.ts`/`.tsx` components only.** Works with TypeScript 7.0 today with no extra tooling, but gives up single-file components ([0001](0001-own-ui-runtime-and-tooling.md)).
- **A custom type-checking CLI.** Needed only when the compiler cannot load external mappers; with content mappers, `tsc` itself is the checker.
