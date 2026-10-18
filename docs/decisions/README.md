# Architecture decision records

This folder records the decisions that shape vibe.js: what was decided, why, and what it costs. Each record has Status, Date, Context, Decision, Consequences and Alternatives considered (a lightweight ADR format). `CONTRACTS.md` holds the exact cross-package interfaces that follow from these decisions.

| No.                                           | Decision                                                           | Status   |
| --------------------------------------------- | ------------------------------------------------------------------ | -------- |
| [0001](0001-own-ui-runtime-and-tooling.md)    | Own UI runtime, compiler and language tooling                      | Accepted |
| [0002](0002-legacy-decorators-and-di.md)      | Legacy TypeScript decorators without metadata, field `inject()` DI | Accepted |
| [0003](0003-contract-first-typed-bridge.md)   | Contract-first typed client/server bridge with Standard Schema     | Accepted |
| [0004](0004-typescript-7-toolchain.md)        | TypeScript 7 toolchain and content-mapper type checking            | Accepted |
| [0005](0005-packages-naming-versioning.md)    | Package layout, naming and versioning                              | Accepted |
| [0006](0006-quality-gates.md)                 | Quality gates: coverage and stable error codes                     | Accepted |
| [0007](0007-ai-agent-developer-experience.md) | AI-agent developer experience                                      | Accepted |

## Proposing a decision

1. Open an issue that describes the problem and the options, so the discussion happens before the write-up.
2. Copy the structure of an existing record into `NNNN-short-title.md`, using the next free number, with `Status: Proposed`.
3. Fill in Context, Decision, Consequences and Alternatives considered. State facts with their source and date, and describe alternatives on their merits.
4. Open a pull request that adds the record and its row in the table above. If the decision changes a cross-package interface, update `CONTRACTS.md` in the same pull request.
5. Maintainers accept the record by merging it with `Status: Accepted`.

Accepted records are not rewritten. To change a decision, add a new record and set the old one to `Superseded by NNNN`.
