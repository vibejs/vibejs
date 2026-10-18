# vibe.js cross-package contracts

Status: **draft**. This file is frozen at the v0.1.0 API freeze. Until then it changes only through maintainer-approved PRs; after the freeze, a change also needs a decision record in `docs/decisions/`.

The executable source of truth is the JSDoc and exported types in `packages/ui/src/internal.ts`, `packages/ui/src/tooling.ts` and each package's `index.ts`. The decisions behind these contracts are recorded in [`docs/decisions/`](docs/decisions/README.md).

## C1 Packages and versions
| Package | Exports |
|---|---|
| @vibejs-org/errors | `.` |
| @vibejs-org/ui | `.` `./internal` `./tooling` `./router` `./testing` |
| @vibejs-org/compiler | `.` `./vite` (named `vibe`) |
| @vibejs-org/language-tools | `.` + package.json `typescript.contentMapper` |
| @vibejs-org/contract | `.` |
| @vibejs-org/server | `.` `./testing` `./openapi` |
| @vibejs-org/cli · create-vibejs | bins (`vibejs`, `create-vibejs`) |

Package rules:
- ESM only; `sideEffects: false`; `engines.node: ^24.15.0 || >=26`.
- No default exports in `.ts`. A `.vibe` module's default export is its component.
- One changesets `fixed` group for every npm package; the VS Code extension is versioned independently.
- Internal deps are published as exact versions.
- `./internal` and `./tooling` carry no semver promise.
- `vibe()` throws VIBE4902 if the `@vibejs-org/ui` version differs from the compiler's.

## C2 Errors
| Range | Package |
|---|---|
| 0001–0999 | errors, repo scripts |
| 1000–4899 | compiler: 10xx SFC, 11xx HTML, 12xx expression, 20–29xx template, 30–33xx script, 40xx style |
| 4900–4999 | compiler/vite: 4901 SSR consumer, 4902 version lock |
| 5000–5899 | ui runtime: 50 reactivity, 51 scheduler, 52 components, 53 app, 54 DOM, 55 HMR |
| 5900–5999 | ui/tooling type contract (defined together with language-tools) |
| 6000–6999 | language-tools (60xx mapper/codegen), VS Code extension (61xx) |
| 7000–7999 | ui/router 71xx, ui/testing 72xx, useAsync 73xx |
| 8000–8999 | cli; create-vibejs owns 81xx |
| 9000–9999 | contract 90xx (client 909x), server 91xx–98xx |

```ts
// @vibejs-org/errors
type ErrorCode = `VIBE${number}`
class VibeError extends Error { code: ErrorCode; fixes: readonly string[]; docs: string; args: Readonly<Record<string, string | number>> }
defineErrors<T>(load: () => T | undefined): VibeErrorFactory<T>   // typed codes + placeholder args
isVibeError(v: unknown, code?: ErrorCode): v is VibeError        // Symbol.for('vibejs.error') brand
docsUrl(code, args?): string;  DOCS_BASE = 'https://vibejs.org/v0/errors/'
```
- **Catalog source:** `packages/<pkg>/messages/*.md`. Each entry is `## VIBE####: Title`, one `>` message with `{camelCase}` placeholders, and `### Fix` bullets. `pnpm errors` generates each package's `src/errors.gen.ts` (committed), `packages/cli/src/catalog.gen.ts` (not committed; regenerated in `prebuild`/`pretest`) and the docs pages. `pnpm errors --check` validates ranges, uniqueness, that every code is thrown in `src` and asserted in a test, and that generated files are fresh.
- **Throwing and warning:** throw with `vibeError(code, args)`. ui warns with `warn(vibeError(...))`, dev only and routed to `warnHandler`. server warns with `logger.warn`.
- **Prod ui message:** `[CODE] url?args`.
- **Compiler diagnostics** are collected, never thrown:
```ts
interface Position { offset: number; line: number; column: number }  // UTF-16 offset 0-based; line/col 1-based
interface Diagnostic { code: ErrorCode; message: string; fixes: readonly string[]; docs: string;
  file: string; start: Position; end: Position; typeChecked?: true }   // typeChecked on 1201–1203, 2001, 2007
```
- **Vite errors:** `this.error({ message: formatDiagnostic(d, src), id, loc, frame, code, plugin: 'vibejs', diagnostics })`.

