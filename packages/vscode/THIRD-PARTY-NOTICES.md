# Third-party notices

The VS Code extension is MIT licensed. Its grammars and language configuration are adapted from the projects below. JSON files cannot carry `// Upstream:` headers, so this file names each derived file.

## vuejs/language-tools

- Source: https://github.com/vuejs/language-tools at `f2d92d3f1cb5513268fff358993f163e78d4821a`
- License: MIT
- Copyright (c) 2021-present Johnson Chu
- Files:
  - `syntaxes/vibejs.tmLanguage.json` from `extensions/vscode/syntaxes/vue.tmLanguage.json`
  - `syntaxes/vibejs-directives.tmLanguage.json` from `extensions/vscode/syntaxes/vue-directives.json`
  - `syntaxes/vibejs-interpolations.tmLanguage.json` from `extensions/vscode/syntaxes/vue-interpolations.json`
  - `language-configuration.json` from `extensions/vscode/languages/vue-language-configuration.json`
- Changes: scope names, repository keys and injection selectors renamed to `vibejs`; `<script>` is always TypeScript; `<style>` is CSS, SCSS or Less; every other embedded language, the key-value comment form and the CSS `v-bind()` injection removed; comments removed from the language configuration.

```text
MIT License

Copyright (c) 2021-present Johnson Chu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Test grammars

The grammar snapshot tests load two grammars that are copied unchanged into `test/grammars/`. They are test fixtures and are not part of the VSIX.

### microsoft/TypeScript-TmLanguage

- Source: https://github.com/microsoft/TypeScript-TmLanguage at `eeeb0dc4daa8793b8227bb3b34ddfc267c85fd81`
- License: MIT
- Copyright (c) Microsoft Corporation
- Files: `test/grammars/TypeScript.tmLanguage` from `TypeScript.tmLanguage`

```text
Copyright (c) Microsoft Corporation
All rights reserved.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### microsoft/vscode (HTML grammar)

- Source: https://github.com/microsoft/vscode at `28a562309973a386b2bdefae78127788a4742fe8`
- License: MIT
- Copyright (c) 2015 - present Microsoft Corporation
- Files: `test/grammars/html.tmLanguage.json` from `extensions/html/syntaxes/html.tmLanguage.json`
- That file is converted from https://github.com/textmate/html.tmbundle at `0c3d5ee54de3a993f747f54186b73a4d2d3c44a2` (`Syntaxes/HTML.plist`), whose license reads: "Permission to copy, use, modify, sell and distribute this software is granted. This software is provided "as is" without express or implied warranty, and with no claim as to its suitability for any purpose."

```text
MIT License

Copyright (c) 2015 - present Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The stub grammars `test/grammars/{css,scss,less}-stub.json` are original: they declare only a scope name, so that the snapshots show where the style languages start.
