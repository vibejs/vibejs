---
title: Editor setup
description: Type checking, hover, go to definition and diagnostics in .vibe files in VS Code, Neovim and other LSP editors, the known limitations, and how to fix a setup that shows no types.
order: 3
---

# Editor setup

`.vibe` files are type-checked by the TypeScript 7 language server (`tsc --lsp`). The server loads the project's `@vibejs-org/language-tools`, a content mapper that turns each `.vibe` file into TypeScript, and maps every answer back to the exact position in the `.vibe` file. Hover, go to definition, find references, rename, completion and diagnostics work in the `<script setup>` block and in template expressions.

Every editor needs the same three things:

- the `contentMappers` entry in the tsconfig that includes the `.vibe` files (a new app has it):

  ```json
  {
    "contentMappers": [{ "package": "@vibejs-org/language-tools", "extensions": [".vibe"] }]
  }
  ```

- `node` on the editor's `PATH`, because the server starts the content mapper with it;
- permission to run project code. The content mapper is project code, so the server runs it only when the editor passes `runExternalCode: true` in its initialization options. Enable it only for projects you trust.

Open the app root, the folder that contains `node_modules`, so that the server finds `@vibejs-org/language-tools`.

## VS Code

Install two extensions (a new app recommends both in `.vscode/extensions.json`):

- **vibe.js** (`vibejs.vibejs`): highlighting and editing rules for `.vibe` files, and the hand-off of `.vibe` files to the TypeScript 7 extension;
- **TypeScript 7** (`TypeScriptTeam.native-preview`): the language server.

VS Code runs project code only in a trusted workspace. In Restricted Mode, `.vibe` files are highlighted but not type-checked, and the vibe.js extension shows [VIBE6102](/errors/VIBE6102). Trust the folder to turn type checking on.

## Neovim

Neovim 0.11 or later, with the built-in LSP client:

```lua
vim.filetype.add({ extension = { vibe = 'vibejs' } })
vim.lsp.config('tsc', {
  cmd = { 'node_modules/.bin/tsc', '--lsp', '--stdio' },
  init_options = { runExternalCode = true },
  filetypes = { 'typescript', 'typescriptreact', 'javascript', 'javascriptreact', 'vibejs' },
  root_markers = { 'tsconfig.json', 'package.json' },
})
vim.lsp.enable('tsc')
```

`init_options = { runExternalCode = true }` runs the project's content mapper: keep this configuration for projects you trust. The vibe.js test suite starts the language server with exactly this command and these options.

## Other LSP editors

Zed, Helix and other editors with an LSP client use the same setup:

- the command `node_modules/.bin/tsc --lsp --stdio`;
- the initialization options `{ "runExternalCode": true }`;
- a file type `vibejs` for the `.vibe` extension, handed to that server.

JetBrains IDEs are not supported: they do not load TypeScript content mappers.

## Known limitations

These come from the TypeScript language server and are tracked upstream.

- **Rename from the script does not update the template** ([#63879](https://github.com/microsoft/TypeScript/issues/63879)). Renaming a `<script setup>` binding edits the script only; the template keeps the old name, and the next type check reports it. Use find references first, or search and replace in the file. Renaming a tag, a prop key or an event name in the template is refused.
- **Auto-import completions** ([#64119](https://github.com/microsoft/TypeScript/issues/64119)). Completion in a `.vibe` file does not offer exports that the file does not import yet. Write the `import` yourself, or complete the name in a `.ts` file and copy the import.
- **Formatting** ([#64579](https://github.com/microsoft/TypeScript/issues/64579)). The language server does not format `.vibe` files. Format them with the app's formatter: `vibejs check` reports formatting problems.

## Troubleshooting

| Problem                                                                                  | Fix                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [VIBE6101](/errors/VIBE6101): the TypeScript 7 extension is missing.                     | Install `TypeScriptTeam.native-preview` and reload the window.                                                                                                              |
| [VIBE6102](/errors/VIBE6102): the workspace is not trusted.                              | Trust the folder. In Restricted Mode the TypeScript 7 extension is off, so `.vibe` files are highlighted only.                                                              |
| [VIBE6002](/errors/VIBE6002): the TypeScript host does not offer UTF-16 positions.       | Update `typescript` to the version that `@vibejs-org/language-tools` supports.                                                                                              |
| [VIBE6010](/errors/VIBE6010): an `<!-- @vibe-expect-error -->` suppresses no type error. | Remove the comment, or move it right before the element or interpolation whose error it expects.                                                                            |
| TS18068: content mappers require `--runExternalCode`.                                    | Run `tsc -b --runExternalCode` (`vibejs check` passes it). In an editor, pass `runExternalCode: true` in the initialization options.                                        |
| TS18099: the content mapper did not start.                                               | Run `pnpm install` so that `@vibejs-org/language-tools` and its build are in `node_modules`, and make sure the editor finds `node` on its `PATH`.                           |
| TS18080: a problem in the code that the content mapper produced.                         | The `.vibe` file maps to invalid TypeScript, which is a vibe.js bug. Report it with the file at [github.com/vibejs/vibejs/issues](https://github.com/vibejs/vibejs/issues). |
| Diagnostics do not change after linking a local build of `@vibejs-org/language-tools`.   | TypeScript caches the content mapper's output by package version. Run `tsc -b --force` once, and restart the language server.                                               |
