# CLI core

## VIBE8001: Not in a vibe.js project

> No vibe.js project at or above `{cwd}`: no package.json depends on @vibejs-org/cli.

Project commands such as `vibejs check` run from the project root: the nearest directory, at or above the current one, whose `package.json` lists `@vibejs-org/cli` in `dependencies` or `devDependencies`.

### Fix

- Run the command inside a vibe.js project.
- Add `@vibejs-org/cli` to the `devDependencies` of the project's `package.json`.

## VIBE8003: Missing required input

> Missing required input `{name}` for `vibejs {command}`.

The command needs a value that was not given. The CLI never prompts for it, so a coding agent gets the same answer as a person: the JSON output lists the missing input in `error.missing` with an example, and `next` holds a complete command to run.

### Fix

- Pass `{name}` as shown in `vibejs {command} --help`.
- Run the command from `next` in the JSON output.

## VIBE8004: Unknown command or option

> Unknown command or option `{name}`.

The first word after `vibejs` must be a command, and every option must belong to that command or be one of the global options `--json`, `--help` and `--version`. A command takes only the arguments its usage lists. For a common mistake, `next` suggests the intended command.

### Fix

- Run `vibejs --help` to list the commands and their options.
- Run the command from `next` in the JSON output.

## VIBE8005: Required tool missing or too old

> `{tool}` is missing or older than {minimum}; install it with `{install}`.

`vibejs check` runs the type checker, linter, formatter and test runner installed in the project, never global copies, so every result matches what the project's own scripts report. It needs TypeScript 7.1 or newer, which runs the content mapper for `.vibe` files.

### Fix

- Run `{install}` in the project root.

## VIBE8008: Unknown error code

> No error code `{code}` in the catalog of this vibejs version.

`vibejs explain` and `vibejs docs` read the error catalog that ships with the installed CLI, so they work offline. A code is missing when it is mistyped or when it comes from a newer vibe.js version than the installed one.

### Fix

- Check the spelling: a code is `VIBE` followed by four digits.
- Update the vibe.js packages in this project if the code comes from a newer version.

## VIBE8010: Overwrite needs consent

> Overwriting {count} file(s) needs the user's consent: set `VIBEJS_USER_CONSENT` to their words.

In agent mode, `vibejs generate --force` overwrites files only when `VIBEJS_USER_CONSENT` holds the user's own words agreeing to it, and the JSON output echoes them in `consent`. Nothing is written until then. This is a speed bump that keeps an agent from replacing a person's edits unasked, not a security boundary.

### Fix

- Ask the user, then re-run with `VIBEJS_USER_CONSENT='<their words>'`.

## VIBE8201: Project layout incomplete

> `{path}` is missing; `vibejs {command}` expects `ui/index.html`, `server/src/app.module.ts` and `server/src/main.ts`.

`vibejs dev` and `vibejs build` work on a full-stack project: the UI in `ui/`, the server in `server/` and the shared contracts in `contracts/`, all in one package. The UI starts at `ui/index.html`, the server application is `AppModule` in `server/src/app.module.ts`, and `server/src/main.ts` starts it in production.

### Fix

- Run `vibejs {command}` from a project created with `create-vibejs`.
- Create `{path}` as in the project template.

## VIBE8202: Invalid app module

> `server/src/app.module.ts` must export `AppModule` (a module class) and `appOptions` (an object); found {found}.

`vibejs dev` loads `server/src/app.module.ts` and creates the application from its `AppModule` export, a class decorated with `@Module()`, and its `appOptions` export, such as `{ basePath: '/api' }`. Until the module has both exports, every request under the API base path is answered with a 503 problem response, and the dev server keeps running.

### Fix

- Export `AppModule` and `appOptions` as in the template.

## VIBE8203: Backend failed to start

> The backend failed to start: {reason}.

Loading the server modules or creating the application threw. The dev server keeps serving the UI, answers every request under the API base path with a 503 problem response, and records the error with its stack in `.vibejs/dev.log`, where `vibejs errors` finds it. The backend restarts when a file under `server/` or `contracts/` changes.

### Fix

- Fix the error at the logged location; the backend restarts on save.
- Run `vibejs errors` to see the error with its stack.

## VIBE8204: Port in use

> Port {port} is already in use.

`vibejs dev --port <port>` uses exactly that port and does not try another one.

### Fix

- Pass `--port <free port>` or stop the other process.
- Run `vibejs dev` without `--port` to let it pick a free port.

## VIBE8205: Empty base path

> `appOptions.basePath` in `server/src/app.module.ts` is empty.

`vibejs dev` serves the UI and the backend on one port: the UI at the root and the backend under `appOptions.basePath`. With an empty base path the backend would answer every request, including the UI's. Until the base path is set, every request under the previous base path (`/api` before the first start) is answered with a 503 problem response.

