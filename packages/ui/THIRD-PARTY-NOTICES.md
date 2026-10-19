# Third-party notices for @vibejs-org/ui

`@vibejs-org/ui` is MIT licensed. Code derived from other open-source projects is credited here with the upstream project, its license and its copyright notice. Each derived file starts with an `// Upstream: <repo>@<sha> <path> (<license>)` header.

## stackblitz/alien-signals

- Repository: https://github.com/stackblitz/alien-signals
- Version: 3.2.1, commit `8734d386d925025d0e99419bd9161c17b112c5ee`
- License: MIT
- Used in: `packages/ui/src/reactivity/system.ts` (the reactive graph core, shipped in the `@vibejs-org/ui` dist) and the ported specs in `packages/ui/src/reactivity/system.test.ts` and `conformance.test.ts`

```text
MIT License

Copyright (c) 2024-present Johnson Chu

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

## vuejs/core

- Repository: https://github.com/vuejs/core
- Version: v3.5.44, commit `bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c`
- License: MIT
- Used in: `packages/ui/src/reactivity/reactive.ts`, `baseHandlers.ts`, `collectionHandlers.ts`, `arrayInstrumentations.ts` and `dep.ts` (the reactive proxies, shipped in the `@vibejs-org/ui` dist) and the ported reactivity specs in `packages/ui/src/reactivity/ref.test.ts`, `computed.test.ts`, `effectScope.test.ts`, `reactive.test.ts`, `reactiveArray.test.ts`, `readonly.test.ts`, `shallowReactive.test.ts`, `shallowReadonly.test.ts`, `collectionMap.test.ts`, `collectionSet.test.ts`, `collectionWeakMap.test.ts`, `collectionWeakSet.test.ts` and `collectionShallowReadonly.test.ts` (tests, not shipped)

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

## vuejs/router

- Repository: https://github.com/vuejs/router
- Version: v4.6.4, commit `47b95baae1ebdeb564bd1adf8168c9e9d6d09d0a`
- License: MIT
- Used in: `packages/ui/src/router/path.ts` (the path scores and the score comparator, shipped in the `@vibejs-org/ui` dist) and the ported specs in `packages/ui/src/router/path.test.ts` and `matcher.test.ts` (tests, not shipped)

```text
The MIT License (MIT)

Copyright (c) 2019-present Eduardo San Martin Morote

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
