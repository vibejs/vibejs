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

## packages/compiler

Details and the full license texts are in [`packages/compiler/THIRD-PARTY-NOTICES.md`](packages/compiler/THIRD-PARTY-NOTICES.md).

- **vuejs/core** v3.5.44 at `bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c`, MIT, Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors.
  - `packages/compiler/src/template/tokenizer.ts` from `packages/compiler-core/src/tokenizer.ts`
  - `packages/compiler/src/template/parser.ts` from `packages/compiler-core/src/parser.ts`, `packages/compiler-dom/src/parserOptions.ts` and `packages/compiler-core/src/utils.ts`
  - `packages/compiler/src/template/ast.ts` from `packages/compiler-core/src/ast.ts`
  - `packages/compiler/src/template/tags.ts` from `packages/shared/src/domTagConfig.ts` and `packages/shared/src/makeMap.ts`
  - `packages/compiler/src/style/pluginScoped.ts` from `packages/compiler-sfc/src/style/pluginScoped.ts`
  - `packages/compiler/src/template/parser.test.ts` from `packages/compiler-core/__tests__/parse.spec.ts` (tests, not shipped)
  - `packages/compiler/src/sfc/parse.test.ts` from `packages/compiler-sfc/__tests__/parse.spec.ts` (tests, not shipped)
  - `packages/compiler/src/style/pluginScoped.test.ts` from `packages/compiler-sfc/__tests__/compileStyle.spec.ts` (tests, not shipped)
- **fb55/htmlparser2**, MIT, Copyright 2010, 2011, Chris Winberry, through the vuejs/core tokenizer.
  - `packages/compiler/src/template/tokenizer.ts`

## packages/ui

Details and the full license texts are in [`packages/ui/THIRD-PARTY-NOTICES.md`](packages/ui/THIRD-PARTY-NOTICES.md).

- **stackblitz/alien-signals** 3.2.1 at `8734d386d925025d0e99419bd9161c17b112c5ee`, MIT, Copyright (c) 2024-present Johnson Chu.
  - `packages/ui/src/reactivity/system.ts` from `src/system.ts`
  - `packages/ui/src/reactivity/system.test.ts` from `tests/effect.spec.ts`, `tests/effectScope.spec.ts` and `tests/trigger.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/conformance.test.ts` from `tests/conformance.spec.ts` (tests, not shipped)
- **vuejs/core** v3.5.44 at `bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c`, MIT, Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors.
  - `packages/ui/src/reactivity/reactive.ts` from `packages/reactivity/src/reactive.ts` (shipped)
  - `packages/ui/src/reactivity/baseHandlers.ts` from `packages/reactivity/src/baseHandlers.ts` (shipped)
  - `packages/ui/src/reactivity/collectionHandlers.ts` from `packages/reactivity/src/collectionHandlers.ts` (shipped)
  - `packages/ui/src/reactivity/arrayInstrumentations.ts` from `packages/reactivity/src/arrayInstrumentations.ts` (shipped)
  - `packages/ui/src/reactivity/dep.ts` from `packages/reactivity/src/dep.ts` (shipped)
  - `packages/ui/src/runtime/scheduler.ts` from `packages/runtime-core/src/scheduler.ts` (shipped)
  - `packages/ui/src/runtime/errorHandling.ts` from `packages/runtime-core/src/errorHandling.ts` (shipped)
  - `packages/ui/src/runtime/watch.ts` from `packages/reactivity/src/watch.ts` and `packages/runtime-core/src/apiWatch.ts` (shipped)
  - `packages/ui/src/dom-types.ts` from `packages/runtime-dom/src/jsx.ts` (shipped in the dist types). Its attribute types are based on the DefinitelyTyped definitions in `types/react/index.d.ts`, MIT; the copyright holders are listed in `packages/ui/THIRD-PARTY-NOTICES.md`.
  - `packages/ui/src/reactivity/ref.test.ts` from `packages/reactivity/__tests__/ref.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/computed.test.ts` from `packages/reactivity/__tests__/computed.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/effectScope.test.ts` from `packages/reactivity/__tests__/effectScope.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/reactive.test.ts` from `packages/reactivity/__tests__/reactive.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/reactiveArray.test.ts` from `packages/reactivity/__tests__/reactiveArray.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/readonly.test.ts` from `packages/reactivity/__tests__/readonly.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/shallowReactive.test.ts` from `packages/reactivity/__tests__/shallowReactive.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/shallowReadonly.test.ts` from `packages/reactivity/__tests__/shallowReadonly.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/collectionMap.test.ts` from `packages/reactivity/__tests__/collections/Map.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/collectionSet.test.ts` from `packages/reactivity/__tests__/collections/Set.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/collectionWeakMap.test.ts` from `packages/reactivity/__tests__/collections/WeakMap.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/collectionWeakSet.test.ts` from `packages/reactivity/__tests__/collections/WeakSet.spec.ts` (tests, not shipped)
  - `packages/ui/src/runtime/scheduler.test.ts` from `packages/runtime-core/__tests__/scheduler.spec.ts` (tests, not shipped)
  - `packages/ui/src/runtime/errorHandling.test.ts` from `packages/runtime-core/__tests__/errorHandling.spec.ts` (tests, not shipped)
  - `packages/ui/src/runtime/watch.test.ts` from `packages/reactivity/__tests__/watch.spec.ts` and `packages/runtime-core/__tests__/apiWatch.spec.ts` (tests, not shipped)
  - `packages/ui/src/reactivity/collectionShallowReadonly.test.ts` from `packages/reactivity/__tests__/collections/shallowReadonly.spec.ts` (tests, not shipped)
- **vuejs/router** v4.6.4 at `47b95baae1ebdeb564bd1adf8168c9e9d6d09d0a`, MIT, Copyright (c) 2019-present Eduardo San Martin Morote.
  - `packages/ui/src/router/path.ts` from `packages/router/src/matcher/pathParserRanker.ts`
  - `packages/ui/src/router/path.test.ts` from `packages/router/__tests__/matcher/pathRanking.spec.ts` and `pathParser.spec.ts` (tests, not shipped)
  - `packages/ui/src/router/matcher.test.ts` from `packages/router/__tests__/matcher/resolve.spec.ts` (tests, not shipped)
