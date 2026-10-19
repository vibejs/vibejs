# Third-party notices for @vibejs-org/compiler

`@vibejs-org/compiler` is MIT licensed. Code derived from other open-source projects is credited here with the upstream project, its license and its copyright notice. Each derived file starts with an `// Upstream: <repo>@<sha> <path> (<license>)` header that lists the edits made to it.

## vuejs/core

- Repository: https://github.com/vuejs/core
- Version: v3.5.44, commit `bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c`
- License: MIT
- Used in (shipped in the `@vibejs-org/compiler` dist):
  - `packages/compiler/src/template/tokenizer.ts` from `packages/compiler-core/src/tokenizer.ts`
  - `packages/compiler/src/template/parser.ts` from `packages/compiler-core/src/parser.ts`, the parser options of `packages/compiler-dom/src/parserOptions.ts` and three helpers of `packages/compiler-core/src/utils.ts`
  - `packages/compiler/src/template/ast.ts` from the template nodes of `packages/compiler-core/src/ast.ts`
  - `packages/compiler/src/template/tags.ts` from `packages/shared/src/domTagConfig.ts` and `packages/shared/src/makeMap.ts`
  - `packages/compiler/src/style/pluginScoped.ts` from `packages/compiler-sfc/src/style/pluginScoped.ts`
- Used in (tests, not shipped):
  - `packages/compiler/src/template/parser.test.ts` from `packages/compiler-core/__tests__/parse.spec.ts`
  - `packages/compiler/src/sfc/parse.test.ts` from `packages/compiler-sfc/__tests__/parse.spec.ts`
  - `packages/compiler/src/style/pluginScoped.test.ts` from `packages/compiler-sfc/__tests__/compileStyle.spec.ts`
  - `packages/compiler/src/expr/transformExpression.test.ts` from `packages/compiler-core/__tests__/transforms/transformExpressions.spec.ts`

```text
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors

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

## fb55/htmlparser2

- Repository: https://github.com/fb55/htmlparser2
- License: MIT
- Used in: `packages/compiler/src/template/tokenizer.ts`, through the vuejs/core tokenizer, which is adapted from the htmlparser2 tokenizer and keeps its notice verbatim

```text
Copyright 2010, 2011, Chris Winberry <chris@winberry.net>. All rights reserved.
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
```
