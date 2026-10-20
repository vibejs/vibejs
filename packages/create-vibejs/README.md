# create-vibejs

vibe.js: npm scope `@vibejs-org`, CLI `vibejs` (never `vibe`). Not monday.com Vibe (`@vibe/*`), not the npm packages `vibejs` or `vibe.js`.

Creates a full-stack vibe.js app: the UI in `ui/`, the server in `server/` and the contracts they share in `contracts/`, with an `AGENTS.md` for coding agents.

```sh
npm create vibejs@latest my-app
pnpm create vibejs my-app
yarn create vibejs my-app
bun create vibejs my-app
```

Options:

- `--pm pnpm|npm|yarn|bun`: the package manager to install with (default: the one that runs the command, else npm).
- `--no-install`: write the files only.

With `VIBEJS_AGENT=1`, or when the output is not a terminal, it prints one JSON object and never prompts.