### Fix

- Set a base path such as `basePath: '/api'` in `appOptions`, as in the template.

## VIBE8301: Unreadable tool output

> `{tool}` exited with code {exitCode} and output that vibejs check cannot read.

The tool crashed or printed something other than the format `vibejs check` parses, often because of a broken configuration file. The diagnostic carries the first 40 lines of the tool's output; the other tools' results are still reported.

### Fix

- Run the tool directly in the project root to see its full output.
- Fix the configuration or the installation the output points to.

## VIBE8302: File not fully covered

> `{file}` is not fully covered: {uncovered}.

`vibejs check` reports every file below 100% statement, branch, function or line coverage, with its uncovered ranges. It is a warning: the check still passes. To make it a failure, enable the commented `thresholds` line in `vitest.config.ts`.

### Fix

- Add tests for the listed ranges; never add coverage-ignore comments.

## VIBE8303: File not formatted

> `{file}` is not formatted.

The file differs from what oxfmt writes with the project's `.oxfmtrc.json`.

### Fix

- Run `vibejs check --fix`.

## VIBE8304: Build failed

> Building the {part} failed: {reason}.

`vibejs build` builds the UI into `ui/dist`, then the server into `server/dist/main.js`. The reason holds the error code, location and message of the first build error.

### Fix

- Fix the reported error and run `vibejs build` again.

## VIBE8401: Generated files differ

> {count} file(s) differ from what `vibejs generate {kind} {name}` writes: {paths}.

`vibejs generate` never overwrites a file that differs from what it would write, so edits to generated code are never lost. A file equal to the generated one is skipped, which makes a second run of the same command a no-op. Nothing is written while any file differs.

### Fix

- Run with `--dry-run --json` to compare, then rename or `--force`.

## VIBE8402: Register by hand

> Register `{what}` in `{path}` by hand: {instruction}.

`vibejs generate` registers new code in the files of the template: a module in the `imports` of `@Module` on `AppModule` in `server/src/app.module.ts`, a contract in the `contracts` object of `ui/src/api.ts`, and a page in the `defineRoutes([...])` array of `ui/src/routes.ts`. When such a file is missing or has another shape, it writes the other files and reports the exact code to add instead. The command still succeeds.

### Fix

- Apply the instruction, then run `vibejs check`.

## VIBE8403: Invalid generator name

> `{name}` is not a valid {kind} name; expected {expected}.

`vibejs generate` takes names verbatim and derives file, class and route names from them. A resource is a camelCase identifier, usually plural (`users`); a component or a page is a PascalCase identifier (`UserCard`, `Users`). JavaScript reserved words and the names the generated code uses itself (such as `app`, `client` or `setup` for a resource, `Page` for a page) are not valid. A resource also needs a valid singular: `--singular <word>` gives it when the derived one is empty or taken; other kinds ignore `--singular`. `next` holds the command with a corrected name.

### Fix

- Use the name from `next`.

## VIBE8501: App module failed to load

> Could not load `server/src/app.module.ts`: {reason}.

`vibejs di` and `vibejs request` (when no dev server runs) load `server/src/app.module.ts` and the project's `@vibejs-org/server` in process. Importing the module, or creating the application for a request, threw an error that has no VIBE code of its own; an error with a code is reported as itself.

### Fix

- Fix the error at the reported location, then run the command again.

## VIBE8502: Request failed

> The request to `{url}` could not be made: {reason}.

A `vibejs dev` server is running for this project, so `vibejs request` sends the request to it, but the server did not answer. It may have stopped or crashed while the request was on its way.

### Fix

- Start the dev server again with `vibejs dev`, or stop it so the request runs in process.

## VIBE8503: Invalid request input

> Invalid request input: {reason}.

`vibejs request <METHOD> <path>` takes a path that starts with `/`, a `--data` body that is JSON (inline, or `@file` read relative to the current directory) and only for methods that take a body, and `-H` headers written as `Name: value`.

### Fix

- Pass `--data` as JSON or `@file`, and `-H` as `Name: value`.

## VIBE8601: Malformed agent rules markers

> {file} has {problem}; vibejs agents sync only edits text between one BEGIN and one END marker.

`vibejs agents sync`, `vibejs dev` and `create-vibejs` keep the vibe.js rules for coding agents in a block of AGENTS.md between the lines `<!-- BEGIN:vibejs-agent-rules -->` and `<!-- END:vibejs-agent-rules -->`, and never touch the text around it. With a marker missing, out of order or repeated, the block's extent is unknown, so the file is left as it is. `vibejs dev` logs this as a warning and keeps running.

### Fix

- Restore or delete both marker lines, then run `vibejs agents sync`.
