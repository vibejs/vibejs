# 0002. Legacy TypeScript decorators without metadata, field `inject()` DI

- Status: Accepted
- Date: 2026-10-18

## Context

The server is organized into modules, providers and controllers, declared with decorators and wired by dependency injection. Decorators need a transform before any current runtime can execute them. As of 2026-10-18:

- TC39 moved the Decorators proposal, and Decorator Metadata with it, back from Stage 3 to Stage 2.7 at the 2026-05-19 plenary, citing spec issues, incomplete test262 coverage and no shipping engine.
- No JavaScript engine ships standard decorators, and Node.js type stripping cannot run a file that contains decorators.
- Oxc, which compiles TypeScript inside Vite 8, Vitest 5 and tsdown, does not lower standard decorators; it passes them through unchanged.
- Legacy decorators (`experimentalDecorators`) are emitted by TypeScript 7.0 and lowered by Oxc, SWC and esbuild. TypeScript has stated no plan to deprecate `experimentalDecorators` or `emitDecoratorMetadata`.
- `emitDecoratorMetadata` is only partly supported outside `tsc`, and the metadata it relies on disappears when an injected class is imported with `import type`.

## Decision

- The server uses legacy decorators (`experimentalDecorators: true`), only in server code. `emitDecoratorMetadata` and `reflect-metadata` are never used.
- The decorator set is small: `@Module`, `@Controller`, `@Handle`, `@UseGuards`, `@UseInterceptors`, `@UseFilters`, and decorators created with `createMetadata()`. There is no `@Injectable`: listing a class in `providers` registers it.
- Dependencies are injected in field initializers with `inject(Token)`, for example `private readonly db = inject(Db)`. Tokens are classes or typed tokens created with `token<T>()`; there are no string tokens.
- Providers and controllers have no constructor parameters. This is a type error, and a coded error at bootstrap.
- There are no parameter decorators. A handler receives one typed context (`ctx`) that carries the validated params, query, headers and body of its route.
- `@Handle(route)` is typed against the route, so a handler whose signature does not match it fails to compile (TS1241).
- `lint-repo` rejects decorators outside server code and `emitDecoratorMetadata` anywhere.

## Consequences

- Server code compiles and runs with every tool in the stack, in development, tests and builds, without an extra Babel or SWC pass.
- Dependencies are explicit in the source, so DI works the same under any transpiler and with `import type`.
- Missing providers, dependency cycles and `inject()` outside an injection context are reported at bootstrap with error codes, not at first use.
- When standard decorators reach a stage and tool support that make them usable, the narrow decorator surface and the absence of metadata keep a migration mechanical.

## Alternatives considered

- **Standard (TC39) decorators.** The long-term direction of the language, but at Stage 2.7 they may still change, no engine runs them and the bundled toolchain does not lower them.
- **Legacy decorators with `emitDecoratorMetadata` and constructor injection.** Shorter class definitions, but it depends on emitted type metadata that is incomplete outside `tsc` and silently breaks with type-only imports.
- **No decorators (plain functions and configuration objects).** Works everywhere, but declaring modules, controllers and per-route enhancers on the class keeps related information in one place and gives handler signatures a place to be type-checked.
