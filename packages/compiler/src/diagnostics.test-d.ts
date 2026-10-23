import type { ErrorCode } from '@usevibejs/errors';
import { expectTypeOf } from 'vitest';
import type { Diagnostic, Position } from './index.ts';

// The literal types of CONTRACTS.md C2.
interface C2Position {
  offset: number;
  line: number;
  column: number;
}
interface C2Diagnostic {
  code: ErrorCode;
  message: string;
  fixes: readonly string[];
  docs: string;
  file: string;
  start: C2Position;
  end: C2Position;
  typeChecked?: true;
}

expectTypeOf<Position>().toEqualTypeOf<C2Position>();
expectTypeOf<Diagnostic>().toEqualTypeOf<C2Diagnostic>();
expectTypeOf<C2Diagnostic>().toExtend<Diagnostic>();
expectTypeOf<Diagnostic>().toExtend<C2Diagnostic>();
expectTypeOf<Diagnostic['code']>().toEqualTypeOf<ErrorCode>();
expectTypeOf<Diagnostic['fixes']>().toEqualTypeOf<readonly string[]>();
