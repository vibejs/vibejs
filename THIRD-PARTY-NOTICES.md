# Third-party notices

vibe.js is MIT licensed. Code derived from other open-source projects is credited here, and in the `THIRD-PARTY-NOTICES.md` of the package that contains it, with the upstream project, its license and its copyright notice. Each derived file starts with an `// Upstream: <repo>@<sha> <path> (<license>)` header.

## packages/vscode

Details, the changes made and the full license texts are in [`packages/vscode/THIRD-PARTY-NOTICES.md`](packages/vscode/THIRD-PARTY-NOTICES.md). JSON and plist files cannot carry `// Upstream:` headers, so the notices name each derived file.

- **vuejs/language-tools** at `f2d92d3f1cb5513268fff358993f163e78d4821a`, MIT, Copyright (c) 2021-present Johnson Chu.
  - `packages/vscode/syntaxes/vibejs.tmLanguage.json` from `extensions/vscode/syntaxes/vue.tmLanguage.json`
  - `packages/vscode/syntaxes/vibejs-directives.tmLanguage.json` from `extensions/vscode/syntaxes/vue-directives.json`
  - `packages/vscode/syntaxes/vibejs-interpolations.tmLanguage.json` from `extensions/vscode/syntaxes/vue-interpolations.json`
  - `packages/vscode/language-configuration.json` from `extensions/vscode/languages/vue-language-configuration.json`
- **microsoft/TypeScript-TmLanguage** at `eeeb0dc4daa8793b8227bb3b34ddfc267c85fd81`, MIT, Copyright (c) Microsoft Corporation (test fixture, not shipped).
  - `packages/vscode/test/grammars/TypeScript.tmLanguage` from `TypeScript.tmLanguage`
- **microsoft/vscode** at `28a562309973a386b2bdefae78127788a4742fe8`, MIT, Copyright (c) 2015 - present Microsoft Corporation (test fixture, not shipped). The file is converted from textmate/html.tmbundle at `0c3d5ee54de3a993f747f54186b73a4d2d3c44a2`, under that bundle's permissive license.
  - `packages/vscode/test/grammars/html.tmLanguage.json` from `extensions/html/syntaxes/html.tmLanguage.json`
