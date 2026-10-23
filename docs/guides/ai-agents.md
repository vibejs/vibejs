---
title: CLI and AI agents
description: How vibejs answers coding agents with JSON, keeps their rules in AGENTS.md, serves the docs offline and exposes its commands as MCP tools.
order: 1
---

# CLI and AI agents

Every `vibejs` command works the same for people and for coding agents. For an agent, it answers with one JSON object that says what happened and what to do next, it never prompts, and its docs ship with the installed version.

## Agent mode

`vibejs` switches to agent mode when it runs inside a known coding agent, detected from the environment, or when `VIBEJS_AGENT=1` is set. `VIBEJS_AGENT=0` turns it off. `--json` gives the same output without agent mode.

In agent mode, a command:

- prints a single JSON object to stdout (`vibejs dev` prints one JSON event per line);
- never prompts, and never overwrites a file without consent;
- keeps its output short, with limits on long lists.

## Results and exit codes

Every result has the same envelope:

```ts
interface JsonEnvelope {
  ok: boolean;
  command: string;
  version: string;
  /** Commands to run next. */
  next?: string[];
  error?: {
    code: string;
    message: string;
    /** The docs page of the code. */
    docs: string;
    fixes?: string[];
    /** The inputs that a command needs and did not get. */
    missing?: { name: string; flag?: string; values?: string[]; example: string }[];
  };
}
```

A command exits with:

| Code | Meaning                           |
| ---- | --------------------------------- |
| `0`  | Success.                          |
| `1`  | The work failed, such as a check. |
| `2`  | Wrong usage or configuration.     |

`vibejs check --json` adds `diagnostics`: each one has its `source` (`tsc`, `oxlint`, `oxfmt`, `vitest`, `coverage` or `vibejs`), `code`, `severity`, `file`, `loc` (`file:line:column`) and `message`, and for vibe.js codes the `docs` link and the `fixes`. Template errors in `.vibe` files are reported at their place in the `.vibe` file.

## AGENTS.md

A new app has an `AGENTS.md` with a block of vibe.js rules between two marker lines, and a `CLAUDE.md` that imports it with `@AGENTS.md`. The block holds:

- the exact commands to run, through the app's own CLI;
- the rules that agents most often get wrong in a vibe.js app;
- a one-line index of the docs in `node_modules/@usevibejs/cli/dist/docs`, so the agent reads the docs of the installed version instead of what it remembers.

```sh
vibejs agents sync
vibejs agents sync --check
```

`vibejs agents sync` rewrites the block for the installed version, and `vibejs dev` does the same when it starts. `--check` writes nothing and fails when a file is out of date. Your own notes go outside the markers and are kept. Malformed markers stop the sync with [VIBE8601](/errors/VIBE8601).

## Docs and errors offline

Every `VIBE####` error carries its code, its fixes and a link to its page. The CLI answers from the docs that it bundles, without a network:

```sh
vibejs explain VIBE8601
vibejs docs guides/tutorial
vibejs docs template type error
```

`vibejs explain` prints the message, the fixes and the link of a code. `vibejs docs` takes a code, a page path or search words.

## The dev server

`vibejs dev` writes its state to `.vibejs/dev.lock` and every error and log line of the build, the browser and the server to `.vibejs/dev.log`. A second `vibejs dev` reports the running server instead of starting another one. While it runs:

- `vibejs errors` lists the current build errors and the latest runtime errors;
- `vibejs logs` shows the latest log entries, filtered by level, source, text or time;
- `vibejs request GET /api/users` calls a route through the running server, or in process when none runs;
- `vibejs di` shows the modules and providers of the server.

`vibejs routes` lists the API routes and the UI routes, and `vibejs components` lists the `.vibe` components with their props, models and type arguments. Neither needs a running dev server.

## MCP

`vibejs mcp` serves the commands to an agent as [MCP](https://modelcontextprotocol.io) tools over stdio. Each tool answers like its `--json` command:

| Tool                 | Command                                   |
| -------------------- | ----------------------------------------- |
| `get_errors`         | `vibejs errors`                           |
| `get_logs`           | `vibejs logs`                             |
| `get_routes`         | `vibejs routes`                           |
| `get_di_graph`       | `vibejs di`                               |
| `get_component_tree` | `vibejs components`                       |
| `check`              | `vibejs check`                            |
| `request`            | `vibejs request`                          |
| `explain`            | `vibejs docs`: a code, a page or a search |

With `--read-only`, the `request` tool accepts only `GET`, `HEAD` and `OPTIONS`.

## Reference

The [CLI reference](/cli/) lists every command with its options and examples; `vibejs <command> --help --json` returns the same reference as JSON.
