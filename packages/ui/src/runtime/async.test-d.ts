import { expectTypeOf } from 'vitest';
import type { ShallowRef } from '../reactivity/ref.ts';
import { useAsync } from './async.ts';

// A union shaped like the typed client's `ApiResult`.
type Result = { ok: true; data: { title: string } } | { ok: false; error: { code: string } };
declare const call: (input: undefined, options: { signal: AbortSignal }) => Promise<Result>;

const todo = useAsync((signal) => call(undefined, { signal }));
expectTypeOf(todo.data).toEqualTypeOf<Readonly<ShallowRef<Result | undefined>>>();
expectTypeOf(todo.error).toEqualTypeOf<Readonly<ShallowRef<unknown>>>();
expectTypeOf(todo.loading).toEqualTypeOf<Readonly<ShallowRef<boolean>>>();
expectTypeOf<ReturnType<typeof todo.refresh>>().toEqualTypeOf<Promise<void>>();

// The result narrows on `.ok`.
const value = todo.data.value;
if (value?.ok) expectTypeOf(value.data.title).toEqualTypeOf<string>();
else if (value) expectTypeOf(value.error.code).toEqualTypeOf<string>();

// The refs are read-only.
// @ts-expect-error data is read-only
todo.data.value = undefined;
// @ts-expect-error loading is read-only
todo.loading.value = false;
