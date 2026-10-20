// Upstream: vuejs/core@bf5f0dd877dd3c23ce85c2cbc1dd771567e84c8c packages-private/dts-test/ref.test-d.ts (MIT)
// Copyright (c) 2018-present, Yuxi (Evan) You and Vue contributors
//
// Edits: only the useTemplateRef cases of the upstream file; `expectType` became `expectTypeOf`.
import { expectTypeOf } from 'vitest';
import type { TemplateRef } from '../component.ts';
import type { Ref, ShallowRef } from '../reactivity/ref.ts';
import { useTemplateRef } from './templateRef.ts';

// A readonly shallow ref, null until rendered.
const input = useTemplateRef<HTMLInputElement>('input');
expectTypeOf(input).toEqualTypeOf<TemplateRef<HTMLInputElement>>();
expectTypeOf(input.value).toEqualTypeOf<HTMLInputElement | null>();
expectTypeOf(input).toExtend<Readonly<ShallowRef<HTMLInputElement | null>>>();
expectTypeOf(input).toExtend<Ref<HTMLInputElement | null>>();
// @ts-expect-error a template ref is readonly
input.value = null;
// @ts-expect-error a template ref is readonly
input.value = document.createElement('input');
expectTypeOf(useTemplateRef('x').value).toEqualTypeOf<unknown>();

// Ported cases.
expectTypeOf(useTemplateRef('foo')).toEqualTypeOf<TemplateRef>();
expectTypeOf(useTemplateRef<HTMLElement>('bar')).toEqualTypeOf<TemplateRef<HTMLElement>>();