## C3 Runtime ABI v1 (`@vibejs-org/ui/internal`)
```ts
type Block = Node | Fragment | ComponentInstance | Block[]
type RawProps = Record<string, () => unknown> & { $?: (() => Record<string, unknown>)[] }   // $ = v-bind spreads, last wins
type Slot = (props: Record<string, unknown>) => Block
type RawSlots = Record<string, Slot> & { $?: (() => { name: string; fn: Slot } | null | undefined)[] }
interface ComponentDef {
  name?: string; __file?: string; __hmrId?: string; __scopeId?: string        // 'data-vb-<8hex>'
  __propKeys?: readonly string[]; __emits?: readonly string[]; __defaults?: Readonly<Record<string, () => unknown>>
  inheritAttrs?: boolean
  setup?(props: Record<string, unknown>, ctx: SetupContext): Record<string, unknown> | void
  render($setup: Record<string, unknown>, $props: Record<string, unknown>, $ctx: SetupContext): Block }
template(html: string, ns?: 'svg' | 'math'): () => Node
child(n) next(n) nthChild(n, i) txt(el)
renderEffect(fn: () => void, loc?: string): void        // loc dev only: 'src/A.vibe:12:5'
setText(n, s) setAttr(el, k, v) setProp(el, k, v) setClass(el, v, fallthrough?) setStyle(el, v, fallthrough?)
setHtml(el, v) setDynamicProps(el, sources: Record<string, unknown>[], fallthrough?) toDisplayString(v)
on(el, ev, fn, opts?) withModifiers(fn, mods) withKeys(fn, keys)
insert(b: Block, parent: ParentNode, anchor?: Node | null)
createIf(cond, then, otherwise?) createKeyed(key, render)
createFor<T>(src, render: (item: ShallowRef<T>, key: ShallowRef<unknown>, index: ShallowRef<number>) => Block, getKey)
createComponent(def, props?, slots?, isSingleRoot?) createDynamicComponent(is: () => ComponentDef | null | undefined, props?, slots?, isSingleRoot?)
createSlot(name, props?, fallback?)
applyVShow(el: HTMLElement, get) applyTextModel(el, get, set, mods?) applyCheckboxModel(el, get, set, values?)
applyRadioModel(el, get, set) applySelectModel(el, get, set, mods?) useModel(props, name): ModelRef<unknown>
setRef(target, ref: string | ((v, refs) => void), inFor?)   // string refs resolve via useTemplateRef only
hmr: { createRecord(id, def): boolean; rerender(id, render): void; reload(id, def): void }
```
The compiler MUST follow these rules:
1. `setup(__props, __ctx)` returns every setup-local binding except props, prop aliases and imports. `let` bindings are returned as get/set accessors.
2. Template identifier mapping:
   - import → bare name
   - setup binding → `$setup.x`
   - prop key or alias → `$props.key`
   - `$attrs`, `$slots`, `$emit` → `$ctx.attrs`, `$ctx.slots`, `$ctx.emit`
   - allowlisted globals → bare name
3. Props and events:
   - Every component prop and slot prop is a getter.
   - Event props are getters that return the handler.
   - A valueless attribute is `() => true`.
   - `v-model:x` becomes `x` plus `'onUpdate:x'` plus `xModifiers`.
4. `createFor` always receives `getKey`; a numeric literal source uses `v => v`. A `:key` outside v-for compiles to `createKeyed`.
5. Pass `isSingleRoot = true` when the component is the template's only root.
6. Template strings:
   - exactly one root, parse-stable (invalid nesting is split into its own template);
   - `data-vb-<id>` on every element when any style is scoped;
   - a comment anchor per dynamic block;
   - `ns` set for foreign roots.
7. Interpolation is one text node plus one effect.
8. Dev-only HMR footer: `createRecord`, then `accept(m => m.default.__rerenderOnly ? rerender : reload)`.
9. These are compile errors, not ABI features: string `:is`, v-show on a component, `...rest` in a props destructure, `generic`, kebab component tags (2002), `ref="x"` without `useTemplateRef('x')` (2701), and a non-record `defineEmits`.

Runtime guarantees:
- Parent jobs run before child jobs (sorted by uid).
- DISPOSED jobs never run.
- `removeNodes` is the only DOM removal path.

