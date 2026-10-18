export type ErrorCode = `VIBE${number}`;

export interface VibeErrorInit {
  code: ErrorCode;
  message: string;
  fixes: readonly string[];
  docs: string;
  args: Readonly<Record<string, string | number>>;
}

// A registry symbol, so errors from duplicate copies of this package are still recognized.
const BRAND = Symbol.for('vibejs.error');

export class VibeError extends Error {
  override name = 'VibeError';
  readonly code: ErrorCode;
  readonly fixes: readonly string[];
  readonly docs: string;
  readonly args: Readonly<Record<string, string | number>>;

  constructor(init: VibeErrorInit, options?: ErrorOptions) {
    super(init.message, options);
    this.code = init.code;
    this.fixes = init.fixes;
    this.docs = init.docs;
    this.args = init.args;
    Object.defineProperty(this, BRAND, { value: true });
  }
}

export function isVibeError(value: unknown, code?: ErrorCode): value is VibeError {
  return (
    typeof value === 'object' &&
    value !== null &&
    BRAND in value &&
    (code === undefined || ('code' in value && value.code === code))
  );
}
