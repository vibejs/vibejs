import { expectTypeOf } from 'vitest';
import { isVibeError, VibeError, type ErrorCode } from './vibe-error.ts';

expectTypeOf<VibeError['code']>().toEqualTypeOf<ErrorCode>();
expectTypeOf<VibeError['fixes']>().toEqualTypeOf<readonly string[]>();
expectTypeOf<VibeError['args']>().toEqualTypeOf<Readonly<Record<string, string | number>>>();

declare const value: unknown;
if (isVibeError(value)) expectTypeOf(value).toEqualTypeOf<VibeError>();

// @ts-expect-error codes have the form VIBE<number>
const code: ErrorCode = 'E0001';
expectTypeOf(code).toBeString();