## C4 Type contract
```ts
// @vibejs-org/ui (public; the runtime implements what the language tools specify)
declare const ComponentSignature: unique symbol
interface Handle<S = {}, X = {}, E = {}> { readonly slots: S; readonly exposed: X; readonly emits: E }
type Component<Sig extends (props: any) => Handle<any, any, any> = (props: {}) => Handle> =
  ComponentDef & { readonly [ComponentSignature]?: Sig }
type ComponentProps<C>  = Parameters<NonNullable<C[typeof ComponentSignature]>>[0]
type ComponentSlots<C> / ComponentExposed<C> / ComponentEmits<C> = ReturnType<Sig>['slots' | 'exposed' | 'emits']
type EmitsToProps<E extends Record<string, unknown[]>> = { [K in keyof E & string as `on${Capitalize<K>}`]?: (...a: E[K]) => void }
```
The public surface also includes:
- `Ref<T, S>`, the super-type of Ref, ShallowRef, ComputedRef, WritableComputedRef and ModelRef.
- `useTemplateRef<T = unknown, K extends string = string>`.
- HTMLAttributes, IntrinsicElementAttributes, ReservedProps, ClassValue and StyleValue (DOM attribute typings derived from `packages/runtime-dom/src/jsx.ts` of vuejs/core under the MIT license, without its JSX namespace, plus csstype; credited in `THIRD-PARTY-NOTICES.md`).

`@vibejs-org/ui/tooling` is defined by the language tools. Executing its JS throws VIBE5900. It declares:
- the macros: defineProps, defineEmits, defineSlots, defineModel, defineExpose, defineOptions;
- the helpers: `tags`, `el`, `customElement`, `component`, `dynamicComponent`, `unrefs`, `writable`, `ctx`, `vFor`, `slotParams`, `slot`, `templateRef`, `defineComponent`, with the signatures declared in `packages/ui/src/tooling.ts`.

These helper names are a lockstep ABI.

Semantics both sides implement:
- Template scope is `ShallowUnwrapRef(setup)` plus props plus `$attrs`, `$slots`, `$emit`, `$props`.
- `v-model` means `modelValue` plus `'onUpdate:modelValue'`.
- A component ref's type is `ComponentExposed<C>`.
- An absent boolean prop is `undefined`.
- There are no global components; PascalCase tags only.

RouterView, RouterLink and the test host are internal `ComponentDef`s cast to `Component<Sig>`.

## C5 Compiler → language-tools
```ts
parse(src, { filename }): { descriptor: SFCDescriptor; diagnostics: Diagnostic[] }  // tolerant, never throws, comments kept
analyzeScript(d): {
  bindings: Map<string, { kind: 'prop' | 'prop-alias' | 'const' | 'maybe-ref' | 'let' | 'import'; decl: [number, number] }>
  propKeys: { name: string; decl: [number, number] }[]
  macros: { props?: { typeArg: [number, number] }; emits?: { typeArg: [number, number] }; slots?: { typeArg: [number, number] }
            models: { name: string; binding: string; required: boolean }[]; expose?: { callStart: number } }
  templateRefs: { key: string; keyLoc: [number, number]; typeArgInsertAt: number | null }[]
  importRanges: [number, number][]; diagnostics: Diagnostic[] }
forEachIdentifier(expr, offset, cb(name, start, end, { local, writeRoot }))
isAllowedGlobal(name); isSimpleHandler(expr); resolveComponentTag(tag, analysis, filename); camelize; hyphenate; capitalize
```
- Offsets are file-relative UTF-16.
- language-core never parses `.vibe` itself.
- The forwarded diagnostics equal the compiler's, minus those with `typeChecked`.

## C6 Language-tools ↔ tsc ↔ CLI
```jsonc
// ui/tsconfig.json (templates, examples)
{ "extends": "../tsconfig.base.json",
  "compilerOptions": { "lib": ["es2024", "dom"], "types": ["vite/client"], "verbatimModuleSyntax": true, "noEmit": true },
  "contentMappers": [{ "package": "@vibejs-org/language-tools", "extensions": [".vibe"] }],
  "include": ["src"], "references": [{ "path": "../contracts" }] }
```
- `.vibe` imports keep their extension. Never write `declare module '*.vibe'`.
- `vibejs check` runs `tsc -b --pretty false` and parses lines matching `^(.+?)\((\d+),(\d+)\): (error|warning) ([A-Z]+\d+): (.*)`.
- Content-mapper diagnostics render their code as `VIBE####`, so the pattern above extracts it directly. If a TypeScript release changes that, language-tools prefixes the message with `[VIBE####]` and the parser extracts it from there.
- `vibejs check` also handles the indented continuation lines that tsc prints for diagnostics in synthesized (unmapped) virtual code.
- **Diagnostic forwarding.** tsc treats content-mapper diagnostics as syntax errors and then skips semantic checking for the whole program. The mapper therefore forwards only compiler diagnostics that make type checking meaningless (parse errors and an unusable SFC structure). Every other compiler diagnostic is reported by the compiler itself: by the Vite plugin during dev and build, and by a separate compile step in `vibejs check`.
- **Editors.** The language server enables mappers through `initializationOptions.runExternalCode`; `tsc --lsp` has no `--runExternalCode` flag.
- **Caching.** The mapper keeps `dynamicConfig: false`; its package `version` is the cache identity. Language-tools tests in this repository run `tsc --force` (or without buildinfo) so a changed mapper is never served from cache.
- **Resolution.** `contentMappers` entries inherited through `extends` resolve from each leaf tsconfig's directory, so `@vibejs-org/language-tools` must be a direct dependency of the app.

