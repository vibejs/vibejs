# 0001. Own UI runtime, compiler and language tooling

- Status: Accepted
- Date: 2026-10-18

## Context

vibe.js needs a UI layer whose templates are fully type-checked, whose compiled output is small and fast, and whose errors, compiler output and editor tooling share one design. Those parts are tightly coupled: the compiler emits calls into the runtime, the language tools must type-check templates exactly as the compiler interprets them, and every error they raise belongs in one catalog. Depending on another project for any of these layers would tie the framework to that project's internal interfaces, release cadence and TypeScript support.

## Decision

- Components are `.vibe` single-file components: `<script setup lang="ts">`, a `<template>` with directives and an optional `<style scoped>`. Templates are type-checked in the editor and in CI.
- The reactive core is fine-grained (signals with automatic dependency tracking, computed values, effects grouped into effect scopes, and a scheduler that runs parent updates before child updates).
- The DOM runtime has no virtual DOM. The compiler turns each template into a cloned static DOM fragment plus one effect per dynamic binding. Lists are keyed, and each block owns an effect scope that is disposed with it.
- vibe.js owns the compiler (`@usevibejs/compiler`), its Vite plugin with hot module replacement, and the language tools (`@usevibejs/language-tools`, a TypeScript content mapper, see [0004](0004-typescript-7-toolchain.md)).
- The compiler and runtime meet at a versioned ABI (`@usevibejs/ui/internal`); the compiler and language tools share one parser and script analysis.
- For well-specified sub-problems with mature MIT-licensed implementations (HTML tokenizing, the template parser and AST, scoped CSS rewriting, the signal propagation algorithm), the code is forked with an `// Upstream:` header and credited in `THIRD-PARTY-NOTICES.md`.
- v0.1 renders on the client only.

## Consequences

- The runtime, compiler, type contract and error codes can be designed together and changed in lockstep, and the whole stack is held to the same coverage gate ([0006](0006-quality-gates.md)).
- The project carries the full cost of a runtime, a compiler and language tools, which is the largest part of the v0.1 effort.
- Features that a fine-grained runtime does not support are compile errors from the first release, so they cannot leak into user code and block later changes.
- Server-side rendering and hydration, render functions and JSX are not in v0.1.

## Alternatives considered

- **Build the UI on an existing framework's runtime and compiler packages.** Less code to write and a proven runtime. It would bind the template type contract, the compiled output and the release schedule to another project's internals, and its editor tooling depended on the TypeScript JS API that TypeScript 7.0 does not ship.
- **Components written in plain `.ts`/`.tsx` (JSX).** Type-checks natively with TypeScript 7.0 and needs no language tools. A template language gives the compiler static structure to analyze, which the fine-grained output relies on, and keeps markup, logic and styles in one file.
- **A virtual DOM renderer.** Simpler to implement and to interoperate with render functions, but it ships more runtime code and does more work per update than direct, binding-level DOM updates.
