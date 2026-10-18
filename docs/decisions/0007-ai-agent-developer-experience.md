# 0007. AI-agent developer experience

- Status: Accepted
- Date: 2026-10-18

## Context

A large share of application code is now written or edited by coding agents. Agents work best with documentation that matches the installed version, with exact commands, with machine-readable tool output and with errors that name a fix. In Vercel's published agent evaluations (January 2026), an always-loaded docs index in `AGENTS.md` solved every task on APIs missing from the models' training data, while on-demand skills reached at most 79%. The study "Evaluating AGENTS.md" (arXiv 2602.11988) found that context files raise inference cost by more than 20% and that repository overviews do not help, while documenting non-standard practices does.

## Decision

- **AGENTS.md managed block.** `create-vibejs` writes an `AGENTS.md` with a block between `<!-- BEGIN:vibejs-agent-rules -->` and `<!-- END:vibejs-agent-rules -->`, and a `CLAUDE.md` containing `@AGENTS.md`. `vibejs agents sync` refreshes the block. It holds at most 30 lines of rules (exact commands, the package disambiguation line, framework rules that commonly trip up coding agents) and one compressed docs index of at most 8 KB that points into version-matched Markdown docs bundled in the installed CLI package. A test checks that every command and error code named in the block exists.
- **JSON CLI.** Agent mode is detected automatically or forced with `VIBEJS_AGENT=1`. In agent mode every command prints exactly one JSON envelope (`ok`, `command`, `version`, `error` with code, docs URL and fixes, and `next` steps), never prompts, and caps its output; missing inputs are returned with the exact flag to pass. Exit codes are 0 for success, 1 for failure and 2 for usage or configuration errors. `vibejs check --json` combines type checking, lint, format and tests with coverage into one list of LSP-shaped diagnostics.
- **Introspection.** `vibejs routes`, `di`, `components`, `request`, `errors`, `logs` and `explain` expose the running application and the error catalog.
- **MCP server.** `vibejs mcp` is a stdio Model Context Protocol server built on the official TypeScript SDK. It discovers the running dev server, exposes a fixed, small set of tools in a deterministic order, each wrapping a `--json` command, plus search over the bundled docs. `--read-only` registers only non-mutating tools.
- **Skills.** Skills cover multi-step workflows only (`vibejs-dev-loop`, `vibejs-add-resource`, `vibejs-cover-100`); `vibejs agents sync` writes them where agents look for them.
- **Evaluation.** Before release, a fixed set of tasks is run with several coding agents, with and without the managed block, to measure task success and tune the block and the docs index.

## Consequences

- Agents get version-correct guidance from the installed packages, without network access and without an oversized instruction file.
- Every agent-facing surface is a thin layer over the same CLI handlers, so humans and agents see the same behavior.
- The block, the docs index and the JSON schemas become part of the public surface and must stay stable across releases.

## Alternatives considered

- **A long AGENTS.md with a repository overview.** Easy to write, but it costs context on every request and the evidence above shows no benefit.
- **Skills as the main documentation channel.** Useful for workflows, but they are loaded on demand and were less reliable than an always-present index.
- **A separately published MCP package or an HTTP MCP endpoint in the dev server.** A separate package can drift from the installed CLI version, and an HTTP endpoint adds an attack surface; a subcommand of the CLI is version-matched by construction. An HTTP endpoint may follow later.
