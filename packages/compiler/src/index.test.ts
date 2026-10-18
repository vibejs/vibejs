import * as compiler from '@vibejs-org/compiler';
import { describe, expect, it } from 'vitest';
import { formatDiagnostic } from './diagnostics.ts';

describe('@vibejs-org/compiler', () => {
  it('exports only formatDiagnostic at runtime', () => {
    expect({ ...compiler }).toStrictEqual({ formatDiagnostic });
  });
});