## C7 Backend ↔ CLI, templates, UI
- **App entry.** `server/src/app.module.ts` exports `AppModule` and `appOptions: AppOptions` (`basePath: '/api'`). `server/src/main.ts` runs `VibeFactory.create(AppModule, appOptions)`, then `enableShutdownHooks()`, then `listen(Number(process.env.PORT ?? 3000))`.
- **Dev server.** It runs app.module.ts through Vite's SSR module runner with `create(AppModule, { ...appOptions, logger })` and mounts `app.fetch` at basePath via srvx `toNodeHandler`. A restart is `await app.close()` followed by `create` again.
  - `create` must have no side effects.
  - `close` must be idempotent.
- **Problem responses** are `application/problem+json`: `{ type, title, status, code, detail?, errors?, requestId }`.
- **Contract isomorphism.**
  - `@vibejs-org/contract` imports nothing from `node:*`, srvx or the server, and is built against lib es2022+dom.
  - `*.contract.ts` files import only the contract package and a schema library.
  - An oxlint override forbids importing `@vibejs-org/server` under `ui/**`.
- **Contracts** declare errors as `errors: { CODE: status }`; handlers raise them with `ctx.fail('CODE', detail?)`.
- **Client.** `createClient(contracts, { baseUrl, fetch?, headers? })`. A call has the shape `(input?, { signal?, headers? }) => Promise<ApiResult<R>>` and never throws for HTTP or network failures.

## C8 Router and testing ↔ runtime
- **App API.** `App.onUnmount(cb)` is new. The router also uses `app.runWithContext`, `provide`/`inject`, `createDynamicComponent` (RouterView) and the element ABI (RouterLink).
- **Routes file.** `routes.ts` is `export const routes = defineRoutes([...])` with a static array literal. Typing is enabled with `declare module '@vibejs-org/ui/router' { interface Register { router: typeof router } }`.
- **`mount`** is `createApp(host)`, where `host.render` calls `createComponent(C, getters over a shallowReactive bag, slots)`. `emitted()` injects `on*` recorders built from `__emits`.
- **`useAsync`** is `useAsync(fn: (signal) => Promise<T>) → { data, error, loading, refresh }`. With the typed client, `T` is `ApiResult<R>`, so callers narrow on `.ok`.

## C9 CLI ↔ agents
```ts
interface JsonEnvelope { ok: boolean; command: string; version: string; next?: string[]
  error?: { code: ErrorCode; message: string; docs: string; fixes?: string[]; missing?: { name: string; flag?: string; values?: string[]; example: string }[] } }
interface CheckDiagnostic { source: 'tsc' | 'oxlint' | 'oxfmt' | 'vitest' | 'coverage' | 'vibejs'; code: string; severity: 'error' | 'warning' | 'info'
  file: string; loc: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }   // 0-based
  message: string; docs?: string; fixes?: string[] }
```
- **Exit codes:** 0 ok, 1 failure, 2 usage or config error.
- **Agent mode:** chosen by std-env `detectAgent()` or `VIBEJS_AGENT=1`. Output is a single JSON object (NDJSON for `dev`), never prompts, and is capped.
- **Commands (v0.1):** `dev`, `build`, `check`, `generate|g resource|component|page`, `explain`, `docs`, `errors`, `logs`, `agents sync`, `routes`, `di`, `components`, `request <METHOD> <path>`, `mcp`. Every command is a pure `run(input, ctx)` handler returning one `JsonEnvelope`.
- **`check` enrichment:** VIBE codes come from the catalog. A small static map also enriches `TS1241` on `@Handle` (docs `server/handlers`; fix: "the handler must be `(ctx: Ctx<typeof contract.route>)` and return the route response type; do not cast or use `any`").
- **User-app coverage:** `check` reports coverage per file. Below 100% is the warning VIBE8302, not a failure. The template's `vitest.config.ts` contains a commented one-line `thresholds: { 100: true, perFile: true }` opt-in.
- **MCP (`vibejs mcp`, stdio, `@modelcontextprotocol/server` v2):** discovers the running dev server via `.vibejs/dev.lock`. Tools, in this deterministic order, each wrapping the matching `--json` command: `get_errors`, `get_logs`, `get_routes`, `get_di_graph`, `get_component_tree`, `check`, `request`, `explain`; plus docs search over the bundled docs. `--read-only` registers only non-mutating tools.
- **AGENTS.md managed block** (written by `create-vibejs`, refreshed by `vibejs agents sync`; markers `<!-- BEGIN:vibejs-agent-rules -->` / `<!-- END:vibejs-agent-rules -->`):
  - at most 30 lines of rules: exact commands, the disambiguation line, framework rules that commonly trip up coding agents, the TS1241 line;
  - plus one pipe-delimited compressed docs index line (at most 8 KB) pointing into `node_modules/@vibejs-org/cli/dist/docs/`, generated from the docs at build time;
  - `CLAUDE.md` contains `@AGENTS.md`;
  - test: every `vibejs <cmd>` named in the block answers `<cmd> --help --json` with `ok`, and every VIBE code in the block exists in the catalog.
  - The final block text is added to this section before the v0.1.0 API freeze.
