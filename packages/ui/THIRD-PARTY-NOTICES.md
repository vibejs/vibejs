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
- Used in: `packages/ui/src/reactivity/reactive.ts`, `baseHandlers.ts`, `collectionHandlers.ts`, `arrayInstrumentations.ts` and `dep.ts` (the reactive proxies) and `packages/ui/src/runtime/scheduler.ts`, `errorHandling.ts` and `watch.ts` (the scheduler and watchers) and `dom.ts`, `events.ts`, `for.ts` and `vModel.ts` (the DOM setters, event modifiers, keyed list reconciliation and form models) and `app.ts`, `props.ts`, `inject.ts`, `lifecycle.ts` and `templateRef.ts` (the app API, emits and models, provide/inject, lifecycle hooks and template refs), shipped in the `@vibejs-org/ui` dist; `packages/ui/src/dom-types.ts` (the DOM attribute and event types from `packages/runtime-dom/src/jsx.ts`, shipped in the `@vibejs-org/ui` dist types); the ported runtime specs in `packages/ui/src/runtime/scheduler.test.ts`, `errorHandling.test.ts`, `watch.test.ts`, `dom.test.ts`, `events.test.ts`, `vModel.test.ts`, `lifecycle.test.ts`, `inject.test.ts` and `app.test.ts`; and the ported reactivity specs in `packages/ui/src/reactivity/ref.test.ts`, `computed.test.ts`, `effectScope.test.ts`, `reactive.test.ts`, `reactiveArray.test.ts`, `readonly.test.ts`, `shallowReactive.test.ts`, `shallowReadonly.test.ts`, `collectionMap.test.ts`, `collectionSet.test.ts`, `collectionWeakMap.test.ts`, `collectionWeakSet.test.ts` and `collectionShallowReadonly.test.ts` (tests, not shipped); and the ported type tests from `packages-private/dts-test` in `packages/ui/src/reactivity/ref.test-d.ts`, `computed.test-d.ts` and `reactive.test-d.ts` and `packages/ui/src/runtime/watch.test-d.ts`, `inject.test-d.ts`, `templateRef.test-d.ts` and `app.test-d.ts` (type tests, not shipped)
- `packages/runtime-dom/src/jsx.ts` is based on the DefinitelyTyped definitions in `types/react/index.d.ts` (https://github.com/DefinitelyTyped/DefinitelyTyped), published under the MIT license. Its upstream header credits the copyrights of the original definition to: AssureSign <http://www.assuresign.com>, Microsoft <https://microsoft.com>, John Reilly <https://github.com/johnnyreilly>, Benoit Benezech <https://github.com/bbenezech>, Patricio Zavolinsky <https://github.com/pzavolinsky>, Digiguru <https://github.com/digiguru>, Eric Anderson <https://github.com/ericanderson>, Dovydas Navickas <https://github.com/DovydasNavickas>, Josh Rutherford <https://github.com/theruther4d>, Guilherme Hübner <https://github.com/guilhermehubner>, Ferdy Budhidharma <https://github.com/ferdaber>, Johann Rakotoharisoa <https://github.com/jrakotoharisoa>, Olivier Pascal <https://github.com/pascaloliv>, Martin Hochel <https://github.com/hotell>, Frank Li <https://github.com/franklixuefei>, Jessica Franco <https://github.com/Jessidhia>, Saransh Kataria <https://github.com/saranshkataria>, Kanitkorn Sujautra <https://github.com/lukyth> and Sebastian Silbermann <https://github.com/eps1lon>.

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
