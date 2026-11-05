import { describe, expect, test } from 'vitest';
import { thrownCode } from '../../test/codes.ts';
import { readServerState } from './serverState.ts';

describe('readServerState', () => {
  test('returns undefined when the document has no server state', () => {
    expect(readServerState()).toBeUndefined();
  });

  test('returns the parsed state from a chosen root', () => {
    const root = document.createElement('div');
    root.innerHTML = '<script type="application/json" id="vibe-state">{"ok":true}</script>';
    expect(readServerState(root)).toEqual({ ok: true });
  });

  test('throws VIBE5310 when the script is empty or not JSON', () => {
    const root = document.createElement('div');
    root.innerHTML = '<script type="application/json" id="vibe-state"></script>';
    expect(thrownCode(() => readServerState(root))).toBe('VIBE5310');
    root.innerHTML = '<script type="application/json" id="vibe-state">{</script>';
    expect(thrownCode(() => readServerState(root))).toBe('VIBE5310');
  });
});
