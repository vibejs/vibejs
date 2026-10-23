# Third-party notices for @usevibejs/ui

`@usevibejs/ui` is MIT licensed. Code derived from other open-source projects is credited here with the upstream project, its license and its copyright notice. Each derived file starts with an `// Upstream: <repo>@<sha> <path> (<license>)` header.

## stackblitz/alien-signals

- Repository: https://github.com/stackblitz/alien-signals
- Version: 3.2.1, commit `8734d386d925025d0e99419bd9161c17b112c5ee`
- License: MIT
- Used in (shipped in the `@usevibejs/ui` dist):
  - `packages/ui/src/reactivity/system.ts`
- Used in (tests, not shipped):
  - `packages/ui/src/reactivity/conformance.test.ts`
  - `packages/ui/src/reactivity/system.test.ts`

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
- Used in (shipped in the `@usevibejs/ui` dist):
  - `packages/ui/src/dom-types.ts` (the DOM attribute and event types from `packages/runtime-dom/src/jsx.ts`, shipped in the dist types)
  - `packages/ui/src/reactivity/arrayInstrumentations.ts`
  - `packages/ui/src/reactivity/baseHandlers.ts`
  - `packages/ui/src/reactivity/collectionHandlers.ts`
  - `packages/ui/src/reactivity/dep.ts`
  - `packages/ui/src/reactivity/reactive.ts`
  - `packages/ui/src/runtime/app.ts`
  - `packages/ui/src/runtime/dom.ts`
  - `packages/ui/src/runtime/errorHandling.ts`
  - `packages/ui/src/runtime/events.ts`
  - `packages/ui/src/runtime/for.ts`
  - `packages/ui/src/runtime/inject.ts`
  - `packages/ui/src/runtime/lifecycle.ts`
  - `packages/ui/src/runtime/props.ts`
  - `packages/ui/src/runtime/scheduler.ts`
  - `packages/ui/src/runtime/templateRef.ts`
  - `packages/ui/src/runtime/vModel.ts`
  - `packages/ui/src/runtime/watch.ts`
- Used in (tests, not shipped):
  - `packages/ui/src/reactivity/collectionMap.test.ts`
  - `packages/ui/src/reactivity/collectionSet.test.ts`
  - `packages/ui/src/reactivity/collectionShallowReadonly.test.ts`
  - `packages/ui/src/reactivity/collectionWeakMap.test.ts`
  - `packages/ui/src/reactivity/collectionWeakSet.test.ts`
  - `packages/ui/src/reactivity/computed.test.ts`
  - `packages/ui/src/reactivity/effectScope.test.ts`
  - `packages/ui/src/reactivity/reactive.test.ts`
  - `packages/ui/src/reactivity/reactiveArray.test.ts`
  - `packages/ui/src/reactivity/readonly.test.ts`
  - `packages/ui/src/reactivity/ref.test.ts`
  - `packages/ui/src/reactivity/shallowReactive.test.ts`
  - `packages/ui/src/reactivity/shallowReadonly.test.ts`
  - `packages/ui/src/runtime/app.test.ts`
  - `packages/ui/src/runtime/dom.test.ts`
  - `packages/ui/src/runtime/errorHandling.test.ts`
  - `packages/ui/src/runtime/events.test.ts`
  - `packages/ui/src/runtime/inject.test.ts`
  - `packages/ui/src/runtime/lifecycle.test.ts`
  - `packages/ui/src/runtime/scheduler.test.ts`
  - `packages/ui/src/runtime/vModel.test.ts`
  - `packages/ui/src/runtime/watch.test.ts`
- Used in (type tests from `packages-private/dts-test`, not shipped):
  - `packages/ui/src/reactivity/computed.test-d.ts`
  - `packages/ui/src/reactivity/reactive.test-d.ts`
  - `packages/ui/src/reactivity/ref.test-d.ts`
  - `packages/ui/src/runtime/app.test-d.ts`
  - `packages/ui/src/runtime/inject.test-d.ts`
  - `packages/ui/src/runtime/templateRef.test-d.ts`
  - `packages/ui/src/runtime/watch.test-d.ts`
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
- Used in (shipped in the `@usevibejs/ui` dist):
  - `packages/ui/src/router/path.ts`
- Used in (tests, not shipped):
  - `packages/ui/src/router/matcher.test.ts`
  - `packages/ui/src/router/path.test.ts`

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
