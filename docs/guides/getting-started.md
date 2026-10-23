---
title: Getting started
description: Create a vibe.js app, run it, check it, and set up your editor and coding agent.
order: 1
---

# Getting started

A vibe.js app is one package with three parts: the UI, the server and the contracts between them. One command creates it, and one command checks all of it.

## Requirements

- Node.js `^24.15.0 || >=26`.
- A package manager: pnpm, npm, yarn or bun. The examples use pnpm.

## Create an app

```sh
pnpm create vibejs my-app
cd my-app
```

With another package manager, run `npm create vibejs@latest my-app`, `yarn create vibejs my-app` or `bun create vibejs my-app`. The scaffolder installs the dependencies with the package manager that ran it.

## Project layout

| Path         | What it holds                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `contracts/` | The API contracts: routes with their params, bodies, responses and errors. The UI and the server share them. |
| `server/`    | The server: modules, controllers that serve the contracts, and services.                                     |
| `ui/`        | The UI: `.vibe` components, pages, routes and the typed API client.                                          |
| `AGENTS.md`  | The rules and docs index for coding agents.                                                                  |

## Run it

```sh
pnpm dev
```

`pnpm dev` serves the UI and the API on one port, the API under `/api`. Open the URL it prints: the home page shows the status that it loads from `/api/health`. UI changes reload in place, and server changes restart the server.

## Check it

```sh
pnpm vibejs check
```

`vibejs check` type-checks the TypeScript and the `.vibe` templates, lints, checks the formatting and runs the tests with coverage, all at once. It exits 0 when everything passes, and prints each problem with its file, line and column, and a link to its docs.

## Editor setup

Install the recommended VS Code extensions that the app lists in `.vscode/extensions.json`:

- **vibe.js** (`vibejs.vibejs`): syntax highlighting, and type checking, hover and go to definition in `.vibe` files.
- **TypeScript 7** (`TypeScriptTeam.native-preview`): the TypeScript language service that checks `.vibe` files through the app's `@usevibejs/language-tools`.
- **Oxc** (`oxc.oxc-vscode`): lint and format on save.

Type checking runs project code, so it needs a trusted workspace. Without the TypeScript 7 extension or trust, the editor shows [VIBE6101](/errors/VIBE6101) or [VIBE6102](/errors/VIBE6102) and keeps highlighting.

For Neovim and other editors, the known limitations and troubleshooting, see [Editor setup](./editors.md).

## Coding agents

`AGENTS.md` holds a block of vibe.js rules for coding agents: the exact commands, the rules that agents get wrong most often, and an index of the docs that ship with the app in `node_modules/@usevibejs/cli/dist/docs`, so an agent reads the docs of the installed version. `vibejs agents sync` and `vibejs dev` keep the block current; write your own notes outside its markers. See [CLI and AI agents](./ai-agents.md).

## Next

Follow the [tutorial](./tutorial.md) to add an API resource and a page that shows it.
