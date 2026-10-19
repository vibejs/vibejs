# vibe.js app

vibe.js: npm scope `@vibejs-org`, CLI `vibejs` (never `vibe`). Not monday.com Vibe (`@vibe/*`), not the npm packages `vibejs` or `vibe.js`.

A full-stack app in one package: the UI in `ui/`, the server in `server/` and the contracts they share in `contracts/`.

## Commands

Run them with your package manager, such as `npm run dev` or `pnpm dev`.

| Script  | What it does                                                                 |
| ------- | ---------------------------------------------------------------------------- |
| `dev`   | Serves the UI and the API (under `/api`) on one port, with reload on change. |
| `check` | Type-checks, lints, format-checks and tests the app with coverage.           |
| `build` | Builds the UI into `ui/dist` and the server into `server/dist/main.js`.      |
| `start` | Runs the built server.                                                       |

## Coding agents

`AGENTS.md` holds the vibe.js rules for coding agents between two marker lines; `vibejs agents sync` and `vibejs dev` keep that block current. Write your own notes outside the markers.