- **Skills (workflows only):** `vibejs-dev-loop`, `vibejs-add-resource`, `vibejs-cover-100`, written to `.agents/skills` and `.claude/skills` by `agents sync`, which also writes `.mcp.json`.
- **Dev state files:** `.vibejs/dev.lock` holds `{ pid, url, port, apiPrefix, logFile, startedAt, version }`. `.vibejs/dev.log` holds NDJSON `LogEntry { t, level, source, msg, code?, file?, line?, column?, stack?, resolved? }`.

## C10 Toolchain and tests
- **Vitest projects** are selected by file suffix:

  | Project | Files | Environment |
  |---|---|---|
  | node | `*.test.ts` outside ui | node |
  | dom | `packages/ui/**/*.test.ts` | jsdom 30 |
  | browser | `*.browser.test.ts` | Chromium |
  | integration | `*.integration.test.ts`, `*.vibe.test.ts` | after build, outside coverage |

- **Coverage:** v8; `include`: `packages/*/src/**/*.ts`, `packages/create-vibejs/bin.js`, `scripts/**/*.ts` (except `scripts/e2e.ts` and `scripts/agent-eval.ts`), `docs/scripts/**/*.ts`; thresholds `{ 100: true, perFile: true }`. The `node` project also includes the `scripts/**` and `docs/scripts/**` tests.
- **Ignore hints:** only `/* v8 ignore ... -- @preserve <reason> */` with an entry in `coverage-ignores.json`. Remaining upstream defensive branches in forked code use the reason prefix `upstream-defensive:`. Deleting code is allowed only for compat/browser/base-mode branches. Allowlist additions need maintainer approval.
- **`__DEV__`:** a real global, set in setup and toggled with `vi.stubGlobal`.
- **TypeScript:** 7.0.2 runs `tsc -b` and the `*.test-d.ts` files. `catalog:ts-next` (an exact 7.1 nightly at least 3 days old, bumped weekly behind the corpus and LSP e2e gates) is used only by language-tools integration, vscode, examples, docs snippets and the CLI tool-contract test.
- **Moving to TypeScript 7.1 (event-triggered):** once TypeScript 7.1.x stable has been out for at least 3 days, one PR switches the main catalog to 7.1.x, deletes `catalog:ts-next` and its CI job, and joins vscode to the solution. It does not wait for the release.
- **CI matrix:** `check` (ubuntu), `build`, `test` (ubuntu × Node 24/26, windows × Node 24), `integration` (ubuntu), `e2e` (ubuntu full; macOS/Windows `--no-browser` smoke), `pr-meta` (Conventional Commits title), `secrets` (gitleaks over the full history).
- **Size budget:** the only hard gate is the `packages/ui` counter fixture (no router, client or schema) at ≤ 7 kB gzip. Template and `examples/todo` sizes are reported; their gates are set once the full template builds end to end (measurement + 10%).
- **English only:** `lint-repo` rejects Turkish-specific letters in comments and string literals under `packages/*/src`, `messages/`, `docs/` and templates; test fixtures are allowlisted.
- **Public text:** `lint-repo` rejects machine-local paths, email addresses (except no-reply and example domains) and phrases that describe vibe.js through another framework, in every file git would commit; `docs/guides/coming-from-*.md` and attribution files are exempt from the last rule.
- **Releases:** one changesets `fixed` group; v0.1.0 ships with a single "Initial release" changeset; per-PR changesets start after v0.1.0. `errors.lock` is generated once at the v0.1.0 release and is append-only afterwards.
- **Decorators:** legacy decorators appear only in `packages/server/src` and in allowlisted server tsconfigs of examples and templates.
