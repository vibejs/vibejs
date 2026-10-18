# 0006. Quality gates: coverage and stable error codes

- Status: Accepted
- Date: 2026-10-18

## Context

A framework's defects surface in every application built on it, and its error messages are read by people and coding agents who did not write the code. Coverage thresholds that average over the codebase let untested branches hide in large files, and free-form error text cannot be looked up, linked or tested.

## Decision

### Coverage of framework code

- Framework code is held to 100% per-file coverage of statements, branches, functions and lines, measured with V8 coverage. This covers `packages/*/src`, the scaffolder entry point, repository scripts and docs scripts.
- The only coverage ignore hint is `/* v8 ignore next|if|else|start|stop -- @preserve <reason> */`, and each one needs a matching `{ file, reason }` entry in `coverage-ignores.json`. Code forked from an upstream project may keep unreachable defensive branches only with an `upstream-defensive:` reason. A test, or deleting the unreachable branch, is preferred over a hint.
- `pnpm check` is the single local and CI gate: generated files are fresh, formatting, type checks, oxlint, `lint-repo`, knip and tests with coverage.

### Coverage of user applications

- Generators create tests next to the code they generate.
- `vibejs check` reports coverage per file. Below 100% is a warning (`VIBE8302`), not a failure.
- The project template contains a commented one-line opt-in to enforce `{ 100: true, perFile: true }`.

### Error codes and the error catalog

- Every error the framework raises has a stable code `VIBE####`, a one-sentence message that names the values involved, a list of fixes and a documentation URL (`https://vibejs.org/v0/errors/<code>`).
- Code ranges are assigned per package in `CONTRACTS.md`. A code is never reused; a retired code keeps its documentation page.
- The catalog source is Markdown, `packages/<pkg>/messages/*.md`. `pnpm errors` generates the typed `vibeError()` factory of each package, the CLI catalog used by `vibejs explain` and the documentation pages. `pnpm errors --check` fails on range, format and freshness problems, and on any code that is not thrown in source and asserted in a test.
- Compiler diagnostics are collected with positions, never thrown. In production builds the UI prints only the code and the URL.
- From v0.1.0 on, the set of codes is recorded in an append-only lock file.

## Consequences

- Every branch of framework code has a test that exercises it, which makes refactoring safe and keeps dead code out.
- Some code needs more test effort, and ignore hints are visible and reviewable instead of silent.
- Errors are searchable, linkable and explainable offline, and agents can act on the listed fixes.
- Adding an error means editing a Markdown entry first, which keeps messages and docs in one place.

## Alternatives considered

- **A global coverage threshold below 100%.** Cheaper to reach, but the uncovered remainder concentrates in the code that is hardest to test.
- **Enforcing 100% coverage in user applications by default.** Consistent with the framework's own policy, but too strict as a default for applications; it is offered as an opt-in.
- **Error codes defined only in TypeScript source.** No extra file format, but the documentation would be written separately and drift from the messages.
