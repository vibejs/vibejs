# VS Code extension

## VIBE6101: TypeScript 7 extension missing

> Install the {extension} extension to type-check .vibe files.

The extension hands `.vibe` files to the TypeScript 7 extension, which runs the project's content mapper. Without it, `.vibe` files are highlighted but not type-checked.

### Fix

- Install `TypeScriptTeam.native-preview` from the Marketplace or Open VSX, then reload the window.
- Keep working without it: highlighting and editing rules work on their own.

## VIBE6102: Untrusted workspace

> Trust this workspace to type-check .vibe files.

Type checking runs the project's content mapper, which is project code, so VS Code allows it only in a trusted workspace. In Restricted Mode, `.vibe` files are highlighted but not type-checked.

### Fix

- Run "Manage Workspace Trust" and trust the folder.
- Open the repository root, the folder that contains the project's `node_modules`, so that trust covers the whole project.
