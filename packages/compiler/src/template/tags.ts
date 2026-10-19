// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/shared/src/domTagConfig.ts (MIT)
// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages/shared/src/makeMap.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Only the parts the parser fork imports: `makeMap` and the void tag list. Edits to re-apply on an
// upgrade: this header; the HTML, SVG and MathML tag lists are not copied (the parser has no
// `isNativeTag`); the build-tool comments are dropped; `makeMap` is module-local.

function makeMap(str: string): (key: string) => boolean {
  const map = Object.create(null)
  for (const key of str.split(',')) map[key] = 1
  return val => val in map
}

const VOID_TAGS =
  'area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr'

export const isVoidTag: (key: string) => boolean = makeMap(VOID_TAGS)
