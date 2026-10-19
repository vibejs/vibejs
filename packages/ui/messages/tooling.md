# Tooling

## VIBE5900: Tooling module executed

> @vibejs-org/ui/tooling only declares types for .vibe type checking and cannot run.

`@vibejs-org/ui/tooling` holds the macros and the helpers that the type checker sees in the virtual code of a `.vibe` file. The compiler replaces the macros, so a built app never loads this module.

### Fix

- Import runtime APIs from `@vibejs-org/ui`.
- Call macros only inside a `.vibe` `<script setup>`, where the compiler replaces them.
