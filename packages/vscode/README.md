# vibe.js for VS Code

Language support for vibe.js `.vibe` single-file components.

- Syntax highlighting for templates, `<script>` (TypeScript) and `<style>` (CSS, SCSS and Less), and editing rules for comments, brackets and indentation. These work in every workspace, Restricted Mode included.
- Type checking, hover, go to definition and diagnostics in `.vibe` files, through the TypeScript 7 extension and the project's `@vibejs-org/language-tools`.

## Requirements

Type checking needs:

- the [TypeScript 7 extension](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview) (`TypeScriptTeam.native-preview`), and
- a trusted workspace, because type checking runs project code.

When one of them is missing, the extension shows VIBE6101 or VIBE6102 and keeps highlighting.

## License

MIT. Third-party notices are in `THIRD-PARTY-NOTICES.md`.
