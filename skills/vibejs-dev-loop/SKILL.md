---
name: vibejs-dev-loop
description: The edit, inspect and verify loop for a vibe.js app. Use it for any change to a vibe.js project (UI, server or contracts), and whenever a VIBE#### error code, a failing check or a broken page or endpoint shows up.
license: MIT
---

# vibe.js dev loop

`vibejs` means the local CLI command named in AGENTS.md (`pnpm exec vibejs`, `npx --no vibejs` or `yarn vibejs`). Never run a global `vibejs` or `vibe`.

Every command below prints one JSON object with `--json`. When the `vibejs` MCP server is connected, call the named tool instead of the command; it answers with the same JSON.

## 1. Start or reuse the dev server

Run `vibejs dev`. It serves the UI and the API on one port and restarts the backend on server changes. When a dev server already runs for this project, it prints its URL and exits, so it is safe to run again.

## 2. Make the change

Edit the code. Read the docs page for the task first: the docs index in AGENTS.md lists them.

## 3. Read what broke

- `vibejs errors --json` (MCP tool `get_errors`): the current errors of the dev server, the browser and the backend.
- `vibejs logs --json` (MCP tool `get_logs`): everything they printed; filter with `--level`, `--source`, `--grep` or `--since`.

## 4. Explain every error code

For each `VIBE####` code, run `vibejs explain VIBE####` (MCP tool `explain`) and apply its fix. Do not work around the error, cast to `any` or silence it.

## 5. Verify the behavior

- `vibejs request <METHOD> <path> --json` (MCP tool `request`), such as `vibejs request GET /api/health --json`: calls the running API.
- `vibejs routes --json` (MCP tool `get_routes`): the API endpoints with their handlers, and the UI paths with their pages.
- `vibejs components --json` (MCP tool `get_component_tree`): the components with their props and models.
- `vibejs di --json` (MCP tool `get_di_graph`): the modules, providers and injections.

## 6. Done

Run `vibejs check --json` (MCP tool `check`): types, lint, format, tests and coverage per file. The change is done when it exits 0. Otherwise read its `diagnostics`, go back to step 2, and repeat.

To raise coverage, use the `vibejs-cover-100` skill. To add an API resource, use the `vibejs-add-resource` skill.
